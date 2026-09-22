// All names, references, dates and values here are fictional. The coordinates
// represent the inspected five-column Canara e-Passbook template, not private
// PDF contents.
const item = (text, x, y) => ({ text, x, y, width: text.length * 4, height: 8 });

export function header(y = 339.5) {
  return [item('Date', 43.6, y), item('Particulars', 167.1, y), item('Deposits', 320.6, y),
    item('Withdrawals', 413.3, y), item('Balance', 517.1, y)];
}

// One transaction block: wrapped narration above the dated anchor line, the
// anchor line with its optional particulars, deposit or withdrawal, and
// balance, continuation lines below the anchor, then the Chq reference line.
// `chq: ''` prints the template's empty marker; omitting `chq` drops the line,
// leaving line spacing to close the block.
export function transaction({ narration = [], date, particulars = '', deposit = '', withdrawal = '', balance, continuation = [], chq }, y = 379.5) {
  const items = [];
  let line = y;
  for (const part of narration) { items.push(item(part, 106.6, line)); line += 12; }
  items.push(item(date, 26.6, line));
  if (particulars) items.push(item(particulars, 106.6, line));
  if (deposit) items.push(item(deposit, 348.9, line));
  if (withdrawal) items.push(item(withdrawal, 443.7, line));
  if (balance) items.push(item(balance, 534.5, line));
  line += 12;
  for (const part of continuation) { items.push(item(part, 106.6, line)); line += 12; }
  if (chq !== undefined) items.push(item(chq === '' ? 'Chq:' : `Chq: ${chq}`, 106.6, line));
  return items;
}

// The template prints these summary rows right-aligned inside the table area.
export function balanceRow(label, amount, y = 363.5) {
  return [item(label, 305.5, y), item(amount, 553.1, y)];
}

export function page(items, number = 1) {
  return { number, width: 595, height: 842, items };
}

function evidence() {
  return [item('Statement for A/c XXXXXXXX9999 for the period 01-05-2026 to 31-07-2026', 36, 160.5),
    item('IFSC Code', 36, 242.5), item('CNRB0000000', 100, 242.5)];
}

function footer(number) {
  return [item(`page ${number}`, 531.7, 812)];
}

// Ordinary statement: opening balance, one UPI-style credit and one withdrawal,
// then the closing balance printed after the last block.
export const ordinary = { pages: [page([
  ...evidence(), ...header(), ...balanceRow('Opening Balance', '50.00'),
  ...transaction({
    narration: ['UPI/CR/200000000001/EXAMPLE PAYEE', 'UBIN/**00000@NYES/PAID VIA//YBN1'],
    date: '01-06-2026', particulars: '6100000000000/01/06/2026', deposit: '500.00', balance: '550.00',
    continuation: ['09:45:02'], chq: '200000000001',
  }),
  ...transaction({
    narration: ['UPI/DR/200000000002/EXAMPLE STORE', 'YESB/**11111@YBL/PAID VIA//AXB2'],
    date: '02-06-2026', particulars: '6100000001000/02/06/2026', withdrawal: '125.50', balance: '424.50',
    continuation: ['10:16:59'], chq: '200000000002',
  }, 451.5),
  ...balanceRow('Closing Balance', '424.50', 523.5),
  ...footer('1'),
])] };

// Account-area evidence only. A second page repeats the header; narration wraps
// above and below the dated anchor lines of both pages.
export const wrappedMultipage = { pages: [
  page([
    ...evidence(), ...header(), ...balanceRow('Opening Balance', '50.00'),
    ...transaction({
      narration: ['UPI/CR/200000000003/LONG EXAMPLE', 'PAYEE NAME THAT WRAPS ACROSS', 'SEVERAL PARTICULARS LINES'],
      date: '03-06-2026', particulars: '61A0000002000/03/06/', deposit: '75.00', balance: '125.00',
      continuation: ['2026 11:02:44'], chq: '200000000003',
    }),
    ...footer('1'),
  ]),
  page([
    ...header(50),
    ...transaction({
      narration: ['UPI/DR/200000000004/WRAPPED', 'REFERENCE FRAGMENT'],
      date: '04-06-2026', particulars: '61B0000003000/04/06/2026', withdrawal: '25.25', balance: '99.75',
      continuation: ['12:30:01'], chq: '200000000004',
    }, 74),
    ...header(700),
    ...transaction({
      narration: ['UPI/DR/200000000005/REPEATED', 'HEADER SPLITS THE PAGE'],
      date: '05-06-2026', withdrawal: '5.00', balance: '94.75',
      continuation: ['13:44:51'], chq: '200000000005',
    }, 724),
    ...footer('2'),
  ], 2),
] };

// A block without its Chq line closes through line spacing: the next block's
// narration starts about 24pt lower while a block's own tail lines sit within
// about 12pt of the anchor.
export const spacedBlocks = { pages: [page([
  ...evidence(), ...header(),
  ...transaction({
    narration: ['ATM CASH-EXAMPLE-', 'BRANCHKLIN-01/06/26'],
    date: '01-06-2026', withdrawal: '40.00', balance: '60.00',
    continuation: ['10:11:12/1008'],
  }),
  ...transaction({
    narration: ['UPI/CR/200000000005/EXAMPLE'],
    date: '02-06-2026', particulars: '6100000004000/02/06/2026', deposit: '90.00', balance: '150.00',
    continuation: ['13:14:15'], chq: '200000000005',
  }, 439.5),
  ...footer('1'),
])] };

export const context = { account: { id: 'example-account', bankId: 'canara', currency: 'INR' }, statementId: 'example-statement' };
