import { isCalendarDate } from '../domain/normalization.js';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Validate normalized candidates without changing or repairing financial data. */
export function validateTransactions(candidates, { account, statementId }) {
  const transactions = [];
  const issues = [];
  const ids = new Set();
  let previous;
  for (const transaction of candidates) {
    // JSDoc describes the shape; these checks actually enforce it at runtime.
    const valid = transaction && nonempty(transaction.id) && isCalendarDate(transaction.date) &&
      nonempty(transaction.description) && Number.isSafeInteger(transaction.amountPaise) && transaction.amountPaise > 0 &&
      ['debit', 'credit'].includes(transaction.type) && transaction.currency === account.currency &&
      transaction.bankId === account.bankId && transaction.accountId === account.id &&
      (transaction.balancePaise === undefined || Number.isSafeInteger(transaction.balancePaise)) &&
      (transaction.reference === undefined || nonempty(transaction.reference)) &&
      transaction.source?.statementId === statementId && Number.isInteger(transaction.source.page) && transaction.source.page > 0 &&
      Number.isInteger(transaction.source.line) && transaction.source.line > 0 && !ids.has(transaction.id);
    if (!valid) {
      issues.push({ code: 'invalid_transaction', severity: 'error', message: 'A normalized transaction failed validation and was excluded.', ...(transaction?.source ? { source: transaction.source } : {}) });
      previous = undefined;
      continue;
    }
    ids.add(transaction.id);
    if (previous && transaction.date < previous.date) {
      issues.push({ code: 'date_order', severity: 'warning', message: 'Transactions are not in chronological statement order; balance reconciliation requires review.', source: transaction.source });
    } else if (previous?.balancePaise !== undefined && transaction.balancePaise !== undefined) {
      // BigInt prevents overflow while reconciling otherwise safe integer amounts.
      const expected = BigInt(previous.balancePaise) + BigInt(transaction.amountPaise) * (transaction.type === 'credit' ? 1n : -1n);
      if (expected !== BigInt(transaction.balancePaise)) {
        issues.push({ code: 'balance_mismatch', severity: 'warning', message: 'The running balance does not reconcile with the preceding transaction.', source: transaction.source });
      }
    }
    transactions.push(transaction);
    previous = transaction;
  }
  return { transactions, issues };
}
