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

export function generateDataset(count = 30, seed = 42): InvoiceSample[] {
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
    const text = [
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
    out.push({
      id: `inv-${pad(i + 1)}`,
      text,
      expected: { vendor, invoiceNumber, date: `${year}-${pad(month)}-${pad(day)}`, total, currency },
    });
  }
  return out;
}

export function split(samples: InvoiceSample[], trainSize = 18) {
  return { train: samples.slice(0, trainSize), test: samples.slice(trainSize) };
}
