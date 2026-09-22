import test from 'node:test';
import assert from 'node:assert/strict';
import { canaraParser } from '../src/parsers/canara/parser.js';
import { ordinary, wrappedMultipage, spacedBlocks, context, page, header, transaction } from './fixtures/canara/documents.js';

const item = (text, x, y) => ({ text, x, y, width: text.length * 4, height: 8 });

test('normalizes five-column Canara blocks with column-derived direction and source', () => {
  const result = canaraParser.parse(ordinary, context);
  assert.equal(result.candidateRows, 2);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.transactions[0], {
    id: 'example-statement:1:7', date: '2026-06-01',
    description: 'UPI/CR/200000000001/EXAMPLE PAYEE UBIN/**00000@NYES/PAID VIA//YBN1 6100000000000/01/06/2026 09:45:02',
    amountPaise: 50000, type: 'credit', balancePaise: 55000, currency: 'INR',
    bankId: 'canara', accountId: 'example-account', reference: '200000000001',
    source: { statementId: 'example-statement', page: 1, line: 7 },
  });
  assert.deepEqual(result.transactions[1], {
    id: 'example-statement:1:12', date: '2026-06-02',
    description: 'UPI/DR/200000000002/EXAMPLE STORE YESB/**11111@YBL/PAID VIA//AXB2 6100000001000/02/06/2026 10:16:59',
    amountPaise: 12550, type: 'debit', balancePaise: 42450, currency: 'INR',
    bankId: 'canara', accountId: 'example-account', reference: '200000000002',
    source: { statementId: 'example-statement', page: 1, line: 12 },
  });
});

test('joins narration wrapped above and below the anchor across pages and repeated headers', () => {
  const result = canaraParser.parse(wrappedMultipage, context);
  assert.equal(result.candidateRows, 3);
  assert.deepEqual(result.issues, []);
  assert.equal(result.transactions[0].description,
    'UPI/CR/200000000003/LONG EXAMPLE PAYEE NAME THAT WRAPS ACROSS SEVERAL PARTICULARS LINES 61A0000002000/03/06/ 2026 11:02:44');
  assert.equal(result.transactions[1].source.page, 2);
  assert.equal(result.transactions[1].source.line, 4);
  assert.equal(result.transactions[2].source.line, 10);
  assert.equal(result.transactions[2].description, 'UPI/DR/200000000005/REPEATED HEADER SPLITS THE PAGE 13:44:51');
});

test('closes a block without a Chq line through line spacing', () => {
  const result = canaraParser.parse(spacedBlocks, context);
  assert.equal(result.candidateRows, 2);
  assert.deepEqual(result.issues, []);
  assert.equal(result.transactions[0].description, 'ATM CASH-EXAMPLE- BRANCHKLIN-01/06/26 10:11:12/1008');
  assert.equal(result.transactions[0].type, 'debit');
  assert.equal(result.transactions[0].reference, undefined);
  assert.equal(result.transactions[1].reference, '200000000005');
});

test('reconciles the opening and closing balances with the outer transactions', () => {
  const mismatched = structuredClone(ordinary);
  mismatched.pages[0].items.find(item => item.text === '550.00').text = '950.00';
  const result = canaraParser.parse(mismatched, context);
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.issues.map(issue => issue.code), ['balance_mismatch']);
  assert.equal(result.issues[0].severity, 'warning');
  assert.equal(result.issues[0].source.line, 7);
  const withoutOpening = structuredClone(mismatched);
  withoutOpening.pages[0].items = withoutOpening.pages[0].items.filter(item => item.y !== 363.5);
  assert.deepEqual(canaraParser.parse(withoutOpening, context).issues, []);
  const closingMismatch = structuredClone(ordinary);
  closingMismatch.pages[0].items.find(item => item.text === '424.50' && item.x === 553.1).text = '425.00';
  const closing = canaraParser.parse(closingMismatch, context);
  assert.deepEqual(closing.issues.map(issue => issue.code), ['balance_mismatch']);
  assert.equal(closing.issues[0].source.line, 12);
  const withoutClosing = structuredClone(closingMismatch);
  withoutClosing.pages[0].items = withoutClosing.pages[0].items.filter(item => item.y !== 523.5);
  assert.deepEqual(canaraParser.parse(withoutClosing, context).issues, []);
});

test('uses positions rather than PDF item order to reconstruct columns', () => {
  const shuffled = structuredClone(ordinary);
  shuffled.pages[0].items.reverse();
  assert.deepEqual(canaraParser.parse(shuffled, context), canaraParser.parse(ordinary, context));
});

test('reports malformed rows without guessing dates, direction, or balances', () => {
  const document = { pages: [page([
    item('IFSC Code', 36, 242.5), item('CNRB0000000', 100, 242.5), ...header(),
    ...transaction({ narration: ['Impossible date'], date: '32-06-2026', particulars: 'Impossible date', withdrawal: '10.00', balance: '40.00', chq: '100000000001' }, 379.5),
    ...transaction({ narration: ['Both money columns'], date: '02-06-2026', particulars: 'Both filled', deposit: '10.00', withdrawal: '10.00', balance: '40.00', chq: '100000000002' }, 451.5),
    ...transaction({ narration: ['No amount'], date: '03-06-2026', particulars: 'No amount', balance: '40.00', chq: '100000000003' }, 523.5),
    ...transaction({ narration: ['Bad balance'], date: '04-06-2026', particulars: 'Bad balance', deposit: '5.00', balance: 'abc', chq: '100000000004' }, 595.5),
    ...transaction({ date: '05-06-2026', deposit: '5.00', balance: '45.00', chq: '100000000005' }, 667.5),
  ])] };
  const result = canaraParser.parse(document, context);
  assert.equal(result.candidateRows, 5);
  assert.equal(result.transactions.length, 0);
  assert.deepEqual(result.issues.map(issue => issue.code),
    ['invalid_row', 'invalid_row', 'invalid_row', 'invalid_row', 'invalid_row']);
  assert.equal(result.issues[0].source.page, 1);
  assert.equal(result.issues[0].source.line, 4);
});

test('requires bank evidence outside transaction narration', () => {
  const document = structuredClone(ordinary);
  document.pages[0].items.find(item => item.text === 'CNRB0000000').text = 'ZZZZ0000000';
  document.pages[0].items.find(item => item.text === 'UPI/CR/200000000001/EXAMPLE PAYEE').text = 'Canara Bank counterparty narration';
  assert.equal(canaraParser.parse(document, context).issues[0].code, 'bank_mismatch');
});

test('rejects a shifted layout and tolerates summary pages', () => {
  const shifted = structuredClone(ordinary);
  shifted.pages[0].items.find(item => item.text === 'Balance').x = 300;
  assert.equal(canaraParser.parse(shifted, context).issues[0].code, 'unsupported_layout');
  const trailing = structuredClone(ordinary);
  trailing.pages.push(page([item('DISCLAIMER', 36, 55.5), item('END OF STATEMENT TEXT', 36, 101.5)], 2));
  const result = canaraParser.parse(trailing, context);
  assert.deepEqual(result.issues, []);
  assert.equal(result.transactions.length, 2);
  trailing.pages.push(page([
    ...transaction({ date: '30-06-2026', particulars: 'Stray dated row', withdrawal: '1.00', balance: '49.00', chq: '100000000009' }, 140.68),
  ], 3));
  const stray = canaraParser.parse(trailing, context);
  assert.equal(stray.issues[0].code, 'unsupported_layout');
  assert.equal(stray.issues[0].source.page, 3);
});

test('scales the supported column layout with page width', () => {
  const scaled = structuredClone(ordinary);
  for (const p of scaled.pages) {
    p.width *= 2;
    p.items.forEach(item => { item.x *= 2; item.width *= 2; });
  }
  assert.deepEqual(canaraParser.parse(scaled, context), canaraParser.parse(ordinary, context));
});

test('reports transaction-like rows in the unsupported footer region', () => {
  const document = structuredClone(ordinary);
  document.pages[0].items.push(...transaction({
    narration: ['Unexpected extra row'], date: '03-06-2026', withdrawal: '1.00', balance: '49.00', chq: '100000000006',
  }, 812));
  const result = canaraParser.parse(document, context);
  assert.equal(result.candidateRows, 3);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.issues[0].code, 'unsupported_layout');
});

test('reports table text that cannot be assigned to a transaction', () => {
  const document = { pages: [
    page([item('IFSC Code', 36, 20), item('CNRB0000000', 100, 20), ...header(50), item('Chq: 100000000007', 106.6, 74)], 1),
    page([...header(50), item('Dangling narration', 106.6, 74), item('99.00', 348.9, 86)], 2),
  ] };
  const result = canaraParser.parse(document, context);
  assert.equal(result.candidateRows, 0);
  assert.deepEqual(result.issues.map(issue => issue.code), ['unassigned_row', 'unassigned_row', 'unassigned_row']);
  assert.equal(result.issues[0].source.page, 1);
  assert.equal(result.issues[0].source.line, 3);
  assert.equal(result.issues[1].source.page, 2);
  assert.equal(result.issues[1].source.line, 3);
  assert.equal(result.issues[2].source.line, 2);
});
