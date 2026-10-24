import { Agent } from '@mastra/core/agent';
import type { AgentModel } from './model.js';
import type { InvoiceFields } from './dataset.js';

export const EXTRACTOR_BASE = `ROLE: extractor
Extract fields from the invoice text. Reply with JSON only:
{"vendor": string, "invoiceNumber": string, "date": "YYYY-MM-DD", "total": number, "currency": string}`;

export const REVIEWER_BASE = `ROLE: reviewer
You review an extraction agent's mistakes on a training set and write short, general lessons it should follow next time.
Rules: at most 2 new lessons, one line each, under 160 characters, start each with "- ".
Do not repeat current lessons or previously rejected ones. Do not quote specific invoice values.`;

export function extractorInstructions(lessons: string[]): string {
  if (!lessons.length) return EXTRACTOR_BASE;
  return `${EXTRACTOR_BASE}\n\nLessons from earlier runs:\n${lessons.map((l) => `- ${l}`).join('\n')}`;
}

export function createAgents(model: AgentModel) {
  const extractor = new Agent({ id: 'invoice-extractor', name: 'Invoice extractor', instructions: EXTRACTOR_BASE, model });
  const reviewer = new Agent({ id: 'lesson-reviewer', name: 'Lesson reviewer', instructions: REVIEWER_BASE, model });
  return { extractor, reviewer };
}

export function parseJson(text: string): Partial<InvoiceFields> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as Record<string, unknown>;
    if (typeof v.total === 'string') v.total = Number(v.total.replace(/[^\d.-]/g, ''));
    return v as Partial<InvoiceFields>;
  } catch {
    return null;
  }
}
