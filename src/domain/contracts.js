/**
 * JSON-compatible contracts shared by extraction, parsing, validation and UI.
 * Money is integer paise; transaction dates are calendar dates, not timestamps.
 * These JSDoc types will become TypeScript types in a later migration.
 *
 * @typedef {{id: string, bankId: string, currency: 'INR'}} AccountContext
 * @typedef {{statementId: string, page: number, line: number}} SourceLocation
 * @typedef {Object} Transaction
 * @property {string} id Statement/row identity; not a cross-statement deduplication key.
 * @property {string} date YYYY-MM-DD
 * @property {string} description Original narration, with whitespace normalized.
 * @property {number} amountPaise Positive safe integer.
 * @property {'debit'|'credit'} type
 * @property {number} [balancePaise] Signed safe integer; negative means overdraft.
 * @property {'INR'} currency
 * @property {string} bankId
 * @property {string} accountId
 * @property {string} [reference]
 * @property {SourceLocation} source
 *
 * @typedef {{text: string, x: number, y: number, width: number, height: number}} TextItem
 * @typedef {{number: number, width: number, height: number, items: TextItem[]}} ExtractedPage
 * @typedef {{pages: ExtractedPage[]}} ExtractedDocument
 * @typedef {Object} ProcessingIssue
 * @property {string} code
 * @property {'error'|'warning'} severity
 * @property {string} message Never includes passwords or PDF contents.
 * @property {SourceLocation} [source]
 *
 * @typedef {{transactions: Transaction[], issues: ProcessingIssue[], candidateRows: number}} ParseResult
 * @typedef {{bankId: string, parse: (document: ExtractedDocument, context: {account: AccountContext, statementId: string}) => ParseResult}} BankParser
 * @typedef {Object} ProcessingResult
 * @property {'success'|'partial_success'|'failed'} status
 * @property {Transaction[]} transactions Only validated transactions.
 * @property {ProcessingIssue[]} issues
 * @property {{pages: number, candidateRows: number, accepted: number, rejected: number}} summary
 */

export {};
