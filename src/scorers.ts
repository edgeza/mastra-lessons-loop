import { createScorer } from '@mastra/core/evals';
import type { InvoiceFields } from './dataset.js';

export const FIELDS = ['vendor', 'invoiceNumber', 'date', 'total', 'currency'] as const;
export type Field = (typeof FIELDS)[number];

export interface FieldScore {
  score: number; // 0..1, share of fields correct
  wrong: Field[];
}

/** Deterministic ground-truth scorer. Totals compare to the cent. */
export function scoreFields(predicted: Partial<InvoiceFields> | null, expected: InvoiceFields): FieldScore {
  const wrong: Field[] = [];
  for (const f of FIELDS) {
    const p = predicted?.[f];
    const ok =
      f === 'total'
        ? typeof p === 'number' && Math.abs(p - expected.total) < 0.005
        : typeof p === 'string' && p.trim().toLowerCase() === String(expected[f]).toLowerCase();
    if (!ok) wrong.push(f);
  }
  return { score: (FIELDS.length - wrong.length) / FIELDS.length, wrong };
}

/** The same check exposed as a Mastra scorer, so it can be attached to agents or run via runEvals. */
export const fieldAccuracyScorer = createScorer({
  id: 'invoice-field-accuracy',
  description: 'Share of invoice fields that exactly match ground truth.',
})
  .generateScore(({ run }) => scoreFields(run.output as Partial<InvoiceFields> | null, run.groundTruth as InvoiceFields).score)
  .generateReason(({ run }) => {
    const { wrong } = scoreFields(run.output as Partial<InvoiceFields> | null, run.groundTruth as InvoiceFields);
    return wrong.length ? `Wrong fields: ${wrong.join(', ')}` : 'All fields correct';
  });
