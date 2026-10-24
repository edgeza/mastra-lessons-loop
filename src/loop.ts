import type { Agent } from '@mastra/core/agent';
import { createAgents, extractorInstructions, parseJson, REVIEWER_BASE } from './agents.js';
import { AuditLog } from './audit.js';
import { CostTracker } from './cost.js';
import { generateDataset, split, type InvoiceSample } from './dataset.js';
import { LessonStore, mergeLessons } from './lessons.js';
import type { AgentModel } from './model.js';
import { FIELDS, fieldAccuracyScorer, scoreFields, type Field } from './scorers.js';

export interface EvalResult {
  mean: number; // deterministic scorer
  mastraMean: number; // same check via the Mastra scorer
  errorCounts: Record<Field, number>;
}

export interface IterationResult {
  iteration: number;
  lessons: string[];
  proposed: string[];
  accepted: string[];
  rejected: string[];
  train: number;
  test: number;
}

export interface LoopOptions {
  model: AgentModel;
  iterations?: number;
  audit?: AuditLog;
  cost?: CostTracker;
  samples?: InvoiceSample[];
}

async function evaluate(agent: Agent, lessons: string[], set: InvoiceSample[], split: string, ctx: { audit: AuditLog; cost: CostTracker; iteration: number }): Promise<EvalResult> {
  const errorCounts = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<Field, number>;
  let sum = 0;
  let mastraSum = 0;
  const instructions = extractorInstructions(lessons);
  for (const s of set) {
    const res = await agent.generate(`INVOICE:\n${s.text}`, { instructions });
    ctx.cost.add(res.usage);
    const predicted = parseJson(res.text);
    const det = scoreFields(predicted, s.expected);
    const mastra = await fieldAccuracyScorer.run({ input: s.text, output: predicted, groundTruth: s.expected });
    sum += det.score;
    mastraSum += mastra.score ?? 0;
    det.wrong.forEach((f) => errorCounts[f]++);
    ctx.audit.write({ step: 'extract', iteration: ctx.iteration, split, sample: s.id, score: det.score, wrong: det.wrong, reason: mastra.reason, usage: res.usage });
  }
  return { mean: sum / set.length, mastraMean: mastraSum / set.length, errorCounts };
}

/**
 * The loop:
 *  0. baseline on held-out data, no lessons
 *  per iteration:
 *  1. run extractor on train with current lessons, score against ground truth
 *  2. reviewer reads the error summary and proposes lessons
 *  3. sceptic: re-score train with each candidate added; keep it only if train score does not drop
 *  4. store accepted lessons in Mastra working memory (capped, deduped)
 *  5. score on held-out test with the new lessons
 */
export async function runLoop(opts: LoopOptions): Promise<{ baseline: number; iterations: IterationResult[]; cost: CostTracker }> {
  const audit = opts.audit ?? new AuditLog();
  const cost = opts.cost ?? new CostTracker();
  const { train, test } = split(opts.samples ?? generateDataset());
  const { extractor, reviewer } = createAgents(opts.model);
  const store = new LessonStore();
  const rejected: string[] = [];

  const base = await evaluate(extractor, [], test, 'test', { audit, cost, iteration: 0 });
  audit.write({ step: 'baseline', test: base.mean, mastraScorer: base.mastraMean });

  const iterations: IterationResult[] = [];
  for (let i = 1; i <= (opts.iterations ?? 4); i++) {
    const ctx = { audit, cost, iteration: i };
    const lessons = await store.get();
    const tr = await evaluate(extractor, lessons, train, 'train', ctx);

    const payload = { errorCounts: tr.errorCounts, current: lessons, rejected };
    const review = await reviewer.generate(`Training accuracy ${(tr.mean * 100).toFixed(1)}%.\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``, { instructions: REVIEWER_BASE });
    cost.add(review.usage);
    const proposed = mergeLessons([], review.text.split('\n').filter((l) => l.trim().startsWith('-')), 2);
    audit.write({ step: 'reflect', iteration: i, trainScore: tr.mean, errorCounts: tr.errorCounts, proposed });

    const accepted: string[] = [];
    let current = lessons;
    let currentScore = tr.mean;
    for (const cand of proposed) {
      const trial = mergeLessons(current, [cand]);
      const r = await evaluate(extractor, trial, train, 'train-sceptic', ctx);
      const keep = r.mean >= currentScore;
      audit.write({ step: 'sceptic', iteration: i, lesson: cand, before: currentScore, after: r.mean, decision: keep ? 'accept' : 'reject' });
      if (keep) {
        accepted.push(cand);
        current = trial;
        currentScore = r.mean;
      } else rejected.push(cand);
    }
    await store.set(current);
    audit.write({ step: 'memory', iteration: i, lessons: current });

    const te = await evaluate(extractor, current, test, 'test', ctx);
    audit.write({ step: 'heldout', iteration: i, test: te.mean, mastraScorer: te.mastraMean, cost: cost.snapshot() });
    iterations.push({ iteration: i, lessons: current, proposed, accepted, rejected: proposed.filter((p) => !accepted.includes(p)), train: tr.mean, test: te.mean });
  }
  return { baseline: base.mean, iterations, cost };
}
