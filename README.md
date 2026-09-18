# PatBook v2

A local-first financial analysis project under development.

## Development status

The v2 revamp has a JavaScript parser foundation and a small browser test page.
PDF extraction, Union Bank parsing, normalization, and validation run locally;
the output is normalized JSON. This is an early implementation, not verified
support for every Union Bank statement format.

The previous React + FastAPI application is preserved on `legacy/v1`.
Its eight bank parsers remain unfinished; they are reference implementations,
not verified support for every statement variation.

## First milestone

Process one actual bank statement on the user's device:

```text
PDF → extraction → bank-specific parser → normalized transactions → validation → JSON
```

Start with Union Bank and explicit selection, using the actual statement
available for development. The initial format has Date, Transaction Id, Remarks,
Amount, and Balance columns. One protected, two-page statement was checked against
independently extracted expected data: all 28 transactions matched. Verify more
real variations before adding banks or connecting a React transaction interface.

## Run locally

Use Node.js 22.13+ and npm. From the repository root:

```sh
rtk proxy npm ci
rtk proxy npm run dev
```

Open the local URL printed by Vite. Select a Union PDF from your device, provide a
local account label, and enter the PDF password if needed. Passwords are not saved
or included in results. The page shows accepted/rejected counts, review issues,
and normalized JSON. Scans and other layouts may not be supported.

```sh
rtk proxy npm test
rtk proxy npm run build
```

The default suite uses fictional fixtures and controlled boundary replacements.
An opt-in private integration test uses actual PDF.js and independent expected
data; it skips without its environment variables. Browser interactions and the
bundled worker path still require manual verification.

## Understand the code

Read [the runtime walkthrough](docs/runtime-walkthrough.md) for function calls,
PDF.js behavior, file responsibilities, temporary inspection files, and tests.
[The architecture decisions](docs/architecture.md) explain the model and limits.

## Architecture

Keep PDF extraction, bank-specific parsing, domain models, validation, processing
services, and UI separate. React will consume normalized results from a processing
service rather than parse bank statements directly.

Use JavaScript ES modules with JSDoc contracts now; migrate to TypeScript later.
Money uses integer paise and dates use ISO calendar-date strings. The processing
service returns success, partial success, or failure with source-located issues.

PDF processing will be client-side, with statement files staying on the user's
device. Multiple statements, banks, accounts, analytics, demo mode, and internal
transfer detection are later milestones.

## Branches

- `main`: PatBook v2 revamp; GitHub's default branch.
- `legacy/v1`: preserved legacy implementation.
- `feat/parser-foundation`: the initial processing implementation.
- Feature branches: focused changes submitted through pull requests into `main`.

CI/CD and hosting automation are deferred during early development. Run relevant
tests locally and record major changes in `CHANGELOG.md`.

## Private development statements

Keep real PDFs in `test-learn-statements/` or `bank/`. Both folders are ignored,
and PDFs are ignored throughout the repository. `tmp/` holds optional private
inspection artifacts; it is not used by the app. Git ignore does not encrypt
files. Only fictional regression fixtures belong in the tracked test suite.

## License

MIT. See [LICENSE](LICENSE).
