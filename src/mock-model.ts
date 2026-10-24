import { MockLanguageModelV4 } from 'ai/test';

/**
 * Deterministic stand-in for an LLM so tests and the benchmark run offline and free.
 *
 * It is NOT a language model. It is a scripted extractor with known failure modes
 * (wrong party as vendor, US date order, subtotal instead of total, SA number format,
 * currency symbols instead of ISO codes). Each failure mode is fixed only when the system
 * prompt contains a matching lesson. The scripted reviewer proposes lessons from a fixed
 * catalogue based on the error summary it is given, including one deliberately bad lesson
 * so the sceptic step has something to reject. Numbers from mock mode show that the loop
 * plumbing works, not how a real model would behave.
 */

export const LESSON_CATALOGUE: Record<string, string[]> = {
  vendor: ['The vendor is the issuer on the "From:" line, never the "Bill To:" party.'],
  date: ['Dates are written DD/MM/YYYY (day first); convert to ISO YYYY-MM-DD.'],
  total: [
    'The total is the "Total Due" amount including VAT, not the subtotal.',
    'Amounts use a space as thousands separator and a comma as decimal: "12 345,67" is 12345.67.',
  ],
  currency: [
    'If unsure, default the currency to USD.', // deliberately bad, for the sceptic to reject
    'Return ISO 4217 currency codes: "R" is ZAR, "US$" is USD, "EUR" is EUR.',
  ],
};

type PromptMsg = { role: string; content: unknown };

function textOf(prompt: PromptMsg[], role: string): string {
  return prompt
    .filter((m) => m.role === role)
    .map((m) =>
      typeof m.content === 'string'
        ? m.content
        : (m.content as Array<{ type: string; text?: string }>).map((p) => p.text ?? '').join(''),
    )
    .join('\n');
}

const has = (sys: string, needle: string) => sys.toLowerCase().includes(needle.toLowerCase());

export function mockExtract(system: string, doc: string): Record<string, unknown> {
  const line = (label: string) => doc.split('\n').find((l) => l.startsWith(label))?.split(': ').slice(1).join(': ').trim() ?? '';

  const vendor = has(system, '"From:" line') ? line('From:') : line('Bill To:');
  const invoiceNumber = line('Invoice No:');

  const [a, b, y] = line('Date:').split('/');
  const date = has(system, 'DD/MM/YYYY') ? `${y}-${b}-${a}` : `${y}-${a}-${b}`;

  const amountLine = has(system, '"Total Due"') ? line('Total Due:') : line('Subtotal:');
  const raw = amountLine.replace(/^[^\d]+/, '');
  const total = has(system, 'comma as decimal')
    ? Number(raw.replace(/\s/g, '').replace(',', '.'))
    : Number(raw.replace(/[\s,]/g, ''));

  const symbol = amountLine.split(' ')[0] ?? '';
  let currency = symbol;
  if (has(system, 'ISO 4217')) currency = ({ R: 'ZAR', US$: 'USD', EUR: 'EUR' } as Record<string, string>)[symbol] ?? symbol;
  else if (has(system, 'default the currency to USD')) currency = 'USD';

  return { vendor, invoiceNumber, date, total, currency };
}

export function mockReview(user: string): string[] {
  const m = user.match(/```json\n([\s\S]*?)\n```/);
  const payload = JSON.parse(m?.[1] ?? '{}') as { errorCounts?: Record<string, number>; current?: string[]; rejected?: string[] };
  const known = new Set([...(payload.current ?? []), ...(payload.rejected ?? [])]);
  const ranked = Object.entries(payload.errorCounts ?? {}).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  const out: string[] = [];
  for (const [field] of ranked) {
    const next = (LESSON_CATALOGUE[field] ?? []).find((l) => !known.has(l));
    if (next) out.push(next);
    if (out.length === 2) break;
  }
  return out;
}

export function createMockModel() {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'deterministic-mock',
    doGenerate: async (opts) => {
      const prompt = opts.prompt as unknown as PromptMsg[];
      const system = textOf(prompt, 'system');
      const user = textOf(prompt, 'user');
      const text = system.includes('ROLE: reviewer')
        ? mockReview(user).map((l) => `- ${l}`).join('\n')
        : JSON.stringify(mockExtract(system, user.split('INVOICE:\n')[1] ?? user));
      const inTok = Math.ceil((system.length + user.length) / 4);
      const outTok = Math.ceil(text.length / 4);
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: inTok, noCache: inTok, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: outTok, text: outTok, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}
