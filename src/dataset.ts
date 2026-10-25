/**
 * Synthetic invoice dataset. Every vendor, customer and amount here is made up.
 * Generated from a fixed seed so the train/test split is identical on every run.
 */
export interface InvoiceFields {
  vendor: string;
  invoiceNumber: string;
  date: string; // ISO YYYY-MM-DD
  total: number; // amount due including VAT
  currency: 'ZAR' | 'USD' | 'EUR';
}

export interface InvoiceSample {
  id: string;
  text: string;
  expected: InvoiceFields;
}

const VENDORS = [
  'Karoo Paper Supplies (Pty) Ltd', 'Bluegum Logistics CC', 'Tafelberg Cloud Services',
  'Harbour Lane Catering', 'Fynbos Print Works', 'Northgate Security Systems',
  'Atlantic Office Furniture', 'Stellenrock IT Repairs', 'Lowveld Cleaning Co',
  'Riverbend Legal Services',
];
const CUSTOMERS = ['Example Holdings (Pty) Ltd', 'Demo Retail Group', 'Sample Foods Ltd'];
const CURRENCIES: InvoiceFields['currency'][] = ['ZAR', 'ZAR', 'ZAR', 'USD', 'EUR'];
const SYMBOL: Record<InvoiceFields['currency'], string> = { ZAR: 'R', USD: 'US$', EUR: 'EUR' };

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** South African style: space as thousands separator, comma as decimal. */
export function formatAmount(n: number): string {
  const [whole, cents] = n.toFixed(2).split('.') as [string, string];
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${cents}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** European style (dot thousands, comma decimal) and US style (comma thousands, dot decimal). */
export function formatAmountEu(n: number): string {
  return formatAmount(n).replace(/ /g, '.');
}
export function formatAmountUs(n: number): string {
  return formatAmount(n).replace(',', '.').replace(/ /g, ',');
}

export const HARD_TRAPS = ['dates', 'vat', 'currency', 'references'] as const;
export type HardTrap = (typeof HARD_TRAPS)[number];

interface Parts {
  vendor: string; customer: string; currency: InvoiceFields['currency'];
  day: number; month: number; year: number;
  subtotal: number; vat: number; total: number; invoiceNumber: string;
}

/**
 * A messier layout for the harder set. Every hard invoice drops the "From:" label for a
 * letterhead and names a separate collections company under "Remit payment to:", then adds
 * one trap from HARD_TRAPS. Extra numbers are derived from the invoice number so the
 * generator's random sequence, and so the easy invoices, stay the same.
 */
function hardText(p: Parts, trap: HardTrap): string {
  const sym = SYMBOL[p.currency];
  const n = Number(p.invoiceNumber.slice(-4));
  const za = (x: number) => `${sym} ${formatAmount(x)}`;
  const lines = [p.vendor.toUpperCase(), `VAT Reg No: 4${String(n * 9137).padStart(9, '0').slice(-9)}`, 'TAX INVOICE', `Bill To: ${p.customer}`];
  const date = `Date: ${pad(p.day)}/${pad(p.month)}/${p.year}`;
  const amounts = [`Subtotal: ${za(p.subtotal)}`, `VAT (15%): ${za(p.vat)}`, `Total Due: ${za(p.total)}`];
  if (trap === 'dates') {
    const om = p.month === 1 ? 12 : p.month - 1;
    const oy = p.month === 1 ? p.year - 1 : p.year;
    lines.push(`Invoice No: ${p.invoiceNumber}`, `Order Date: ${pad(Math.min(p.day, 28))}/${pad(om)}/${oy}`,
      `Delivery Date: ${pad(Math.min(p.day, 28))}/${pad(om)}/${oy} - partial`,
      `Tax Invoice Date: ${pad(p.day)}.${pad(p.month)}.${String(p.year).slice(-2)}`, 'Payment terms: 30 days from statement', ...amounts);
  } else if (trap === 'vat') {
    lines.push(`Invoice No: ${p.invoiceNumber}`, date, `Amount excl. VAT: ${za(p.subtotal)}`, `Add VAT @ 15%: ${za(p.vat)}`,
      'Prices quoted exclusive of VAT. Please pay the VAT-inclusive amount.');
  } else if (trap === 'currency') {
    const fmt = p.currency === 'EUR' ? (x: number) => `€ ${formatAmountEu(x)}` : p.currency === 'USD' ? (x: number) => `$${formatAmountUs(x)}` : (x: number) => `R${formatAmountUs(x)}`;
    lines.push(`Invoice No: ${p.invoiceNumber}`, date, `Net: ${fmt(p.subtotal)}`, `VAT 15%: ${fmt(p.vat)}`, `Gross amount payable: ${fmt(p.total)}`);
    if (p.currency === 'ZAR') lines.push(`For reference only: approx. US$ ${formatAmountUs(Math.round((p.total / 18.2) * 100) / 100)}`);
  } else {
    lines.push(n % 2 ? `PO Number: PO-${p.year}-${String((n * 7) % 9000 + 1000)}` : 'PO Number: not supplied',
      `Quote Ref: Q-${String((n * 13) % 90000 + 10000)}`, `Account: ACC-${String((n * 3) % 900 + 100)}`,
      `Document No: ${p.invoiceNumber}`, date, ...amounts);
  }
  lines.push('Remit payment to: Kloofnek Collections (Pty) Ltd, account 62 0000 0000', 'SYNTHETIC SAMPLE - NOT A REAL INVOICE.');
  return lines.join('\n');
}

/** Every third invoice in the hard set gets a messier layout; traps rotate so each appears in train and test. */
export const isHard = (i: number) => i % 3 === 0;

/**
 * House rules: how this (made-up) finance team wants invoices booked. None of them can be
 * read off the invoice, and the extractor prompt doesn't mention them, so a model can only
 * pick them up from feedback. Fixed before any real-model results were recorded.
 */
export const HOUSE_RULES = [
  'invoiceNumber is booked without the "INV-" prefix: INV-2026-6622 is 2026-6622.',
  'total is booked excluding VAT (VAT is claimed back separately), so it is the subtotal.',
  'date is the posting period: the last day of the month the invoice is dated in.',
] as const;

function applyHouseRules(e: InvoiceFields, subtotal: number, day: { month: number; year: number }): InvoiceFields {
  const lastDay = new Date(Date.UTC(day.year, day.month, 0)).getUTCDate();
  return { ...e, invoiceNumber: e.invoiceNumber.replace(/^INV-/, ''), total: subtotal, date: `${day.year}-${pad(day.month)}-${pad(lastDay)}` };
}

export function generateDataset(count = 30, seed = 42, opts: { hard?: boolean; houseRules?: boolean } = {}): InvoiceSample[] {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const out: InvoiceSample[] = [];
  for (let i = 0; i < count; i++) {
    const vendor = pick(VENDORS);
    const customer = pick(CUSTOMERS);
    const currency = pick(CURRENCIES);
    // Day always > 12 for half the set so DD/MM vs MM/DD actually matters.
    const day = i % 2 === 0 ? 13 + Math.floor(r() * 15) : 1 + Math.floor(r() * 12);
    const month = 1 + Math.floor(r() * 12);
    const year = 2025 + Math.floor(r() * 2);
    const subtotal = Math.round((200 + r() * 48000) * 100) / 100;
    const vat = Math.round(subtotal * 0.15 * 100) / 100;
    const total = Math.round((subtotal + vat) * 100) / 100;
    const invoiceNumber = `INV-${year}-${String(1000 + Math.floor(r() * 9000))}`;
    const sym = SYMBOL[currency];
    const easy = [
      'TAX INVOICE',
      `Bill To: ${customer}`,
      `From: ${vendor}`,
      `Invoice No: ${invoiceNumber}`,
      `Date: ${pad(day)}/${pad(month)}/${year}`,
      `Subtotal: ${sym} ${formatAmount(subtotal)}`,
      `VAT (15%): ${sym} ${formatAmount(vat)}`,
      `Total Due: ${sym} ${formatAmount(total)}`,
      'Thank you for your business. SYNTHETIC SAMPLE - NOT A REAL INVOICE.',
    ].join('\n');
    const text = opts.hard && isHard(i)
      ? hardText({ vendor, customer, currency, day, month, year, subtotal, vat, total, invoiceNumber }, HARD_TRAPS[(i / 3) % HARD_TRAPS.length]!)
      : easy;
    out.push({
      id: `inv-${pad(i + 1)}`,
      text,
      expected: opts.houseRules
        ? applyHouseRules({ vendor, invoiceNumber, date: `${year}-${pad(month)}-${pad(day)}`, total, currency }, subtotal, { month, year })
        : { vendor, invoiceNumber, date: `${year}-${pad(month)}-${pad(day)}`, total, currency },
    });
  }
  return out;
}

export function split(samples: InvoiceSample[], trainSize = 18) {
  return { train: samples.slice(0, trainSize), test: samples.slice(trainSize) };
}
