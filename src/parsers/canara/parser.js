import { groupLines } from '../../extraction/lines.js';
import { parseBankDate, parseRupees } from '../../domain/normalization.js';

// Direction comes from the dedicated Deposits/Withdrawals columns; the balance
// column carries no direction marker on this template.
function columnAmount(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed === '-') return undefined;
  return parseRupees(trimmed);
}

// This is a supported-layout check after explicit bank selection, not a registry.
function isHeader(line) {
  return /\bDate\b/.test(line.text) && /Particulars/i.test(line.text) &&
    /Deposits/i.test(line.text) && /Withdrawals/i.test(line.text) && /\bBalance\b/i.test(line.text);
}

// Column edges of the verified Canara e-Passbook five-column layout. Date and
// Particulars print left-aligned while the money cells are right-aligned, so
// the edges separate the printed columns rather than mirroring their header
// positions. Scale with page width; reject shifted headers rather than guessing.
function columns(line, width) {
  const edges = [100, 315, 400, 498].map(x => x * width / 595);
  const cells = ['', '', '', '', ''];
  for (const item of line.items) {
    const column = edges.findIndex(edge => item.x < edge);
    const index = column === -1 ? 4 : column;
    cells[index] += ` ${item.text}`;
  }
  return cells.map(cell => cell.replace(/\s+/g, ' ').trim());
}

const ROW_DATE = /^\d{2}-\d{2}-\d{4}$/;
const isDatedRow = cells => ROW_DATE.test(cells[0]);
const CHQ_MARKER = /^Chq\s*:?\s*(.*)$/i;

// Unlike the other templates, narration wraps above the dated anchor line of
// its block instead of below it. Lines inside one block sit about 12pt apart
// while consecutive blocks are separated by about 24pt, so the line spacing
// tells a block's tail from the next block's opening narration.
const CONTINUATION_GAP = 18;

/** @type {import('../../domain/contracts.js').BankParser} */
export const canaraParser = {
  bankId: 'canara',
  parse(document, { account, statementId }) {
    const transactions = [];
    const issues = [];
    let candidateRows = 0;
    let openingPaise;
    let closingPaise;
    const pageLines = document.pages.map(page => ({ page, lines: groupLines(page) }));
    // Bank evidence must come from the account area of pages that carry the
    // supported table, not from a narration mentioning Canara Bank.
    const bankEvidence = pageLines.flatMap(({ lines }) => {
      const index = lines.findIndex(isHeader);
      return index === -1 ? [] : lines.slice(0, index).map(line => line.text);
    }).join('\n');
    if (!/(?:\bCanara\s+Bank\b|\bIFSC\s+(?:Code\s+)?CNRB0[A-Z0-9]{6}\b)/i.test(bankEvidence)) {
      return { transactions, candidateRows, issues: [{ code: 'bank_mismatch', severity: 'error', message: 'The document does not identify Canara Bank. Select a Canara Bank statement.' }] };
    }

    for (const { page, lines } of pageLines) {
      const headerIndex = lines.findIndex(isHeader);
      const source = line => ({ statementId, page: page.number, line: line.number });
      if (headerIndex === -1) {
        // Summary and information pages legitimately lack the table. A dated row
        // there still means an unsupported layout, not a hidden transaction.
        const stray = lines.map(line => columns(line, page.width)).findIndex(isDatedRow);
        if (stray !== -1) {
          issues.push({ code: 'unsupported_layout', severity: 'error', message: 'A dated transaction row falls outside the supported table area and requires review.', source: source(lines[stray]) });
        }
        continue;
      }
      const headerCells = columns(lines[headerIndex], page.width);
      if (!/^Date$/.test(headerCells[0]) || !/^Particulars$/i.test(headerCells[1]) ||
          !/^Deposits$/i.test(headerCells[2]) || !/^Withdrawals$/i.test(headerCells[3]) ||
          !/^Balance$/i.test(headerCells[4])) {
        issues.push({ code: 'unsupported_layout', severity: 'error', message: 'The transaction columns differ from the supported Canara Bank layout.', source: source(lines[headerIndex]) });
        continue;
      }
      // One block: narration above its dated anchor line, the anchor carrying
      // date, optional particulars, amount and balance, continuation lines
      // below it, then the Chq reference line that closes the block.
      let narration = [];
      let pending;
      let lastY;
      const flush = () => {
        if (!pending) return;
        const isFirstRow = candidateRows === 0;
        candidateRows++;
        const description = [...pending.pre.map(part => part.text), pending.particulars, ...pending.post]
          .filter(Boolean).join(' ');
        try {
          const date = parseBankDate(pending.date);
          const deposit = columnAmount(pending.deposit);
          const withdrawal = columnAmount(pending.withdrawal);
          if (!description || (withdrawal === undefined) === (deposit === undefined) ||
              !(withdrawal ?? deposit)) throw new Error('Incomplete transaction');
          const transaction = {
            id: `${statementId}:${page.number}:${pending.line.number}`,
            date, description,
            amountPaise: withdrawal ?? deposit,
            type: withdrawal === undefined ? 'credit' : 'debit',
            balancePaise: parseRupees(pending.balance),
            currency: 'INR', bankId: 'canara', accountId: account.id,
            reference: pending.reference,
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
          if (isDatedRow(cells)) {
            candidateRows++;
            issues.push({ code: 'unsupported_layout', severity: 'error', message: 'A dated transaction row falls outside the supported table area and requires review.', source: source(line) });
          }
          continue;
        }
        if (/^(?:Opening|Closing)\s+Balance$/i.test(cells[1])) {
          flush();
          narration = [];
          try {
            if (/^Opening/i.test(cells[1])) openingPaise = parseRupees(cells[4]);
            else closingPaise = parseRupees(cells[4]);
          } catch {
            issues.push({ code: 'invalid_row', severity: 'error', message: 'The opening or closing balance row has an invalid amount and requires review.', source: source(line) });
          }
          continue;
        }
        if (isDatedRow(cells)) {
          flush();
          pending = {
            line, date: cells[0], particulars: cells[1], deposit: cells[2],
            withdrawal: cells[3], balance: cells[4], pre: narration, post: [],
            reference: undefined,
          };
          narration = [];
          lastY = line.y;
          continue;
        }
        const chq = CHQ_MARKER.exec(cells[1]);
        if (chq) {
          if (pending) pending.reference = chq[1] || undefined;
          else {
            issues.push({ code: 'unassigned_row', severity: 'error', message: 'Text in the transaction table could not be assigned to a transaction.', source: source(line) });
          }
        } else if (pending && lastY !== undefined && line.y - lastY <= CONTINUATION_GAP) {
          pending.post.push(cells[1]);
        } else {
          flush();
          if (cells[1]) narration.push({ text: cells[1], line });
          else if (cells.some(Boolean)) {
            issues.push({ code: 'unassigned_row', severity: 'error', message: 'Text in the transaction table could not be assigned to a transaction.', source: source(line) });
          }
        }
        lastY = line.y;
      }
      flush();
      // Narration that never met a dated anchor line could belong to a block
      // split across pages; report it instead of silently dropping it.
      if (narration.length) {
        issues.push({ code: 'unassigned_row', severity: 'error', message: 'Text in the transaction table could not be assigned to a transaction.', source: source(narration[0].line) });
      }
    }
    // The verified template prints the closing balance after the last block.
    if (closingPaise !== undefined && transactions.length &&
        BigInt(closingPaise) !== BigInt(transactions.at(-1).balancePaise)) {
      issues.push({ code: 'balance_mismatch', severity: 'warning', message: 'The closing balance does not reconcile with the last transaction.', source: transactions.at(-1).source });
    }
    if (candidateRows === 0 && issues.length === 0) {
      issues.push({ code: 'no_transactions', severity: 'error', message: 'No transaction rows were found in the supported layout.' });
    }
    return { transactions, issues, candidateRows };
  },
};
