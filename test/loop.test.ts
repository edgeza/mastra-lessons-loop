import { readFileSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AuditLog } from '../src/audit.js';
import { runLoop } from '../src/loop.js';
import { pickModel } from '../src/model.js';

describe('learning loop (mock model)', () => {
  it('improves held-out accuracy and the sceptic rejects the bad lesson', async () => {
    const path = 'runs/test-audit.jsonl';
    rmSync(path, { force: true });
    const { model, mock } = pickModel({ MOCK: '1' });
    expect(mock).toBe(true);
    const { baseline, iterations, cost } = await runLoop({ model, iterations: 4, audit: new AuditLog(path) });

    expect(baseline).toBeLessThan(0.5);
    expect(iterations.at(-1)!.test).toBe(1);
    for (let i = 1; i < iterations.length; i++) expect(iterations[i]!.test).toBeGreaterThanOrEqual(iterations[i - 1]!.test);
    expect(iterations.flatMap((r) => r.rejected)).toContain('If unsure, default the currency to USD.');
    expect(cost.snapshot().inputTokens).toBeGreaterThan(0);

    const lines = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { step: string; seq: number });
    expect(lines.map((l) => l.seq)).toEqual(lines.map((_, i) => i + 1));
    for (const step of ['baseline', 'extract', 'reflect', 'sceptic', 'memory', 'heldout']) {
      expect(lines.some((l) => l.step === step)).toBe(true);
    }
  });

  it('falls back to mock when no key is set', () => {
    expect(pickModel({}).mock).toBe(true);
    expect(() => pickModel({ MOCK: '0' })).toThrow();
  });
});
