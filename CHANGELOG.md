# Changelog

All notable changes to this project will be documented in this file.

Update this file with every major architecture change, feature, parser behavior
change, breaking change, or significant fix. Record what changed and why under
`Unreleased`; routine formatting and minor refactoring do not need entries.
Keep planned work separate from completed changes, and move completed entries
into a dated version section when releasing.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Canara Bank e-Passbook parser - 2026-09-22
- Added a Canara Bank parser for the verified five-column "e-Passbook" layout
  (Date, Particulars, Deposits, Withdrawals, Balance). Transaction direction
  comes from the dedicated Deposits/Withdrawals columns, never from narration.
- Added block reconstruction for the template's inverted wrapping: narration
  wraps above the dated anchor line, continuation lines follow below it, and a
  Chq reference line closes each block. Blocks without a Chq line close through
  line spacing (~12pt within a block, ~24pt between blocks). Empty Chq markers
  leave the reference unset instead of failing the row.
- Added closing-balance reconciliation alongside the existing opening-balance
  check: the statement's Opening Balance row is checked against the first
  transaction and the Closing Balance row against the last, reporting a
  `balance_mismatch` warning on divergence.
- Added Canara Bank to the browser harness bank dropdown. The worker selects
  the parser by the chosen bank. SBI and Kerala Gramin Bank remain listed for
  testing until parsers exist and are disabled with a clear message.
- Verified the parser against one real fifteen-page e-Passbook statement: all
  98 candidate rows accepted, zero rejected, with the running balance chain
  reconciling independently and opening/closing balances matching. The
  statement's one out-of-order reversal entry (dated between the rows around
  it) is reported as a `date_order` warning for review, not reordered.
- Added fictional Canara fixtures and regression tests covering column
  reconstruction from positions, narration wrapping above and below the anchor,
  line-spacing block closure, repeated headers, multipage, opening and closing
  reconciliation, malformed rows, bank evidence outside narration, shifted
  layouts, summary pages, width scaling, footer-region rows, and unassigned
  table text.

### Added - Bank selection and Kotak Mahindra parser - 2026-09-22
- Added a Kotak Mahindra Bank savings-account parser for the verified
  seven-column "Savings Account Transactions" layout. Transaction direction comes
  from the dedicated Withdrawal/Deposit columns, never from narration. Supports
  wrapped narration and reference merging, repeated headers, multiple pages, and
  a fixed footer region. Summary and information pages without the table do not
  raise errors; dated rows outside the supported table area are reported for
  review instead of being silently dropped.
- Added Opening Balance reconciliation: the parsed opening balance is checked
  against the first transaction, reporting a `balance_mismatch` warning on
  divergence.
- Added month-name date support ("07 May 2025", "01-Mar-2025") to date
  normalization, validated as calendar dates.
- Added a bank dropdown to the browser harness. Union Bank and Kotak Mahindra
  Bank statements are processed locally; SBI and Kerala Gramin Bank remain listed
  for testing until parsers exist and are disabled with a clear message. The
  worker selects the parser by the chosen bank and reports `unsupported_bank`
  when no parser exists.
- Verified the Kotak parser against one real four-page savings statement: all 32
  transactions accepted, zero rejected, with full running-balance reconciliation
  and no issues.
- Added fictional Kotak fixtures and regression tests covering column
  reconstruction from positions, wrapping, repeated headers, multipage, malformed
  rows, bank evidence outside narration, shifted layouts, summary pages, width
  scaling, opening-balance reconciliation, and footer-region rows.

### Added - JavaScript parser foundation
- Added JavaScript ES modules with JSDoc contracts for extracted pages,
  normalized transactions, account context, source locations, and results.
  Use JavaScript initially; migrate to TypeScript later while retaining the
  architecture and regression tests. Migration is planned, not completed.
- Added local PDF.js extraction with separate missing/incorrect-password errors,
  positioned text, page progress, and resource cleanup. Textless scans report
  unsupported OCR rather than returning an empty success.
- Added one explicitly selected Union Bank parser for the available five-column
  "Details of Statement" layout. Union is the first bank because an actual
  statement is available, replacing SBI as the initial candidate. Support wrapped
  narration within pages, repeated headers, explicit debit/credit markers, signed
  balances, and row/layout issues; do not guess transaction direction.
- Added integer-paise normalization, calendar-date validation, account/model
  checks, and running-balance reconciliation. Processing reports success,
  partial success, or failure and excludes invalid transactions.
- Added a processing service, cancellable worker boundary, and a small Vite
  browser harness for local-file processing and JSON inspection. Bundle the
  PDF.js worker locally; keep parsing independent of the interface.
- Added fictional fixtures and local regression tests, plus an opt-in actual-PDF
  comparison that keeps private statement data and passwords outside Git.
- Added architecture and runtime walkthrough documents covering PDF.js calls,
  module execution, tests, and temporary inspection files versus browser runtime.

### Changed - Private statement handling
- Ignore PDFs, local statement folders, and temporary inspection/output files.
  Vite also denies access to private PDFs and folders: Git ignore rules alone
  do not control HTTP access.
- Verified one supplied password-protected, two-page Union statement against
  independent expected data: all 28 transactions matched with no validation
  issues. More real variations and browser interaction verification are still
  required before claiming broad support.

### Changed - PatBook v2 revamp
- Cleared the legacy application, designs, debug scripts, parser tests, and
  automation from the v2 working baseline. The existing implementation remains
  preserved on `legacy/v1` with its Git history.
- Retained README.md, CHANGELOG.md, LICENSE, and .gitignore as the minimal baseline.
- Replaced the README with the PatBook v2 development plan. No new parser or
  application implementation is included yet.
- Use PatBook v2 / v2 revamp as the restart name; client-side processing describes
  its architecture. The cleanup branch is `chore/v2-revamp`, targeting `main`.

### Project status - 2026-09-22
- Union Bank (five-column "Details of Statement"), Kotak Mahindra Bank
  (seven-column "Savings Account Transactions"), and Canara Bank (five-column
  "e-Passbook") parsers are implemented and each verified against one real
  statement. SBI and Kerala Gramin Bank are listed in the interface for testing
  but have no parsers yet. Parser correctness requires verification against
  more real statement variations before claiming broad support.
- Automatic bank detection, multiple-statement merging, account analytics, demo
  mode, and internal-transfer detection remain deferred.

### Project status - 2026-09-18
- All eight legacy bank parsers (HDFC, Canara, Union Bank, Federal Bank, SBI,
  Kotak, PNB, and Kerala Gramin Bank) are still under development. Their presence
  in the application does not establish reliable support for every statement
  variation; parser correctness requires verification against real statements.
- The existing React + FastAPI implementation is preserved on `legacy/v1`
  as a reference. The v2 Union parser foundation is now implemented; broader
  statement coverage and browser interaction verification remain pending.
- `main` is now the GitHub default branch for the PatBook v2 revamp.
  `legacy/v1` preserves the existing implementation; `develop` is retained
  temporarily while external references are checked. Restart feature branches
  will target `main`.

### Planned PatBook v2 revamp - decisions recorded 2026-09-18
- Build a local-first financial analysis system with PDF processing on the
  user's device, preserving the existing implementation.
- Begin with one bank and one actual statement. SBI is the initial candidate;
  confirm the choice using available statements rather than assuming the
  existing parser is reliable. Add statement variations and regression tests
  before expanding to another bank.
- Separate PDF extraction, bank-specific parsing, normalized domain data,
  validation, and processing services. React will consume service results
  rather than parse bank statements directly.
- Start with explicit bank selection and normalized transaction JSON. Report
  successful, partial, and failed processing with issues for rows requiring
  review; do not silently discard ambiguous rows.
- Defer automatic bank detection, multiple-statement merging, multiple-bank
  support, account analytics, demo mode, internal-transfer detection, and other
  product features until the first parser pipeline is verified.
- Defer CI/CD and hosting automation during early development. Run relevant
  tests and checks locally; parser regression tests remain part of the plan.

### Removed
- Legacy GitHub Actions CI (`.github/workflows/ci.yml`) and scheduled Render
  keepalive pings (`.github/workflows/ping.yml`) from the restart branch.
- Legacy Render deployment blueprint (`render.yaml`). This file removal does
  not disable services or deployment integrations already configured externally.
- Legacy v1 changelog entries (Streamlit, then React + FastAPI with eight
  unfinished parsers, analytics integrations, and deployment automation). That
  history is preserved in Git on the `legacy/v1` branch.