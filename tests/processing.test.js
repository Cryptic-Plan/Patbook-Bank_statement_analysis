import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatementProcessor } from '../src/services/process-statement.js';
import { ExtractionError } from '../src/extraction/pdf.js';
import { unionParser } from '../src/parsers/union/parser.js';
import { ordinary, context } from './fixtures/union/documents.js';

const input = () => ({ bytes: new Uint8Array([1]), ...structuredClone(context) });
const processor = document => createStatementProcessor({ extractPdf: async () => document, parser: unionParser });

test('coordinates extraction, parsing, validation and a success result', async () => {
  const progress = [];
  const result = await processor(ordinary)({ ...input(), onProgress: value => progress.push(value.stage) });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.summary, { pages: 1, candidateRows: 2, accepted: 2, rejected: 0 });
  assert.deepEqual(progress, ['parsing', 'validation']);
});

test('reports partial success when a candidate row is rejected', async () => {
  const document = structuredClone(ordinary);
  document.pages[0].items.find(item => item.text === '500.25(Dr)').text = '500.25';
  const result = await processor(document)(input());
  assert.equal(result.status, 'partial_success');
  assert.deepEqual(result.summary, { pages: 1, candidateRows: 2, accepted: 1, rejected: 1 });
  assert.equal(result.issues[0].code, 'invalid_row');
});

test('reports balance warnings as partial success even when every row is accepted', async () => {
  const document = structuredClone(ordinary);
  document.pages[0].items.find(item => item.text === '11499.75(Cr)').text = '11499.74(Cr)';
  const result = await processor(document)(input());
  assert.equal(result.status, 'partial_success');
  assert.equal(result.summary.rejected, 0);
  assert.equal(result.issues[0].code, 'balance_mismatch');
});

test('fails when no transaction is valid', async () => {
  const document = structuredClone(ordinary);
  document.pages[0].items[0].text = 'Other Bank';
  const result = await processor(document)(input());
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.transactions, []);
});

test('rejects empty PDFs and mismatched account contexts before extraction', async () => {
  let called = false;
  const run = createStatementProcessor({ extractPdf: async () => { called = true; }, parser: unionParser });
  assert.equal((await run({ ...input(), bytes: new Uint8Array() })).issues[0].code, 'invalid_input');
  assert.equal((await run({ ...input(), account: { ...context.account, bankId: 'other' } })).issues[0].code, 'invalid_account');
  assert.equal(called, false);
});

test('preserves actionable password errors and hides unexpected errors', async () => {
  const protectedRun = createStatementProcessor({ extractPdf: async () => { throw new ExtractionError('password_required', 'This PDF requires a password.'); }, parser: unionParser });
  assert.equal((await protectedRun(input())).issues[0].code, 'password_required');
  const failingRun = createStatementProcessor({ extractPdf: async () => { throw new Error('Private detail'); }, parser: unionParser });
  const result = await failingRun(input());
  assert.equal(result.status, 'failed');
  assert.equal(JSON.stringify(result).includes('Private detail'), false);
});
