**`src/` contains the processing engine.** It reads a local PDF, converts its contents into transactions, validates them, and returns data to the interface.

There are nine files:

```text
src/
├── domain/
│   ├── contracts.js
│   └── normalization.js
├── extraction/
│   ├── pdf.js
│   └── lines.js
├── parsers/
│   └── union/
│       └── parser.js
├── validation/
│   └── transactions.js
├── services/
│   ├── browser-processing.js
│   └── process-statement.js
└── workers/
    └── statement.worker.js
```

Their runtime connection is:

```text
Browser page submits a file
  ↓
browser-processing.js
  ↓ starts a worker
statement.worker.js
  ↓
process-statement.js
  ├─ pdf.js → PDF.js library → extracted page items
  ├─ parser.js
  │    ├─ lines.js
  │    └─ normalization.js
  └─ transactions.js
  ↓
Result returns through the worker to the browser page
```

Let’s follow that order.

**1. [services/browser-processing.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/services/browser-processing.js>) connects the browser to the processing engine.**

Its exported function is:

```js
processLocalFile(file, {
  password,
  account,
  signal,
  onProgress
})
```

The browser page calls this when you submit the form.

Its inputs are:

| Input | Meaning |
|---|---|
| `file` | The browser’s `File` object from your selection |
| `password` | Optional PDF password |
| `account` | Local account identity and bank/currency |
| `signal` | Cancellation signal |
| `onProgress` | Function the service calls with progress updates |

First, it reads the selected file:

```js
const buffer = await file.arrayBuffer();
```

`buffer` contains binary PDF bytes in memory. Nothing is saved into `tmp/`.

It then starts the PatBook worker:

```js
const worker = new Worker(
  new URL("../workers/statement.worker.js", import.meta.url),
  { type: "module" }
);
```

`import.meta.url` identifies this module’s location. The relative URL points to the worker module; Vite handles bundling that reference.

Then it sends a message:

```js
worker.postMessage(
  { buffer, password, account },
  [buffer]
);
```

The transfer list `[buffer]` moves ownership of the buffer to the worker. It avoids copying the entire PDF.

The function returns a Promise and waits for messages:

```js
worker.onmessage = ({ data }) => {
  if (data.kind === "progress") onProgress(data.progress);
  if (data.kind === "result") finish(resolve, data.result);
  if (data.kind === "error") finish(reject, new Error(data.message));
};
```

`finish()` removes the cancellation listener, terminates the worker, and settles that Promise.

One distinction matters: a successfully delivered result can contain `status: "failed"` because the password was wrong or the layout was unsupported. That **resolves** the Promise with a processing result. A worker failure or cancellation **rejects** it.

---

**2. [workers/statement.worker.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/workers/statement.worker.js>) sets up and runs the pipeline away from the interface thread.**

This file runs when `new Worker(...)` loads it.

At startup, it imports:

```js
import * as pdfjs from "pdfjs-dist";
import { createPdfExtractor } from "../extraction/pdf.js";
import { unionParser } from "../parsers/union/parser.js";
import { createStatementProcessor } from "../services/process-statement.js";
```

These are the dependencies needed to assemble the engine.

It also starts PDF.js’s own worker and provides its port:

```js
const libraryWorker = new Worker(pdfWorkerUrl, {
  type: "module"
});

pdfjs.GlobalWorkerOptions.workerPort = libraryWorker;
```

There are therefore two responsibilities:

```text
PatBook worker → service, bank parser, validation
PDF.js worker  → PDF-format processing
```

Next, it configures the service:

```js
const processStatement = createStatementProcessor({
  extractPdf: createPdfExtractor(pdfjs),
  parser: unionParser
});
```

**This configures functions; it does not process a statement yet.**

Processing begins when this registered handler receives the browser’s message:

```js
self.onmessage = async ({ data }) => {
  // Processing happens here.
};
```

`self` is the worker’s global object. A worker has no page DOM to update.

The handler:

1. Wraps the received buffer in a `Uint8Array`.
2. Calculates a SHA-256 fingerprint of the original PDF.
3. Uses that fingerprint as `statementId`.
4. Calls `processStatement()`.
5. Sends progress and results back with `self.postMessage()`.
6. Terminates the PDF.js worker and drops its references.

Hashing happens before extraction because PDF.js can take ownership of the bytes.

---

**3. [services/process-statement.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/services/process-statement.js>) coordinates the stages.**

This is the central processing service:

```js
createStatementProcessor({ extractPdf, parser })
```

It returns another function:

```js
async function processStatement({
  bytes,
  password,
  account,
  statementId,
  onProgress
})
```

That two-step pattern lets us configure the dependencies once and process a request later.

The service first checks the input:

- Are the bytes nonempty?
- Is there a statement identity?
- Is the account identity valid?
- Does the account’s bank match the configured parser?
- Is the currency INR?

Then it executes:

```js
document = await extractPdf(bytes, {
  password,
  onProgress
});

const context = { account, statementId };

const parsed = parser.parse(document, context);

const validated = validateTransactions(
  parsed.transactions,
  context
);
```

Notice how each stage gets the previous stage’s output:

```text
bytes → extracted document → candidate transactions → validated transactions
```

The service combines parsing and validation issues, then chooses the status:

```js
status:
  transactions.length === 0
    ? "failed"
    : issues.length
      ? "partial_success"
      : "success"
```

It returns:

```js
{
  status,
  transactions,
  issues,
  summary: {
    pages,
    candidateRows,
    accepted,
    rejected
  }
}
```

It does not update the page or manage workers. That is why we can test it directly in Node.

---

**4. [extraction/pdf.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/extraction/pdf.js>) converts PDF bytes into positioned text.**

This file is our wrapper around Mozilla’s PDF.js library.

Its factory:

```js
createPdfExtractor(pdfjs)
```

returns:

```js
async function extractPdf(bytes, {
  password,
  onProgress
})
```

We pass `pdfjs` into it rather than importing the library inside this file. Tests can therefore supply a controlled replacement, while the real worker supplies Mozilla’s library.

The extractor opens the document:

```js
const loadingTask = pdfjs.getDocument({
  data: bytes,
  password,
  isEvalSupported: false
});

const pdf = await loadingTask.promise;
```

Then it loops through the pages:

```js
for (let number = 1; number <= pdf.numPages; number++) {
  const page = await pdf.getPage(number);
  const content = await page.getTextContent();
}
```

PDF.js returns strings and their positions. Our wrapper simplifies each text item:

```js
const [x, y] = viewport.convertToViewportPoint(
  item.transform[4],
  item.transform[5]
);

return {
  text: item.str,
  x,
  y,
  width: item.width,
  height: item.height
};
```

The viewport converts the position into a top-left page coordinate system. Keeping coordinates lets the bank parser distinguish columns.

The output is:

```js
{
  pages: [
    {
      number: 1,
      width: 595.275,
      height: 841.875,
      items: [
        // Positioned text objects
      ]
    }
  ]
}
```

This file knows nothing about debit, credit, narration, or bank transaction dates.

It also maps PDF errors to our own `ExtractionError`, which carries a `code` and safe message. Examples are `password_required`, `incorrect_password`, and `no_text`.

The `finally` blocks clean up pages and destroy the loading task, including when an error occurs.

---

**5. [extraction/lines.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/extraction/lines.js>) reconstructs lines from positioned items.**

PDF text items may arrive in an order that differs from how you visually read the page.

`groupLines(page, tolerance = 2)`:

1. Copies the item array and removes blank items.
2. Sorts by `y`, then `x`.
3. Groups items whose vertical positions differ by no more than the tolerance.
4. Sorts each group from left to right.
5. Creates a combined line string while retaining the original item positions.

The result resembles:

```js
{
  y: 428,
  number: 20,
  items: [
    // Individual positioned items
  ],
  text: "01-08-2026 EXAMPLE001 Example payment 500.00(Dr) ..."
}
```

`number` is a reconstructed page-text line number. It is not a transaction number.

The Union parser calls this helper before interpreting the table.

---

**6. [parsers/union/parser.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/parsers/union/parser.js>) interprets the bank’s table.**

This contains the bank-specific rules:

```js
export const unionParser = {
  bankId: "union",

  parse(document, { account, statementId }) {
    // Interpret extracted content.
  }
};
```

It receives extracted pages—not a PDF file or password.

First, it reconstructs the lines and checks bank evidence before the table. It accepts Union Bank wording or the labeled Union IFSC field. A counterparty mentioning Union Bank inside a transaction is insufficient.

Next, `isHeader()` looks for:

```text
Date | Transaction Id | Remarks | Amount | Balance
```

`columns()` assigns text items to five cells using their horizontal positions:

```js
const edges = [77, 146, 438, 504]
  .map(x => x * width / 595.275);
```

These boundaries come from the inspected layout. They are scaled with page width and are **specific to this template**.

The parser uses a `pending` row to handle wrapping:

```text
Dated line       → start pending row
Continuation    → append cells to pending row
Next dated line → finish previous row, start another
End of page     → finish final row
```

The internal `flush()` function finishes the pending row. It captures `pending`, the current page, and the output arrays from its surrounding scope.

When flushing, it:

- Converts the bank date.
- Parses amount and balance markers.
- Checks required details.
- Creates a normalized transaction.
- Adds page/line provenance.

`markedAmount()` requires explicit direction:

```text
500.00(Dr) → debit, 50000 paise
500.00(Cr) → credit, 50000 paise
500.00     → error: no direction marker
```

If a row cannot be interpreted, it creates an `invalid_row` issue instead of guessing.

Its output contains candidate transactions, parsing issues, and the number of recognized candidate rows. Validation happens afterward.

---

**7. [domain/normalization.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/domain/normalization.js>) provides conversion helpers.**

It exports three functions:

| Function | Input | Output |
|---|---|---|
| `parseRupees()` | `"1,234.56"` | `123456` paise |
| `parseBankDate()` | `"03-08-2026"` | `"2026-08-03"` |
| `isCalendarDate()` | `"2026-02-30"` | `false` |

`parseRupees()` validates the string, removes grouping commas, and separates whole rupees from the fraction:

```js
const paise =
  BigInt(whole) * 100n +
  BigInt(fraction.padEnd(2, "0"));
```

It checks the safe numeric range before returning a regular number. This avoids multiplying a floating-point rupee value by 100.

`isCalendarDate()` checks both the string format and calendar validity. JavaScript can roll an impossible date into another month, so it compares the resulting year, month, and day with the requested values.

`parseBankDate()` currently handles `DD-MM-YYYY`. That is the format supported by this first parser—not every bank date format.

---

**8. [validation/transactions.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/validation/transactions.js>) checks the normalized candidates.**

Its function is:

```js
validateTransactions(candidates, {
  account,
  statementId
})
```

It checks required fields, calendar dates, integer money, direction, account identity, currency, and source location.

A `Set` tracks transaction IDs so the same row ID cannot appear twice within a result.

Structurally invalid candidates are excluded and produce an `invalid_transaction` issue.

For valid consecutive transactions, it checks:

```text
Previous balance + credit amount = current balance
Previous balance − debit amount  = current balance
```

A mismatch creates a warning. The transaction remains available for review; validation does not rewrite its financial values.

It also flags reverse chronological order. Without known opening-balance metadata, it cannot verify the first transaction against an opening balance.

The output is:

```js
{
  transactions, // Accepted candidates
  issues
}
```

---

**9. [domain/contracts.js](</Users/athulthomas/Desktop/personal projects/Patbook-Bank_statement_analysis/src/domain/contracts.js>) documents the shared object shapes.**

This file defines JSDoc types such as:

```js
/**
 * @typedef {Object} Transaction
 * @property {string} date
 * @property {number} amountPaise
 * @property {'debit'|'credit'} type
 */
```

It describes `Transaction`, `AccountContext`, `ExtractedDocument`, `BankParser`, and processing results.

**These comments do not validate data at runtime.** They help your editor understand the code and establish contracts for the later TypeScript migration.

The file creates no transaction objects and runs no processing. Its `export {}` makes it an ES module.

The separation lets us change one part with a clear boundary: a new bank parser consumes extracted content and produces the same transaction model; the service, validator, and interface can continue using their existing contracts.
