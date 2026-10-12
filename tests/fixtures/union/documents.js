// All names, references, dates and values here are fictional. The coordinates
// represent the inspected five-column Union template, not private PDF contents.
const item = (text, x, y) => ({ text, x, y, width: text.length * 4, height: 9 });

export function header(y = 100) {
  return [item('Date', 40, y), item('Transaction Id', 80, y), item('Remarks', 273, y),
    item('Amount(₹)', 449, y), item('Balance(₹)', 515, y)];
}

export function row(date, reference, description, amount, balance, y = 125) {
  return [item(date, 27, y), item(reference, 88, y), item(description, 161, y),
    item(amount, 446, y), item(balance, 512, y)];
}

export function page(items, number = 1) {
  return { number, width: 595.275, height: 841.875, items };
}

// Ordinary statement with an opening credit followed by a payment.
export const ordinary = { pages: [page([
  item('Union Bank', 30, 30), ...header(),
  ...row('01-08-2026', 'EXAMPLE001', 'Salary deposit', '10000.00(Cr)', '12000.00(Cr)'),
  ...row('02-08-2026', 'EXAMPLE002', 'Grocery purchase', '500.25(Dr)', '11499.75(Cr)', 150),
])] };

// Logo-as-image variation: only the labeled IFSC identifies the bank. A second
// page repeats the header. Narration wraps and balance crosses into overdraft.
export const wrappedMultipage = { pages: [
  page([item('IFSC UBIN0000001', 300, 50), ...header(),
    ...row('01-08-2026', 'EXAMPLE101', 'Example', '100.00(Dr)', '50.00(Cr)'),
    item('merchant payment', 161, 138),
    item('Page 1 of 2', 540, 820)]),
  page([...header(),
    ...row('02-08-2026', 'EXAMPLE102', 'Cash withdrawal', '75.00(Dr)', '25.00(Dr)'),
    ...header(150),
    ...row('03-08-2026', 'EXAMPLE103', 'Cash deposit', '50.00(Cr)', '25.00(Cr)', 175),
    item('Page 2 of 2', 540, 820)], 2),
] };

export const context = { account: { id: 'example-account', bankId: 'union', currency: 'INR' }, statementId: 'example-statement' };
