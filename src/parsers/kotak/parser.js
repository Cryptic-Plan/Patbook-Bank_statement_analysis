import { groupLines } from '../../extraction/lines.js';
import { parseBankDate, parseRupees } from '../../domain/normalization.js';

// Direction comes from the dedicated Withdrawal/Deposit columns; the balance
// column carries no direction marker on this template.
function columnAmount(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '-') return undefined;
  return parseRupees(trimmed);
}

function optionalText(text) {
  const trimmed = text.trim();
  return !trimmed || trimmed === '-' ? undefined : trimmed;
}

// This is a supported-layout check after explicit bank selection, not a registry.
function isHeader(line) {
  return /\bDate\b/.test(line.text) && /Chq\/Ref/i.test(line.text) &&
    /Withdrawal/i.test(line.text) && /Deposit/i.test(line.text) && /\bBalance\b/i.test(line.text);
}

// Column edges of the verified Kotak "Savings Account Transactions" seven-column
// layout. Scale with page width; reject shifted headers rather than guessing.
function columns(line, width) {
  const edges = [50, 100, 250, 345, 425, 490].map(x => x * width / 595);
  const cells = ['', '', '', '', '', '', ''];
  for (const item of line.items) {
    const column = edges.findIndex(edge => item.x < edge);
    const index = column === -1 ? 6 : column;
    cells[index] += ` ${item.text}`;
  }
  return cells.map(cell => cell.replace(/\s+/g, ' ').trim());
}

const ROW_DATE = /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/;
const rowLike = cells => ROW_DATE.test(cells[1].trim());

/** @type {import('../../domain/contracts.js').BankParser} */
export const kotakParser = {
  bankId: 'kotak',
  parse(document, { account, statementId }) {
    const transactions = [];
    const issues = [];
    let candidateRows = 0;
    let openingPaise;
    const pageLines = document.pages.map(page => ({ page, lines: groupLines(page) }));
    // Bank evidence must come from the account area of pages that carry the
    // supported table, not from a narration mentioning Kotak Mahindra Bank.
    const bankEvidence = pageLines.flatMap(({ lines }) => {
      const index = lines.findIndex(isHeader);
      return index === -1 ? [] : lines.slice(0, index).map(line => line.text);
    }).join('\n');
    if (!/(?:\bKotak\s+Mahindra\b|\bIFSC\s+(?:Code\s+)?KKBK[A-Z0-9]{7}\b)/i.test(bankEvidence)) {
      return { transactions, candidateRows, issues: [{ code: 'bank_mismatch', severity: 'error', message: 'The document does not identify Kotak Mahindra Bank. Select a Kotak Mahindra Bank statement.' }] };
    }

    for (const { page, lines } of pageLines) {
      const headerIndex = lines.findIndex(isHeader);
      const source = line => ({ statementId, page: page.number, line: line.number });
      if (headerIndex === -1) {
        // Summary and information pages legitimately lack the table. A dated row
        // there still means an unsupported layout, not a hidden transaction.
        const stray = lines.map(line => columns(line, page.width)).findIndex(rowLike);
        if (stray !== -1) {
          issues.push({ code: 'unsupported_layout', severity: 'error', message: 'A dated transaction row falls outside the supported table area and requires review.', source: source(lines[stray]) });
        }
        continue;
      }
      const headerCells = columns(lines[headerIndex], page.width);
      if (headerCells[0] !== '#' || headerCells[1] !== 'Date' || headerCells[2] !== 'Description' ||
          !/^Chq\/Ref/i.test(headerCells[3]) || !/^Withdrawal/i.test(headerCells[4]) ||
          !/^Deposit/i.test(headerCells[5]) || !/^Balance/i.test(headerCells[6])) {
        issues.push({ code: 'unsupported_layout', severity: 'error', message: 'The transaction columns differ from the supported Kotak Mahindra Bank layout.', source: source(lines[headerIndex]) });
        continue;
      }
      // Accumulate wrapped cells until the next dated row; then normalize once.
      let pending;
      const flush = () => {
        if (!pending) return;
        const isFirstRow = candidateRows === 0;
        candidateRows++;
        const [, rawDate, description, reference, withdrawalText, depositText, balanceText] = pending.cells;
        try {
          const date = parseBankDate(rawDate);
          const withdrawal = columnAmount(withdrawalText);
          const deposit = columnAmount(depositText);
          if (!description || (withdrawal === undefined) === (deposit === undefined) ||
              !(withdrawal ?? deposit)) throw new Error('Incomplete transaction');
          const transaction = {
            id: `${statementId}:${page.number}:${pending.line.number}`,
            date, description,
            amountPaise: withdrawal ?? deposit,
            type: withdrawal === undefined ? 'credit' : 'debit',
            balancePaise: parseRupees(balanceText),
            currency: 'INR', bankId: 'kotak', accountId: account.id,
            reference: optionalText(reference),
            source: source(pending.line),
          };
          transactions.push(transaction);
          // The opening balance anchors reconciliation of the first transaction.
          if (isFirstRow && openingPaise !== undefined) {
            const expected = BigInt(openingPaise) + BigInt(transaction.amountPaise) *
              (transaction.type === 'credit' ? 1n : -1n);
            if (expected !== BigInt(transaction.balancePaise)) {
              issues.push({ code: 'balance_mismatch', severity: 'warning', message: 'The opening balance does not reconcile with the first transaction.', source: transaction.source });
            }
          }
        } catch {
          // Keep source coordinates for review without returning guessed amounts.
          issues.push({ code: 'invalid_row', severity: 'error', message: 'A transaction row has an invalid date, amount, balance, or missing details and requires review.', source: source(pending.line) });
        }
        pending = undefined;
      };
      for (const line of lines.slice(headerIndex + 1)) {
        if (isHeader(line)) { flush(); continue; }
        const cells = columns(line, page.width);
        // The verified template has a fixed footer area, separate from the table.
        if (line.y > page.height - 40) {
          flush();
          if (rowLike(cells)) {
            candidateRows++;
            issues.push({ code: 'unsupported_layout', severity: 'error', message: 'A dated transaction row falls outside the supported table area and requires review.', source: source(line) });
          }
          continue;
        }
        if (rowLike(cells)) {
          flush();
          pending = { line, cells };
        } else if (/^Opening\s+Balance$/i.test(cells[2]) && !pending) {
          flush();
          try {
            openingPaise = parseRupees(cells[6]);
          } catch {
            issues.push({ code: 'invalid_row', severity: 'error', message: 'The opening balance row has an invalid amount and requires review.', source: source(line) });
          }
        } else if (pending) {
          cells.forEach((cell, index) => {
            if (cell) pending.cells[index] = `${pending.cells[index]} ${cell}`.trim();
          });
        } else if (cells.some(cell => cell && cell !== '-')) {
          issues.push({ code: 'unassigned_row', severity: 'error', message: 'Text in the transaction table could not be assigned to a transaction.', source: source(line) });
        }
      }
      flush();
    }
    if (candidateRows === 0 && issues.length === 0) {
      issues.push({ code: 'no_transactions', severity: 'error', message: 'No transaction rows were found in the supported layout.' });
    }
    return { transactions, issues, candidateRows };
  },
};