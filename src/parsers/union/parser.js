import { groupLines } from '../../extraction/lines.js';
import { parseBankDate, parseRupees } from '../../domain/normalization.js';

// Direction must come from the bank's explicit marker, never from narration.
function markedAmount(text) {
  const match = /^([\d,.]+)\s*\((Dr|Cr)\)$/i.exec(text.trim());
  if (!match) throw new Error('Missing or invalid debit/credit marker');
  return { paise: parseRupees(match[1]), type: match[2].toLowerCase() === 'dr' ? 'debit' : 'credit' };
}

// This is a supported-layout check after explicit bank selection, not a registry.
function isHeader(line) {
  return /\bDate\b/.test(line.text) && /Transaction\s+Id/i.test(line.text) &&
    /Remarks/i.test(line.text) && /Amount/i.test(line.text) && /Balance/i.test(line.text);
}

// Column edges of the verified Union "Details of Statement" five-column layout.
// Scale with page width; reject shifted headers rather than guessing a layout.
function columns(line, width) {
  const edges = [77, 146, 438, 504].map(x => x * width / 595.275);
  const cells = ['', '', '', '', ''];
  for (const item of line.items) {
    const column = edges.findIndex(edge => item.x < edge);
    const index = column === -1 ? 4 : column;
    cells[index] += ` ${item.text}`;
  }
  return cells.map(cell => cell.replace(/\s+/g, ' ').trim());
}

/** @type {import('../../domain/contracts.js').BankParser} */
export const unionParser = {
  bankId: 'union',
  parse(document, { account, statementId }) {
    const transactions = [];
    const issues = [];
    let candidateRows = 0;
    const pageLines = document.pages.map(page => ({ page, lines: groupLines(page) }));
    // Bank evidence must come from the statement header/account area, not from
    // a counterparty mentioning Union Bank in a transaction description.
    const bankEvidence = pageLines.flatMap(({ lines }) => {
      const index = lines.findIndex(isHeader);
      return (index === -1 ? lines : lines.slice(0, index)).map(line => line.text);
    }).join('\n');
    // The supplied statement's logo is an image, so it is absent from PDF.js text.
    // Accept the labeled account IFSC field as alternate bank evidence. A UBIN
    // code appearing only in another person's transaction narration is insufficient.
    if (!/(?:\bUnion\s+Bank\b|\bIFSC\s+UBIN[A-Z0-9]{7}\b)/i.test(bankEvidence)) {
      return { transactions, candidateRows, issues: [{ code: 'bank_mismatch', severity: 'error', message: 'The document does not identify Union Bank. Select a Union Bank statement.' }] };
    }

    for (const { page, lines } of pageLines) {
      const headerIndex = lines.findIndex(isHeader);
      const source = line => ({ statementId, page: page.number, line: line.number });
      if (headerIndex === -1) {
        issues.push({ code: 'unsupported_layout', severity: 'error', message: 'A page is missing the supported Union Bank transaction header.', source: source(lines[0] ?? { number: 1 }) });
        continue;
      }
      const headerCells = columns(lines[headerIndex], page.width);
      if (!/^Date$/.test(headerCells[0]) || !/^Transaction\s+Id$/i.test(headerCells[1]) ||
          !/^Remarks$/i.test(headerCells[2]) || !/^Amount/i.test(headerCells[3]) || !/^Balance/i.test(headerCells[4])) {
        issues.push({ code: 'unsupported_layout', severity: 'error', message: 'The transaction columns differ from the supported Union Bank layout.', source: source(lines[headerIndex]) });
        continue;
      }
      // Accumulate wrapped cells until the next dated row; then normalize once.
      let pending;
      const flush = () => {
        if (!pending) return;
        candidateRows++;
        const [rawDate, reference, description, amountText, balanceText] = pending.cells;
        try {
          const date = parseBankDate(rawDate);
          const amount = markedAmount(amountText);
          const balance = markedAmount(balanceText);
          if (!reference || !description || amount.paise <= 0) throw new Error('Incomplete transaction');
          transactions.push({
            id: `${statementId}:${page.number}:${pending.line.number}`,
            date, description, amountPaise: amount.paise, type: amount.type,
            balancePaise: balance.type === 'debit' ? -balance.paise : balance.paise,
            currency: 'INR', bankId: 'union', accountId: account.id, reference,
            source: source(pending.line),
          });
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
        if (line.y > page.height - 80 || /^Page\s+\d+\s+of\s+\d+$/i.test(line.text)) {
          flush();
          // A dated row outside that region means the layout changed. Report it
          // explicitly instead of silently hiding a transaction as footer text.
          if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(cells[0])) {
            candidateRows++;
            issues.push({ code: 'unsupported_layout', severity: 'error', message: 'A dated transaction row falls outside the supported table area and requires review.', source: source(line) });
          }
          continue;
        }
        if (cells[0]) {
          flush();
          pending = { line, cells };
        } else if (pending) {
          cells.forEach((cell, index) => {
            if (cell) pending.cells[index] = `${pending.cells[index]} ${cell}`.trim();
          });
        } else if (cells.some(Boolean)) {
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
