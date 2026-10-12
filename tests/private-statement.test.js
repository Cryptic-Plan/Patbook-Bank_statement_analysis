import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPdfExtractor } from '../src/extraction/pdf.js';
import { unionParser } from '../src/parsers/union/parser.js';
import { createStatementProcessor } from '../src/services/process-statement.js';

// Opt-in real-PDF check. Supply private paths and a password through the shell;
// no statement data or actual password is embedded in the tracked test source.
const pdfPath = process.env.PATBOOK_TEST_PDF;
const expectedPath = process.env.PATBOOK_TEST_EXPECTED;

test('private PDF matches independently prepared expected transactions', {
  skip: !pdfPath || !expectedPath ? 'Private statement paths were not provided.' : false,
}, async () => {
  // PDF.js's legacy build supports Node-based verification. The browser worker
  // uses its standard build. Both execute our same extractor/parser/service.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const run = createStatementProcessor({ extractPdf: createPdfExtractor(pdfjs), parser: unionParser });
  const account = { id: 'private-test-account', bankId: 'union', currency: 'INR' };
  // Read fresh bytes for each attempt: PDF.js can take ownership of the buffer.
  const attempt = async password => run({ bytes: new Uint8Array(await readFile(pdfPath)), password, account, statementId: 'private-test-statement' });
  const password = process.env.PATBOOK_TEST_PASSWORD;
  const result = await attempt(password);
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
  assert.equal(result.status, 'success');
  assert.equal(result.transactions.length, expected.length);
  assert.equal(result.summary.rejected, 0);
  const fields = ['date', 'reference', 'description', 'amountPaise', 'type', 'balancePaise'];
  const differences = expected.flatMap((row, index) => fields.filter(field => row[field] !== result.transactions[index]?.[field]));
  // Report only the number of differences so a failure does not print private
  // descriptions, account information, or transaction references to test logs.
  assert.equal(differences.length, 0, 'Normalized fields differ from private expected data');
  if (password) {
    assert.equal((await attempt(undefined)).issues[0].code, 'password_required');
    assert.equal((await attempt('fictional-incorrect-test-password')).issues[0].code, 'incorrect_password');
  }
});
