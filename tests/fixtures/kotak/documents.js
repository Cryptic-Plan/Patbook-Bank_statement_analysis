// All names, references, dates and values here are fictional. The coordinates
// represent the inspected seven-column Kotak template, not private PDF contents.
const item = (text, x, y) => ({ text, x, y, width: text.length * 4, height: 8 });

export function header(y = 371.5) {
  return [item('#', 44, y), item('Date', 75.18, y), item('Description', 124.19, y),
    item('Chq/Ref. No.', 279.66, y), item('Withdrawal (Dr.)', 354.85, y),
    item('Deposit (Cr.)', 428.9, y), item('Balance', 497.95, y)];
}

// Serial, date, description, reference, withdrawal, deposit, balance. Empty money
// columns carry the template's '-' placeholder.
export function row(serial, date, description, reference, withdrawal, deposit, balance, y = 403.86) {
  return [item(serial, 39, y), item(date, 72.18, y), item(description, 119.19, y),
    item(reference, 274.66, y), item(withdrawal, 400, y), item(deposit, 460, y),
    item(balance, 529.27, y)];
}

export function opening(balance, y = 390.18) {
  return [item('-', 39, y), item('-', 70.18, y), item('Opening Balance', 119.19, y),
    item('-', 274.66, y), item('-', 415.51, y), item('-', 484.56, y), item(balance, 542.64, y)];
}

export function page(items, number = 1) {
  return { number, width: 595, height: 842, items };
}

function evidence() {
  return [item('Account Statement', 36, 117.5), item('01 Apr 2025 - 31 Mar 2026', 36, 134),
    item('IFSC Code', 105.92, 317.5), item('KKBK0000000', 145.76, 317.5)];
}

function footer(number) {
  return [item('Statement Generated on 01 May 2026, 12:10', 36, 826),
    item('Page 1 of', 518.99, 826), item(number, 559, 826)];
}

// Ordinary statement with an opening credit followed by a payment.
export const ordinary = { pages: [page([
  ...evidence(), ...header(),
  ...opening('50.00'),
  ...row('1', '01 May 2025', 'Example salary deposit', '-', '-', '1,000.00', '1,050.00'),
  ...row('2', '02 May 2025', 'Example purchase', 'UPI-EXAMPLE0001', '500.25', '-', '549.75', 417.54),
  ...footer('1'),
])] };

// Account-area evidence only. A second page repeats the header; narration and a
// reference wrap onto continuation lines.
export const wrappedMultipage = { pages: [
  page([
    ...evidence(), ...header(),
    ...opening('50.00'),
    ...row('1', '01 May 2025', 'Example merchant payment with a long', 'UPI-EXAMPLE0002', '-', '100.00', '150.00'),
    item('narration that wraps', 119.19, 411.54),
    ...footer('2'),
  ]),
  page([
    ...header(122),
    ...row('2', '02 May 2025', 'Example withdrawal', 'UPI-EXAMPLE0003', '75.00', '-', '75.00', 140.68),
    ...header(720),
    ...row('3', '03 May 2025', 'Wrapped reference', 'ONBF-', '2.00', '-', '73.00', 733.68),
    item('EXAMPLE0004REF', 274.66, 741.36),
    ...footer('2'),
  ], 2),
] };

export const context = { account: { id: 'example-account', bankId: 'kotak', currency: 'INR' }, statementId: 'example-statement' };