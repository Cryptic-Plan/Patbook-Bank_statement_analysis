import test from 'node:test';
import assert from 'node:assert/strict';
import { kotakParser } from '../src/parsers/kotak/parser.js';
import { groupLines } from '../src/extraction/lines.js';
import { ordinary, wrappedMultipage, context, page, header, row, opening } from './fixtures/kotak/documents.js';

const item = (text, x, y) => ({ text, x, y, width: text.length * 4, height: 8 });

test('normalizes seven-column Kotak rows with column-derived direction and source', () => {
  const result = kotakParser.parse(ordinary, context);
  assert.equal(result.candidateRows, 2);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.transactions[1], {
    id: 'example-statement:1:7', date: '2025-05-02', description: 'Example purchase',
    amountPaise: 50025, type: 'debit', balancePaise: 54975, currency: 'INR',
    bankId: 'kotak', accountId: 'example-account', reference: 'UPI-EXAMPLE0001',
    source: { statementId: 'example-statement', page: 1, line: 7 },
  });
  assert.deepEqual(result.transactions[0], {
    id: 'example-statement:1:6', date: '2025-05-01', description: 'Example salary deposit',
    amountPaise: 100000, type: 'credit', balancePaise: 105000, currency: 'INR',
    bankId: 'kotak', accountId: 'example-account', reference: undefined,
    source: { statementId: 'example-statement', page: 1, line: 6 },
  });
});

test('handles wrapped narration and reference, repeated headers and multiple pages', () => {
  const result = kotakParser.parse(wrappedMultipage, context);
  assert.equal(result.candidateRows, 3);
  assert.deepEqual(result.issues, []);
  assert.equal(result.transactions[0].description, 'Example merchant payment with a long narration that wraps');
  assert.equal(result.transactions[1].source.page, 2);
  assert.equal(result.transactions[2].reference, 'ONBF- EXAMPLE0004REF');
});

test('reconciles the opening balance with the first transaction', () => {
  const mismatched = structuredClone(ordinary);
  mismatched.pages[0].items.find(item => item.text === '1,050.00').text = '1,950.00';
  const result = kotakParser.parse(mismatched, context);
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.issues.map(issue => issue.code), ['balance_mismatch']);
  assert.equal(result.issues[0].severity, 'warning');
  assert.equal(result.issues[0].source.line, 6);
  const withoutOpening = structuredClone(mismatched);
  withoutOpening.pages[0].items = withoutOpening.pages[0].items.filter(item => item.y !== 390.18);
  assert.deepEqual(kotakParser.parse(withoutOpening, context).issues, []);
});

test('uses positions rather than PDF item order to reconstruct columns', () => {
  const shuffled = structuredClone(ordinary);
  shuffled.pages[0].items.reverse();
  assert.deepEqual(kotakParser.parse(shuffled, context), kotakParser.parse(ordinary, context));
  const lines = groupLines(shuffled.pages[0]);
  assert.equal(lines[2].text, 'IFSC Code KKBK0000000');
});

test('reports malformed rows without guessing dates or direction', () => {
  const document = { pages: [page([
    item('IFSC Code', 105.92, 317.5), item('KKBK0000000', 145.76, 317.5), ...header(),
    item('Stray text', 119.19, 385),
    ...row('1', '32 May 2026', 'Impossible date', 'EXAMPLE0001', '-', '-', '100.00', 403.86),
    ...row('2', '02 May 2026', 'Both money columns filled', 'EXAMPLE0002', '100.00', '100.00', '200.00', 417.54),
    ...row('3', '03 May 2026', 'No amount', 'EXAMPLE0003', '-', '-', '200.00', 431.22),
    ...row('4', '04 May 2026', 'Valid deposit', 'EXAMPLE0004', '-', '50.00', '250.00', 444.9),
  ])] };
  const result = kotakParser.parse(document, context);
  assert.equal(result.candidateRows, 4);
  assert.equal(result.transactions.length, 1);
  assert.deepEqual(result.issues.map(issue => issue.code), ['unassigned_row', 'invalid_row', 'invalid_row', 'invalid_row']);
  assert.equal(result.issues[1].source.page, 1);
});

test('requires bank evidence outside transaction narration', () => {
  const document = structuredClone(ordinary);
  document.pages[0].items.find(item => item.text === 'KKBK0000000').text = 'ZZZZ0000000';
  document.pages[0].items.find(item => item.text === 'Example salary deposit').text = 'Transfer from Kotak Mahindra Bank';
  assert.equal(kotakParser.parse(document, context).issues[0].code, 'bank_mismatch');
});

test('rejects a shifted layout and tolerates summary pages', () => {
  const shifted = structuredClone(ordinary);
  shifted.pages[0].items.find(item => item.text === 'Balance').x = 300;
  assert.equal(kotakParser.parse(shifted, context).issues[0].code, 'unsupported_layout');
  const trailing = structuredClone(ordinary);
  trailing.pages.push(page([item('End of Statement', 252.6, 225.68)], 2));
  const result = kotakParser.parse(trailing, context);
  assert.deepEqual(result.issues, []);
  assert.equal(result.transactions.length, 2);
  trailing.pages.push(page([
    ...row('1', '30 May 2026', 'Stray dated row', 'EXAMPLE0005', '1.00', '-', '49.00', 140.68),
  ], 3));
  const stray = kotakParser.parse(trailing, context);
  assert.equal(stray.issues[0].code, 'unsupported_layout');
  assert.equal(stray.issues[0].source.page, 3);
});

test('scales the supported column layout with page width', () => {
  const scaled = structuredClone(ordinary);
  for (const p of scaled.pages) {
    p.width *= 2;
    p.items.forEach(item => { item.x *= 2; item.width *= 2; });
  }
  assert.deepEqual(kotakParser.parse(scaled, context), kotakParser.parse(ordinary, context));
});

test('reports transaction-like rows in the unsupported footer region', () => {
  const document = structuredClone(ordinary);
  document.pages[0].items.push(...row('3', '03 May 2026', 'Unexpected extra row', 'EXAMPLE0005', '1.00', '-', '48.00', 826));
  const result = kotakParser.parse(document, context);
  assert.equal(result.candidateRows, 3);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.issues[0].code, 'unsupported_layout');
});