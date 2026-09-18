import test from 'node:test';
import assert from 'node:assert/strict';
import { unionParser } from '../src/parsers/union/parser.js';
import { groupLines } from '../src/extraction/lines.js';
import { ordinary, wrappedMultipage, context, page, header, row } from './fixtures/union/documents.js';

test('normalizes five-column Union rows with explicit direction and source', () => {
  const result = unionParser.parse(ordinary, context);
  assert.equal(result.candidateRows, 2);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.transactions[1], {
    id: 'example-statement:1:4', date: '2026-08-02', description: 'Grocery purchase',
    amountPaise: 50025, type: 'debit', balancePaise: 1149975, currency: 'INR',
    bankId: 'union', accountId: 'example-account', reference: 'EXAMPLE002',
    source: { statementId: 'example-statement', page: 1, line: 4 },
  });
});

test('handles wrapped narration, repeated headers, multiple pages and overdraft', () => {
  const result = unionParser.parse(wrappedMultipage, context);
  assert.equal(result.candidateRows, 3);
  assert.deepEqual(result.issues, []);
  assert.equal(result.transactions[0].description, 'Example merchant payment');
  assert.equal(result.transactions[1].balancePaise, -2500);
  assert.equal(result.transactions[2].balancePaise, 2500);
  assert.equal(result.transactions[2].source.page, 2);
});

test('uses positions rather than PDF item order to reconstruct columns', () => {
  const shuffled = structuredClone(ordinary);
  shuffled.pages[0].items.reverse();
  assert.deepEqual(unionParser.parse(shuffled, context), unionParser.parse(ordinary, context));
  const lines = groupLines(shuffled.pages[0]);
  assert.equal(lines[0].text, 'Union Bank');
});

test('reports malformed rows without guessing dates or debit/credit direction', () => {
  const document = { pages: [page([
    { text: 'Union Bank', x: 30, y: 30, width: 40, height: 9 }, ...header(),
    ...row('31-02-2026', 'EXAMPLE201', 'Impossible date', '100.00(Dr)', '200.00(Cr)'),
    ...row('02-08-2026', 'EXAMPLE202', 'Missing direction', '100.00', '100.00(Cr)', 150),
    ...row('03-08-2026', 'EXAMPLE203', 'Valid deposit', '50.00(Cr)', '150.00(Cr)', 175),
  ])] };
  const result = unionParser.parse(document, context);
  assert.equal(result.candidateRows, 3);
  assert.equal(result.transactions.length, 1);
  assert.deepEqual(result.issues.map(issue => issue.code), ['invalid_row', 'invalid_row']);
  assert.equal(result.issues[0].source.page, 1);
});

test('requires bank evidence outside transaction narration', () => {
  const document = structuredClone(ordinary);
  document.pages[0].items[0].text = 'Other Bank';
  document.pages[0].items.find(item => item.text === 'Salary deposit').text = 'Transfer to UBIN0000001';
  assert.equal(unionParser.parse(document, context).issues[0].code, 'bank_mismatch');
  document.pages[0].items.find(item => item.text === 'Transfer to UBIN0000001').text = 'Transfer from Union Bank';
  assert.equal(unionParser.parse(document, context).issues[0].code, 'bank_mismatch');
});

test('rejects a shifted layout and reports unreadable pages', () => {
  const shifted = structuredClone(ordinary);
  shifted.pages[0].items.find(item => item.text === 'Amount(₹)').x = 350;
  assert.equal(unionParser.parse(shifted, context).issues[0].code, 'unsupported_layout');
  const missingPage = structuredClone(ordinary);
  missingPage.pages.push(page([], 2));
  const result = unionParser.parse(missingPage, context);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.issues[0].source.page, 2);
});

test('scales the supported column layout with page width', () => {
  const scaled = structuredClone(ordinary);
  for (const p of scaled.pages) {
    p.width *= 2;
    p.items.forEach(item => { item.x *= 2; item.width *= 2; });
  }
  assert.deepEqual(unionParser.parse(scaled, context), unionParser.parse(ordinary, context));
});

test('reports transaction-like rows in the unsupported footer region', () => {
  const document = structuredClone(ordinary);
  document.pages[0].items.push(...row('03-08-2026', 'EXAMPLE301', 'Unexpected extra row', '1.00(Dr)', '11498.75(Cr)', 780));
  const result = unionParser.parse(document, context);
  assert.equal(result.candidateRows, 3);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.issues[0].code, 'unsupported_layout');
});
