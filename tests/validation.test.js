import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTransactions } from '../src/validation/transactions.js';
import { unionParser } from '../src/parsers/union/parser.js';
import { ordinary, wrappedMultipage, context } from './fixtures/union/documents.js';

test('reconciles running balances across pages and an overdraft', () => {
  const parsed = unionParser.parse(wrappedMultipage, context);
  const result = validateTransactions(parsed.transactions, context);
  assert.equal(result.transactions.length, 3);
  assert.deepEqual(result.issues, []);
});

test('flags a balance discrepancy without modifying a valid transaction', () => {
  const candidates = unionParser.parse(ordinary, context).transactions;
  candidates[1].balancePaise += 1;
  const result = validateTransactions(candidates, context);
  assert.equal(result.transactions[1].balancePaise, 1149976);
  assert.equal(result.issues[0].code, 'balance_mismatch');
});

test('excludes invalid account, date, money, identity and source fields', () => {
  const valid = unionParser.parse(ordinary, context).transactions[0];
  for (const override of [{ accountId: 'wrong' }, { bankId: 'wrong' }, { currency: 'USD' },
    { amountPaise: 1.5 }, { amountPaise: 0 }, { balancePaise: NaN }, { date: '2026-02-30' },
    { description: '' }, { id: '' }, { source: { ...valid.source, page: 0 } }]) {
    const result = validateTransactions([{ ...valid, ...override }], context);
    assert.equal(result.transactions.length, 0);
    assert.equal(result.issues[0].code, 'invalid_transaction');
  }
});

test('rejects duplicate row IDs within one processing result', () => {
  const valid = unionParser.parse(ordinary, context).transactions[0];
  const result = validateTransactions([valid, structuredClone(valid)], context);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.issues[0].code, 'invalid_transaction');
});

test('warns about reverse chronological order', () => {
  const candidates = unionParser.parse(ordinary, context).transactions.reverse();
  assert.equal(validateTransactions(candidates, context).issues[0].code, 'date_order');
});
