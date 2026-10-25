import { describe, expect, it } from 'vitest';
import { formatAmount, generateDataset, split } from '../src/dataset.js';

describe('dataset', () => {
  it('is deterministic and splits 18/12', () => {
    const a = generateDataset();
    expect(a).toEqual(generateDataset());
    expect(a).toHaveLength(30);
    const { train, test } = split(a);
    expect(train).toHaveLength(18);
    expect(test).toHaveLength(12);
  });
  it('formats amounts the South African way', () => {
    expect(formatAmount(1234567.5)).toBe('1 234 567,50');
  });
  it('hard set changes every third invoice, keeps ground truth and the rest identical', () => {
    const easy = generateDataset();
    const hard = generateDataset(30, 42, { hard: true });
    expect(hard.map((s) => s.expected)).toEqual(easy.map((s) => s.expected));
    hard.forEach((s, i) => (i % 3 === 0 ? expect(s.text).not.toBe(easy[i]!.text) : expect(s.text).toBe(easy[i]!.text)));
    expect(hard.filter((s, i) => i % 3 === 0 && !s.text.includes('From:'))).toHaveLength(10);
  });
  it('house rules change only invoice number, total and date', () => {
    const plain = generateDataset(30, 42, { hard: true });
    const house = generateDataset(30, 42, { hard: true, houseRules: true });
    expect(house.map((s) => s.text)).toEqual(plain.map((s) => s.text));
    const [p, h] = [plain[0]!.expected, house[0]!.expected];
    expect(h.invoiceNumber).toBe(p.invoiceNumber.replace('INV-', ''));
    expect(h.total).toBeLessThan(p.total);
    expect(h.date).toBe('2026-03-31');
    expect([h.vendor, h.currency]).toEqual([p.vendor, p.currency]);
  });
  it('marks every sample as synthetic', () => {
    for (const s of generateDataset(30, 42, { hard: true })) expect(s.text).toContain('SYNTHETIC');
    for (const s of generateDataset()) expect(s.text).toContain('SYNTHETIC');
  });
});
