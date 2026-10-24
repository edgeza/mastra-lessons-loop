# mastra-lessons-loop

A small Mastra agent that gets better at a task from feedback, without fine-tuning.

After each round, a reviewer agent looks at what the extractor got wrong and writes a few short lessons. A sceptic step checks each lesson against the training set and throws out any that make things worse. The lessons that survive are kept in Mastra working memory, and the next round reads them. Accuracy is measured on held-out data every round.

I run the same pattern in a Python LangGraph system (reviewer writes lessons, a sceptic agent challenges decisions, every step is audit-logged). This is a port of the idea to Mastra, on a task small enough to check against ground truth.

## The task

Pull five fields (vendor, invoice number, date, total, currency) out of 30 synthetic invoices. All of the data is made up and generated from a fixed seed in `src/dataset.ts`. It has the traps that show up in real South African invoices: "Bill To" and "From" on the same page, DD/MM dates, subtotal next to total, and amounts written as `12 345,67`.

18 invoices are used for training and reflection, and 12 are held out for scoring.

## How it works

```
baseline on held-out (no lessons)
for each iteration:
  run extractor on train with current lessons  -> score vs ground truth
  reviewer reads the error counts               -> proposes up to 2 lessons
  sceptic re-scores train with each candidate   -> keep only if score does not drop
  store lessons in Mastra working memory        (max 6, max 160 chars, deduped)
  score on held-out                             -> report
```

- `src/agents.ts`: two Mastra `Agent`s, an extractor and a reviewer. Lessons go into the extractor's instructions per call.
- `src/scorers.ts`: a deterministic field-level scorer, wrapped as a Mastra scorer with `createScorer` (`generateScore` and `generateReason`). Both are run, and the test checks they agree.
- `src/lessons.ts`: lessons are stored as resource-scoped working memory via `@mastra/memory`. In-memory storage by default; any Mastra storage adapter can be passed in.
- `src/audit.ts`: append-only JSONL log of every extraction, reflection, sceptic decision, memory write and held-out score. Written to `runs/`.
- `src/cost.ts`: token and cost tracking per run. Set `PRICE_IN_PER_M` and `PRICE_OUT_PER_M` for your model.
- `src/mock-model.ts`: a deterministic mock model (see below).

## Running it

Needs Node 20+ and pnpm.

```
pnpm install
pnpm test
pnpm bench
```

With no API key set, everything runs against the mock model, offline and free. To use a real model, copy `.env.example` and set one of:

- `OPENROUTER_API_KEY` (model from `MODEL`, default `openai/gpt-4o-mini`)
- `OPENAI_API_KEY` (model from `MODEL`, default `gpt-4o-mini`)

Then `MOCK=0 pnpm bench`. Keys are read from the environment only and are never written to disk.

## Results (mock model)

These numbers come from the mock model, not a real LLM. They show that the loop, scoring, memory and sceptic steps work end to end. They say nothing about how much a real model would gain.

| Iteration | Held-out field accuracy | Lessons in memory | Accepted / rejected |
|---|---|---|---|
| 0 (baseline) | 23.3% | 0 | - |
| 1 | 43.3% | 2 | 2 / 0 |
| 2 | 83.3% | 4 | 2 / 0 |
| 3 | 83.3% | 4 | 0 / 1 |
| 4 | 100.0% | 5 | 1 / 0 |

In round 3 the reviewer proposes "If unsure, default the currency to USD." The sceptic sees the training score drop and rejects it. The reviewer is told about rejected lessons and doesn't propose them again.

## About the mock

The mock is a scripted extractor with known failure modes. Each one is fixed only when a matching lesson is in its system prompt. The mock reviewer picks lessons from a fixed list based on which fields had the most errors, and that list includes one deliberately bad lesson. So in mock mode the improvement is designed in. What the mock does test is the plumbing: that lessons are proposed, filtered, deduped, capped, stored, read back and actually change the prompt, and that held-out scoring and the audit log reflect that. Token counts in mock mode are estimated from character length.

## Limitations

- No real-model results yet. Those need an API key and are the obvious next step.
- The task is easy and narrow. Five fields with exact-match scoring is a clean signal, but it doesn't test lessons that need judgement.
- The sceptic only checks the training set, so with a small set it can accept a lesson that overfits. A separate validation split would be better.
- Lessons are plain text in the prompt. Nothing stops a real reviewer from writing a lesson that leaks a specific example; the prompt asks it not to, and the cap limits the damage.
- Twelve held-out invoices is a small sample. With a real model I'd run several seeds and report spread.

## Next steps

- Run with two or three real models and publish the table next to the mock one.
- Add a validation split for the sceptic and keep the test split untouched until the end.
- Try LLM-judged scorers for fields where exact match is too strict, and compare them with the deterministic scorer.
- Let lessons expire if they stop earning their place, rather than only capping by recency.
- Register the agents and scorer on a `Mastra` instance so the runs show up in Mastra's own tracing and eval storage.

## License

MIT. Copyright (c) 2026 Juan van Wyk.
