import { validateTransactions } from '../validation/transactions.js';

/**
 * Explicit parser selection. Extraction and parsers have no dependency on React.
 * @param {{extractPdf: Function, parser: import('../domain/contracts.js').BankParser}} dependencies
 */
export function createStatementProcessor({ extractPdf, parser }) {
  return async function processStatement({ bytes, password, account, statementId, onProgress = () => {} }) {
    const failed = (code, message) => ({ status: 'failed', transactions: [], issues: [{ code, severity: 'error', message }], summary: { pages: 0, candidateRows: 0, accepted: 0, rejected: 0 } });
    if (!(bytes instanceof Uint8Array) || !bytes.length || typeof statementId !== 'string' || !statementId.trim()) {
      return failed('invalid_input', 'Select a nonempty PDF to process.');
    }
    if (typeof account?.id !== 'string' || !account.id.trim() || account.bankId !== parser.bankId || account.currency !== 'INR') {
      return failed('invalid_account', 'Provide an account identity for the selected bank and INR currency.');
    }
    // Extraction owns PDF handling and password errors; the parser sees only text.
    let document;
    try {
      document = await extractPdf(bytes, { password, onProgress });
    } catch (error) {
      const knownCodes = ['password_required', 'incorrect_password', 'no_text', 'pdf_unreadable'];
      return knownCodes.includes(error.code) ? failed(error.code, error.message) : failed('extraction_failed', 'Statement extraction failed.');
    }
    try {
      onProgress({ stage: 'parsing' });
      // No automatic bank detection yet: the caller selected the injected parser.
      const context = { account, statementId };
      const parsed = parser.parse(document, context);
      onProgress({ stage: 'validation' });
      const validated = validateTransactions(parsed.transactions, context);
      const issues = [...parsed.issues, ...validated.issues];
      const transactions = validated.transactions;
      // A balance warning still requires review, even if every row was accepted.
      return {
        status: transactions.length === 0 ? 'failed' : issues.length ? 'partial_success' : 'success',
        transactions, issues,
        summary: { pages: document.pages.length, candidateRows: parsed.candidateRows, accepted: transactions.length, rejected: parsed.candidateRows - transactions.length },
      };
    } catch {
      return { ...failed('processing_failed', 'Statement parsing or validation failed.'), summary: { pages: document.pages.length, candidateRows: 0, accepted: 0, rejected: 0 } };
    }
  };
}
