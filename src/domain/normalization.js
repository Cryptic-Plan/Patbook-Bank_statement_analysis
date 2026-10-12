/** Convert bank-formatted rupees without floating point multiplication. */
export function parseRupees(value) {
  if (typeof value !== 'string') throw new Error('Invalid monetary value');
  const text = value.trim();
  // Accept ungrouped, western grouped and Indian grouped decimal amounts.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(text)) {
    throw new Error('Invalid monetary value');
  }
  const [whole, fraction = ''] = text.replaceAll(',', '').split('.');
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Monetary value is too large');
  return Number(paise);
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Some banks print dates with month names, e.g. "07 May 2025" or "01-Mar-2025".
const MONTHS = new Map(Object.entries({
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}));

export function parseBankDate(value) {
  const numeric = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (numeric) {
    const date = `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
    if (!isCalendarDate(date)) throw new Error('Invalid transaction date');
    return date;
  }
  const named = /^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{4})$/.exec(value.trim());
  if (named) {
    const month = MONTHS.get(named[2].slice(0, 3).toLowerCase());
    if (!month) throw new Error('Invalid transaction date');
    const date = `${named[3]}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
    if (!isCalendarDate(date)) throw new Error('Invalid transaction date');
    return date;
  }
  throw new Error('Invalid transaction date');
}
