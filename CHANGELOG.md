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

### Changed - PatBook v2 revamp
- Cleared the legacy application, designs, debug scripts, parser tests, and
  automation from the v2 working baseline. The existing implementation remains
  preserved on `legacy/v1` with its Git history.
- Retained README.md, CHANGELOG.md, LICENSE, and .gitignore as the minimal baseline.
- Replaced the README with the PatBook v2 development plan. No new parser or
  application implementation is included yet.
- Use PatBook v2 / v2 revamp as the restart name; client-side processing describes
  its architecture. The cleanup branch is `chore/v2-revamp`, targeting `main`.

### Project status - 2026-09-18
- All eight legacy bank parsers (HDFC, Canara, Union Bank, Federal Bank, SBI,
  Kotak, PNB, and Kerala Gramin Bank) are still under development. Their presence
  in the application does not establish reliable support for every statement
  variation; parser correctness requires verification against real statements.
- The existing React + FastAPI implementation is preserved on `legacy/v1`
  as a reference. The PatBook v2 pipeline has not been implemented yet.
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

The earlier entries below record legacy development; they do not imply that
removed automation remains enabled for the restart.

### Added
- **PNB (Punjab National Bank) parser** - New parser with support for:
  - Table-based extraction with multi-line remark continuation
  - UPI transactions: extracts payee, bank code, and merchant category from VPA (Paytm, Amazon Pay, PhonePe, Google Pay, BharatPe)
  - IMPS transactions: direction (IN/OUT), mobile number, sender/recipient name
  - NEFT and RTGS transactions: direction and beneficiary name extraction
  - Cash deposits/withdrawals, interest, charges, and cheque payments (via Instrument ID)
  - Date format: DD/MM/YYYY; explicit DR/CR type detection
  - 23 unit tests in `backend/tests/test_pnb.py`
- **FastAPI Health endpoint** (`GET /api/health`) - Lightweight status check for keepalive pings
- **Render keepalive ping workflow** (`.github/workflows/ping.yml`) - GitHub Actions cron job running every 5 minutes to prevent Render free-tier sleep
- **Parser unit tests** - `backend/tests/test_canara.py` (16 tests) and `backend/tests/test_pnb.py` (23 tests), run in CI via pytest
- **Google Analytics (gtag) integration** - User behavior tracking with:
  - Automatic page view tracking on route changes
  - Custom events: bank selection, PDF upload, view toggle, CSV export
  - Environment-based measurement ID via `VITE_GA_MEASUREMENT_ID`
  - Scripts injected dynamically from `frontend/src/analytics.js`
- **Microsoft Clarity integration** - Session recordings and heatmaps via:
  - Environment-based project ID via `VITE_CLARITY_PROJECT_ID`
  - Dynamic script injection (skipped when ID is placeholder)
- **Analytics module** (`frontend/src/analytics.js`) with `initAnalytics()`, `trackPageView()`, `trackEvent()`
- **Route change tracking** - `RouteTracker` component in `App.jsx` fires page views
- **Deployment configs** - Open-source project setup:
  - `render.yaml` for backend deployment on Render
  - `frontend/public/_redirects` for Cloudflare Pages SPA routing
  - Environment-based CORS configuration via `ALLOWED_ORIGINS`
- **GitHub Actions CI** - Automated lint and build checks on PRs
- **Issue/PR templates** - Bug report, feature request, and pull request templates
- **CONTRIBUTING.md** - Setup instructions and contribution guidelines for open-source contributors

### Changed
- **CORS hardened** - Backend reads allowed origins from `ALLOWED_ORIGINS` env var instead of hardcoded localhost URLs (falls back to localhost for development)
- **Environment variables** - Analytics tracking IDs stored in `frontend/.env` (gitignored)
- **Updated .gitignore** - Added `.env`, `.env.local`, `.env.production` to frontend gitignore
- **SBI parser** - New parser for SBI bank statements with support for:
  - Table-based extraction (primary) with flexible column positioning
  - Text-based parsing as fallback for borderless tables
  - UPI transactions (UPI/CR for credit, UPI/DR for debit)
  - Date format: DD/MM/YYYY
  - Transaction type detection via separate debit/credit columns or UPI markers
  - Balance-based type detection as fallback
  - Multi-line narration handling with continuation line merging
- **React Router** - Added client-side routing with separate pages:
  - `/` - Home page with upload, transaction view, and filters
  - `/about` - About page with application information
  - `/analytics` - Dedicated analytics page
  - Navigation highlights active route automatically
- **Dynamic Bank Dropdown** - Bank selector now fetches available banks from `/api/banks` API endpoint instead of hardcoded list
- **Advanced Analytics Dashboard** - Comprehensive financial insights with:
  - **Smart Category Insights**: Category drift detection (month-over-month spending changes), Top growing category highlight
  - **Risk & Alert System**: Unusual transaction detection (amount > 2x category average), Low balance warnings (< ₹1,000), High frequency spending alerts (>5 transactions/day)
  - **Payment Method Intelligence**: ATM vs Digital spending comparison, Preferred payment method percentages
  - **Merchant Intelligence**: Top merchants by amount and frequency, Hidden spending tracker (₹10-₹50 small purchases)
  - **Savings & Efficiency**: Savings rate calculation, Expense ratio by category
  - Collapsible sections with Expand/Collapse All functionality
- **Bank Mismatch Detection** - Warning when no transactions are parsed, suggesting possible bank selection error
- **Loading States** - Global loading overlay with spinner during PDF processing
- **Status Indicators** - Success, warning, and error states with appropriate icons and colors
- **Federal Bank parser** - New parser for Federal Bank statements with support for:
  - Table-based extraction with multi-line narration handling
  - UPI transactions (extracts VPA/payee from `UPIOUT/<id>/<vpa>` format)
  - IFN transactions (Internal Funds Transfer with wallet categorization)
  - IMPS transactions (extracts recipient name)
  - Line-break hyphen removal for cleaner payee extraction
  - IFN wallet categories: Food, Fuel, Shopping, Medical, Transfer
- **Kotak parser** - Added to parser registry with Kotak-specific payee extraction (UPI/NAME/REFNO format, cashback, interest)
- **Kerala Gramin Bank (KGB) parser** - New parser for KGB bank statements with support for:
  - Table-based extraction (primary) with multi-line narration handling
  - Text-based parsing fallback for borderless/scanned PDFs
  - KGB-specific character-deduplication: fixes PDFs where every character is doubled (e.g. `1133--0055--22002266` → `13-05-2026`)
  - UPI transactions with `Dr`/`Cr` direction detection (`UPI/.../Dr/NAME`, `UPI/.../Cr/NAME`)
  - `Cr.for UTR` credit transactions with company name extraction
  - `MOB` (Mobile Banking) transactions
  - `Int.Pd` (Interest Paid) transactions
  - Date format: `DD-MM-YYYY`
  - Balance-based Debit/Credit fallback when narration is ambiguous
  - 29 unit tests in `backend/tests/test_kgb.py`

### Changed
- **Canara Bank parser reliability overhaul**:
  - Fixed `get_type()` in `utils/payee_extractor.py` to return `"Unknown"` instead of forcing `"Debit"` for all non-UPI/ATM transactions (affected all parsers)
  - Added Canara-specific date validators (`_is_canara_date`, `_parse_canara_date`) for `DD-MM-YYYY` format
  - Stricter table/text strategy: requires ≥3 data rows AND ≥50% valid dates before choosing table mode
  - Smarter text-mode amount extraction: finds first non-zero amount before balance instead of brittle `amounts[-2]`
  - Removed buggy lookback narration merging; simplified to forward-only continuation merging
  - Better debit/credit fallback using balance comparison + keyword heuristics when type is Unknown
  - More robust `prev_balance` initialization (seeds from first transaction if opening balance missing)
- **CI workflow** - Now runs parser tests (`pytest tests/`) in addition to ruff linting
- **Ping workflow** - Added `RENDER_URL` secret validation with clear error message when unset

### Fixed
- **Self-transfer detection logic** - Removed flawed name-based self-transfer detection (checked for "ATHUL" in payee name). TODO added for implementing proper self-transfer detection using account numbers, IFSC codes, or transaction patterns in a future stage
- **Date parsing in Canara Bank statements** - Updated `DATE_TIME_REGEX` to support both slash (`/`) and hyphen (`-`) date separators, fixing datetime extraction for Canara e-passbook PDFs that use `DD-MM-YYYY` format
- **Double normalization in Canara parser** - Removed redundant text normalization when determining transaction type; now uses `get_type()` from `payee_extractor.py` directly
- **Datetime tuple extraction** - Enhanced `extract_datetime_tuple()` to try multiple date format combinations (`DD/MM/YYYY`, `DD/MM/YY`, `DD-MM-YYYY`, `DD-MM-YY`)
- **Union Bank merchant mapping scope** - Moved "INDIAN" → "Zerodha" mapping from global `MERCHANT_MAPPINGS` to Union Bank parser only, preventing it from affecting other banks
- **Pycache cleanup** - Removed `__pycache__` directories from git tracking and local working tree

## [0.2.0] - 2026-05-02

### Changed
- Stack migration from Streamlit to React + FastAPI architecture
- Backend refactored to modular structure with separate parsers for each bank
- Frontend updated to React with Vite

### Added
- FastAPI backend with CORS support for frontend integration
- `/api/banks` endpoint to list supported banks
- `/api/parse` endpoint for PDF statement parsing with password support
- `/api/export` endpoint for CSV export of parsed transactions
- Support for multiple bank statement parsers (Canara, HDFC, Union Bank)
- Payee extraction and transaction categorization
- Detailed logging for debugging PDF parsing

## [0.1.0] - 2026-05-01

### Added
- Initial project setup with Streamlit
- Basic PDF statement parsing functionality
- Support for Canara Bank e-passbook
- Transaction display and summary generation
