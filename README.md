# PatBook v2

A local-first financial analysis project under development.

## Development status

The v2 revamp starts from a minimal project baseline. The new implementation
has not been built yet, and there are no application run commands at this stage.

The previous React + FastAPI application is preserved on `legacy/v1`.
Its eight bank parsers remain unfinished; they are reference implementations,
not verified support for every statement variation.

## First milestone

Process one actual bank statement on the user's device:

```text
PDF → extraction → bank-specific parser → normalized transactions → validation → JSON
```

Start with one bank and explicit bank selection. SBI is the initial candidate,
subject to the available real statements. Verify several statement variations
with parser regression tests before adding another bank or connecting React.

## Architecture

Keep PDF extraction, bank-specific parsing, domain models, validation, processing
services, and UI separate. React will consume normalized results from a processing
service rather than parse bank statements directly.

PDF processing will be client-side, with statement files staying on the user's
device. Multiple statements, banks, accounts, analytics, demo mode, and internal
transfer detection are later milestones.

## Branches

- `main`: PatBook v2 revamp; GitHub's default branch.
- `legacy/v1`: preserved legacy implementation.
- `chore/v2-revamp`: preparation of the minimal v2 baseline.
- Feature branches: focused changes submitted through pull requests into `main`.

CI/CD and hosting automation are deferred during early development. Run relevant
tests locally and record major changes in `CHANGELOG.md`.

## License

MIT. See [LICENSE](LICENSE).
