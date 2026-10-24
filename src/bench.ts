import { AuditLog } from './audit.js';
import { runLoop } from './loop.js';
import { pickModel } from './model.js';

const { model, label, mock } = pickModel();
const iterations = Number(process.env.ITERATIONS ?? 4);
const auditPath = `runs/audit-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;

console.log(`model: ${label}`);
if (mock) console.log('NOTE: mock mode. Scores show the loop works end to end; they are not real model results.');

const { baseline, iterations: its, cost } = await runLoop({ model, iterations, audit: new AuditLog(auditPath) });

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
console.log('\nHeld-out field accuracy (12 invoices, 5 fields each)');
console.log('iter | train (before) | held-out | lessons | accepted / rejected this round');
console.log(`   0 |              - | ${pct(baseline).padStart(8)} |       0 | baseline, no lessons`);
for (const r of its) {
  console.log(`${String(r.iteration).padStart(4)} | ${pct(r.train).padStart(14)} | ${pct(r.test).padStart(8)} | ${String(r.lessons.length).padStart(7)} | +${r.accepted.length} / -${r.rejected.length}`);
}
console.log('\nFinal lessons:');
for (const l of its.at(-1)?.lessons ?? []) console.log(`- ${l}`);
const rejected = its.flatMap((r) => r.rejected);
if (rejected.length) {
  console.log('\nRejected by sceptic:');
  for (const l of rejected) console.log(`- ${l}`);
}
const c = cost.snapshot();
console.log(`\nLLM calls: ${c.calls}, tokens in/out: ${c.inputTokens}/${c.outputTokens}, est. cost: $${c.usd.toFixed(4)}${mock ? ' (mock tokens, estimated from characters)' : ''}`);
console.log(`Audit log: ${auditPath}`);
