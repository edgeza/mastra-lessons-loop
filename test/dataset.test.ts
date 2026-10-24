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
  it('marks every sample as synthetic', () => {
    for (const s of generateDataset()) expect(s.text).toContain('SYNTHETIC');
  });
});
