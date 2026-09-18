# PatBook v2: parser foundation

## Decisions

- Use JavaScript ES modules now. Describe shared data with JSDoc and enforce
  financial invariants at runtime. Migrate to TypeScript later while retaining
  the processing boundaries and regression tests.
- Start with Union Bank because an actual password-protected statement is
  available. The first supported format is the five-column "Details of
  Statement" layout: Date, Transaction Id, Remarks, Amount, Balance.
- Bank selection is explicit. Union checks statement evidence and the expected
  layout; there is no automatic parser registry yet.
- Process local PDF bytes using bundled PDF.js. Documents and passwords are not
  sent to a backend, bank API, or CDN. No persistence or telemetry is implemented.
- Separate interface, extraction, bank parsing, domain, validation, and services.
  The interface calls a processing service; it imports neither PDF.js nor bank
  parsers. React can eventually call that same service.
- Run processing in a Web Worker so parsing and validation do not occupy the
  interface thread. Supply PDF.js an explicit nested worker instead of relying
  on its default window-based setup.
- Keep real statements and independent expected data outside Git. Use fictional
  regression fixtures in the repository.

## Data model

See [contracts.js](../src/domain/contracts.js).

Money is a safe integer in paise (`amountPaise`, `balancePaise`). Amount is positive;
direction belongs in `type`. Balances may be negative for overdrafts. Currency is
currently INR. Exact decimal-string conversion avoids float multiplication.

`date` is an ISO calendar-date string (`YYYY-MM-DD`), not a timezone-based instant.
`accountId` comes from an explicit local account context. The harness uses an
account label, without saving or automatically inferring a bank account number.

`source` identifies the statement, page, and reconstructed text line. IDs use a
SHA-256 fingerprint of the original PDF plus page/line coordinates. They identify
rows, not duplicate financial events across overlapping statements. IDs may
change if extraction/layout rules change.

Descriptions retain bank narration with normalized whitespace. Merchant renaming,
categories, analytics, and transfer inference are deferred.

## Processing contract

The extractor accepts bytes and an optional password and returns positioned text.
It does not interpret financial data. A bank parser accepts that content plus
account/statement context and returns candidates, issues, and candidate-row count.
It does not open PDFs, access browser storage, or render an interface.

The service validates candidates and returns:

| Status | Meaning |
| --- | --- |
| `success` | At least one valid transaction; no reported issues |
| `partial_success` | Valid transactions with rejected rows or review issues |
| `failed` | No valid transactions or processing could not proceed |

Only validated transactions appear in `transactions`. A running-balance warning
makes the result partial without changing any values. Issue count is not a count
of distinct transactions requiring review: one row can have several issues, and
an unreadable page contains an unknown number of rows.

`summary.rejected` counts recognized candidate rows not returned as transactions.
It cannot count rows that were never readable; always inspect issues too. The
first running balance is not reconciled without a known opening balance;
opening/closing statement metadata extraction is not implemented yet.

## Current limits

Process one statement at a time. Cancellation terminates its worker. Passwords
are cleared from the form after submission and excluded from output and storage.
JavaScript cannot guarantee immediate secure erasure of a password string.

Union uses template-specific column boundaries and a footer region. Changed
headers, unassigned text, and dated rows outside that region produce issues.
Narration wrapping is supported within a page; transactions split across pages
require review. Scans need OCR, which is not implemented. Reverse date order is
flagged instead of silently reordered.

One real statement has been verified. Synthetic fixtures exercise other cases,
but more independently checked real Union layouts are required before broad
support can be claimed. Browser interactions still require manual verification.

## Later work

TypeScript migration, more real Union variations, opening/closing balance
validation, then a transaction UI. Multi-statement merging, other banks,
automatic detection, full account management, analytics, internal transfers,
exports, demo mode, and offline installation follow separately.
