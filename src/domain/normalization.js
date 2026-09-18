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

export function parseBankDate(value) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) throw new Error('Invalid transaction date');
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  if (!isCalendarDate(date)) throw new Error('Invalid transaction date');
  return date;
}
