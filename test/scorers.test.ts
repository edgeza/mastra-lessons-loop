import { describe, expect, it } from 'vitest';
import { generateDataset } from '../src/dataset.js';
import { fieldAccuracyScorer, scoreFields } from '../src/scorers.js';

const s = generateDataset()[0]!;

describe('scorers', () => {
  it('gives 1 for an exact match', () => {
    expect(scoreFields(s.expected, s.expected)).toEqual({ score: 1, wrong: [] });
  });
  it('flags wrong fields and handles null', () => {
    expect(scoreFields({ ...s.expected, total: s.expected.total + 1 }, s.expected).wrong).toEqual(['total']);
    expect(scoreFields(null, s.expected).score).toBe(0);
  });
  it('Mastra scorer agrees with the deterministic one', async () => {
    const out = { ...s.expected, date: '1999-01-01' };
    const r = await fieldAccuracyScorer.run({ input: s.text, output: out, groundTruth: s.expected });
    expect(r.score).toBeCloseTo(0.8);
    expect(r.reason).toContain('date');
  });
});
