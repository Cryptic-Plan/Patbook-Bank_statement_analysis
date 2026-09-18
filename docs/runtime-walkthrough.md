# How the code executes

## Source files and startup

`src/` means source code. The folder name does not make code execute. Modules run
when imported by an entry point or loaded by a worker.

`browser/index.html` loads `browser/main.js`. Vite serves and bundles the modules;
it is build/development tooling, not a financial-data backend. Mozilla's library
is installed in `node_modules/pdfjs-dist/`; our wrapper is `src/extraction/pdf.js`.
There is no React application yet.

```text
browser/index.html → browser/main.js
                      ↓ submit event
src/services/browser-processing.js
                      ↓ Worker + transferred buffer
src/workers/statement.worker.js
                      ↓
src/services/process-statement.js
     ├─ src/extraction/pdf.js → PDF.js → positioned text
     ├─ src/parsers/union/parser.js → normalized candidates
     └─ src/validation/transactions.js → accepted transactions + issues
                      ↓ worker message
browser/main.js → summary + JSON rendered as plain text
```

## 1. Register handlers, then wait for submit

[main.js](../browser/main.js) imports the browser service and CSS and registers
form, cancellation, and change handlers. Registration does not process anything.
On submit, it reads the selected `File`, creates an `AbortController`, and calls
`processLocalFile()` with password, account label, progress callback, and signal.
It clears the password input after starting the call.

## 2. Read bytes and create a worker

[processLocalFile()](../src/services/browser-processing.js) awaits
`file.arrayBuffer()`, creates a module worker, and posts bytes and context.
The `[buffer]` transfer list moves ownership instead of copying the complete file;
the sender's buffer becomes detached. This is local worker messaging, not HTTP.

On result, error, or cancellation, the controller removes the abort listener and
terminates the worker. A retry creates a fresh worker and reads fresh file bytes.

## 3. Compose the pipeline inside the worker

[statement.worker.js](../src/workers/statement.worker.js) imports PDF.js and
creates its nested worker from a bundled local asset. An explicit worker port
avoids PDF.js's default worker setup assuming `window` exists.

`createPdfExtractor(pdfjs)` returns an extractor function.
`createStatementProcessor({ extractPdf, parser: unionParser })` returns a processor
function. These factory calls configure dependencies; they do not process files.
Processing begins when the registered `self.onmessage` handler receives bytes.

The handler hashes original bytes before PDF.js can take ownership, invokes the
service, and posts its normalized result. The nested worker is terminated after
the attempt. Passwords never appear in result messages.

## 4. PDF.js opens and extracts the PDF

[pdf.js](../src/extraction/pdf.js) calls:

```js
const loadingTask = pdfjs.getDocument({ data: bytes, password, isEvalSupported: false });
const pdf = await loadingTask.promise;
```

PDF.js interprets PDF objects, page references, resources, and encryption
information. Protected documents need a valid password to obtain the decryption
key. Missing/incorrect passwords reject loading; our wrapper maps those errors
to actionable codes while hiding library internals.

Loading is not the same as extracting all page text. For each page:

```js
const page = await pdf.getPage(number);
const content = await page.getTextContent();
```

PDF.js interprets page text operations and font mappings to produce strings with
positions. It does not return bank transactions or table rows. Internally its
text API streams chunks and collects them into `content.items`. See Mozilla's
[loading API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html) and
[page API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html).

Our wrapper converts item positions to top-left viewport coordinates and returns
`{ pages }`, an object in memory. Pages are cleaned up and the loading task is
destroyed even on failure. Textless PDFs report `no_text`; OCR is not implemented.

## 5. Union interprets the text and normalizes rows

[groupLines()](../src/extraction/lines.js) groups similar vertical baselines and
sorts each line left-to-right. Line numbers are reconstructed text lines, not
transaction numbers.

[unionParser.parse()](../src/parsers/union/parser.js) checks statement/account
evidence before the table. The supplied logo is an image, so a labeled Union IFSC
field is alternate evidence. Counterparty mentions in narration are insufficient.
It checks five headers and their expected column regions, accumulates wrapped
cells, and flushes a pending row when the next dated row starts.

It validates the date, reads explicit `(Dr)/(Cr)` direction, and normalizes money.
Missing markers are errors, not guessed debits. [parseRupees()](../src/domain/normalization.js)
uses exact integer arithmetic and checks safe range. `parseBankDate()` checks
calendar validity. The parser adds account context and source coordinates.
Invalid rows become review issues rather than guessed transactions.

## 6. Validate and return to the interface

[validateTransactions()](../src/validation/transactions.js) enforces the JSDoc
contract at runtime: identity, date, account, currency, integer money, direction,
and source. Duplicate row IDs are excluded. Consecutive balances reconcile with
exact integer arithmetic. A mismatch is a warning; values are never corrected
silently. Without opening metadata, the first row's opening balance is unchecked.

[processStatement()](../src/services/process-statement.js) combines issues and
chooses success, partial success, or failure. The worker posts that result, the
controller resolves its promise, and the page renders it using `textContent`.
Bank narration is plain text, never executable HTML.

## What is tmp/?

`tmp/pdfs/` was explicitly created by a separate Python inspection command during
development. It holds decrypted text/tables (`inspection.json`), independent
expected transactions (`expected.json`), and a rendered page image. PDF.js and
the application did not create these files.

```text
Development inspection: PDF → Python tools → tmp/pdfs/
Application runtime:    PDF → PDF.js → in-memory objects → Union parser
```

These files are ignored by Git, which does not encrypt them. Deleting `tmp/`
does not break the application. The opt-in private test uses an expected file
only when deliberately enabled. The temporary Python environment and caches in
`/private/tmp/` are development tools, not browser dependencies.

The Vite server also denies HTTP access to private PDFs and inspection folders,
Git files, and environment files. Production output contains application assets.

## Test execution

`package.json` uses Node's built-in runner: `node --test tests/*.test.js`.
Each test imports modules and executes assertions. Node is a test runtime;
application processing remains browser-side.

| File | What it checks |
| --- | --- |
| `normalization.test.js` | Paise conversion, malformed values, calendar dates |
| `union-parser.test.js` | Fictional positioned data, wrapping, headers, layout and row errors |
| `validation.test.js` | Account/model checks, duplicates, balances, date order |
| `processing.test.js` | Service coordination, statuses, issues and row counts |
| `extraction.test.js` | PDF wrapper with a controlled library replacement; errors and cleanup |
| `browser-processing.test.js` | Controller unit tests using a fake Worker |
| `private-statement.test.js` | Actual PDF.js and comparison to independent private expected data |

`tests/fixtures/union/documents.js` contains fictional data, not real statement
contents. The private test skips unless `PATBOOK_TEST_PDF` and
`PATBOOK_TEST_EXPECTED` environment variables provide paths. Use
`PATBOOK_TEST_PASSWORD` for a protected PDF; never commit an actual password.

Expected JSON is an independently checked array in statement order, with `date`,
`reference`, `description`, `amountPaise`, `type`, and `balancePaise`. The private
test compares every field, count, and success status, and checks missing/wrong
password handling when a password is supplied. Difference logs do not print
private transaction details.

Mocks do not prove browser worker execution; a build proves bundling. Browser
automation was unavailable during initial implementation. Manually check:

1. Open the page and select the real statement.
2. Submit without a password; confirm the password-required issue.
3. Submit an incorrect password; confirm retry remains possible.
4. Submit the correct password; inspect count, issues, and JSON.
5. Inspect Network: local application/worker assets, no PDF upload.
6. Cancel a sufficiently large file and confirm the interface recovers.
7. Select another PDF; old results and the password must clear.
