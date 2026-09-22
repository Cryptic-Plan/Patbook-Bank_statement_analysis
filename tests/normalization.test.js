import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRupees, parseBankDate, isCalendarDate } from '../src/domain/normalization.js';

test('normalizes rupees exactly, including western and Indian grouping', () => {
  for (const [text, expected] of [['0.01', 1], ['500', 50000], ['500.5', 50050],
    ['1,234.56', 123456], ['1,23,456.78', 12345678]]) {
    assert.equal(parseRupees(text), expected);
  }
});

test('rejects malformed amounts instead of coercing them to zero', () => {
  for (const text of ['', 'NaN', '1,2.00', '500.001', '-500.00', '500xyz', '90071992547410.00']) {
    assert.throws(() => parseRupees(text));
  }
});

test('validates dates as calendar dates, including leap years', () => {
  assert.equal(parseBankDate('29-02-2024'), '2024-02-29');
  assert.equal(isCalendarDate('2026-08-01'), true);
  for (const text of ['29-02-2026', '31-04-2026', '00-08-2026', '01-13-2026', '01/08/2026']) {
    assert.throws(() => parseBankDate(text));
  }
  assert.equal(isCalendarDate('2026-02-30'), false);
});

test('normalizes month-name dates printed by some banks', () => {
  assert.equal(parseBankDate('07 May 2025'), '2025-05-07');
  assert.equal(parseBankDate('01-Mar-2025'), '2025-03-01');
  assert.equal(parseBankDate('5 Sept 2025'), '2025-09-05');
  assert.equal(parseBankDate('29 February 2024'), '2024-02-29');
  for (const text of ['32 May 2026', '31 Apr 2026', '07 Foo 2025', 'May 07 2025']) {
    assert.throws(() => parseBankDate(text));
  }
});
