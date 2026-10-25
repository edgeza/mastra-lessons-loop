# mastra-lessons-loop

A small Mastra agent that gets better at a task from feedback, without fine-tuning.

After each round, a reviewer agent looks at what the extractor got wrong and writes a few short lessons. A sceptic step checks each lesson against the training set and throws out any that make things worse. The lessons that survive are kept in Mastra working memory, and the next round reads them. Accuracy is measured on held-out data every round.

I run the same pattern in a Python LangGraph system (reviewer writes lessons, a sceptic agent challenges decisions, every step is audit-logged). This is a port of the idea to Mastra, on a task small enough to check against ground truth.

## The task

Pull five fields (vendor, invoice number, date, total, currency) out of 30 synthetic invoices. All of the data is made up and generated from a fixed seed in `src/dataset.ts`. It has the traps that show up in real South African invoices: "Bill To" and "From" on the same page, DD/MM dates, subtotal next to total, and amounts written as `12 345,67`.

18 invoices are used for training and reflection, and 12 are held out for scoring.

There are three versions of the data, picked with `DATASET`:

- `easy`: the original 30 invoices. The mock runs on this one.
- `hard`: every third invoice (10 in total, 6 train and 4 held out) gets a messier layout: a letterhead instead of a "From:" line, a collections company under "Remit payment to:", and one of four traps (order, delivery and tax-invoice dates in mixed formats; no total line, only amount excl. VAT plus VAT; `€ 12.345,67` / `$12,345.67` / `R12,345.67` with a "for reference" US$ amount; PO number and quote reference before the invoice number).
- `house` (default for real models): `hard`, booked under three house rules. These are conventions of a made-up finance team that can't be read off the invoice, and the extractor prompt doesn't mention them:
  1. The invoice number is booked without the `INV-` prefix.
  2. The total is booked excluding VAT, since VAT is claimed back separately.
  3. The date is the posting period: the last day of the month the invoice is dated in.

Why the house rules exist: on `easy` and `hard`, MiniMax-M3.1-Flash scored 98 to 100% before any lessons, so there was nothing for the loop to do. A strong model already reads invoices well. What it can't know is how a particular team wants things booked, and that's the kind of thing feedback is for. I wrote the `hard` set and the house rules once, each before running the model on it, and didn't change them after seeing results.

## How it works

```
baseline on held-out (no lessons)
for each iteration:
  run extractor on train with current lessons  -> score vs ground truth
  reviewer reads error counts + a few examples  -> proposes up to 2 lessons (skipped if train has no errors)
  sceptic re-scores train with each candidate   -> keep only if score does not drop
  store lessons in Mastra working memory        (max 6, max 160 chars, deduped)
  score on held-out                             -> report
```

The reviewer sees per-field error counts and up to two "got X, expected Y" examples per field, all from the training set. With counts alone it can't tell what kind of mistake it is looking at.

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

With no API key set, everything runs against the mock model, offline and free. To use a real model, copy `.env.example` to `.env`, load it into your shell, and set one of:

- `ANTHROPIC_API_KEY` (model from `MODEL`, default `claude-opus-5-5`)
- `MINIMAX_API_KEY` (model from `MODEL`, default `MiniMax-M3.1-Flash`)
- `OPENROUTER_API_KEY` (model from `MODEL`, default `openai/gpt-4o-mini`)
- `OPENAI_API_KEY` (model from `MODEL`, default `gpt-4o-mini`)

Then `MOCK=0 pnpm bench`. The code reads keys from the environment and never writes them anywhere. `.env` is gitignored.

## Results (real model)

MiniMax-M3.1-Flash, `house` dataset, 4 iterations, 3 runs, 25 October 2026. Held-out field accuracy (12 invoices, 5 fields each):

| Iteration | Run 1 | Run 2 | Run 3 | Mean | Range |
|---|---|---|---|---|---|
| 0 (baseline) | 40.0% | 40.0% | 40.0% | 40.0% | 40.0 to 40.0 |
| 1 | 60.0% | 80.0% | 80.0% | 73.3% | 60.0 to 80.0 |
| 2 | 80.0% | 80.0% | 80.0% | 80.0% | 80.0 to 80.0 |
| 3 | 80.0% | 78.3% | 76.7% | 78.3% | 76.7 to 80.0 |
| 4 | 80.0% | 78.3% | 80.0% | 79.4% | 78.3 to 80.0 |

Total cost for all three runs: $0.16 (244 to 262 LLM calls per run, about $0.05 a run at $0.15 / $0.60 per million tokens in / out).

What happened, from the audit logs:

- At baseline the model gets vendor and currency right on every held-out invoice and invoice number, total and date wrong on every one, because it doesn't know the house rules. That's the 40%.
- Two of the three house rules were learned in every run, within one or two rounds: no `INV-` prefix, and total excluding VAT.
- The month-end date rule was never learned. All 12 held-out dates were still wrong at the end of every run. Given two examples (23 March booked as 31 March, 11 September as 30 September), the reviewer guessed "due date", "billing period end" or "derive from payment terms" instead. Run 1 even ended up with a lesson that contradicts the rule ("do not substitute month-end dates") because it didn't lower the training score.
- So the plateau at 80% is the date field. The loop learns rules that are visible in a couple of examples and misses one that needs a less obvious generalisation.

Lessons the sceptic accepted (verbatim from the runs):

- "Remove alphabetic prefixes such as “INV-” from invoice numbers, retaining the numeric year and sequence." (train 40.0% to 60.0%)
- "If tax is itemized separately, use the pre-tax subtotal rather than the tax-inclusive amount." (train 60.0% to 80.0%)
- "When a billing period is given by month, use that month's final calendar day as the date." (accepted in run 2, train 77.8% to 80.0%; close to the real rule, but tied to a "billing period" the invoices don't have, and held-out dates stayed wrong)

A lesson the sceptic rejected:

- "Associate each date with its adjacent label before extraction; do not let a prominent header date override a separately labeled target date." Training accuracy went from 80.0% to 78.9% with it, so it was dropped. It sounds sensible, but it cost a field on the training set, and that is all the sceptic needs.

One rejection in run 2 was a bug: the training score went from 0.78888…92 to 0.78888…91, which is floating-point noise, and the sceptic treated it as a drop. The comparison now has a small tolerance. That fix came after the three runs above.

The same bug was hiding in the mock. Its deliberately bad lesson used to be "If unsure, default the currency to USD." The training set has two EUR and two USD invoices, so that lesson swaps two right answers for two others and scores exactly the same, and the sceptic had only been rejecting it because of float noise. On the held-out set (two EUR, one USD) it really is worse. That's the "sceptic only checks the training set" limitation in miniature. I replaced it with a bad lesson that lowers the training score for real.

## Results (mock model)

These numbers come from the mock model, not a real LLM. They show that the loop, scoring, memory and sceptic steps work end to end. They say nothing about how much a real model would gain.

| Iteration | Held-out field accuracy | Lessons in memory | Accepted / rejected |
|---|---|---|---|
| 0 (baseline) | 23.3% | 0 | - |
| 1 | 43.3% | 2 | 2 / 0 |
| 2 | 83.3% | 4 | 2 / 0 |
| 3 | 83.3% | 4 | 0 / 1 |
| 4 | 100.0% | 5 | 1 / 0 |

In round 3 the reviewer proposes "Write currencies as symbols, not codes: "EUR" becomes "€"." The two EUR invoices in the training set go wrong, the training score drops, and the sceptic rejects it. The reviewer is told about rejected lessons and doesn't propose them again.

## About the mock

The mock is a scripted extractor with known failure modes. Each one is fixed only when a matching lesson is in its system prompt. The mock reviewer picks lessons from a fixed list based on which fields had the most errors, and that list includes one deliberately bad lesson. So in mock mode the improvement is designed in. What the mock does test is the plumbing: that lessons are proposed, filtered, deduped, capped, stored, read back and actually change the prompt, and that held-out scoring and the audit log reflect that. Token counts in mock mode are estimated from character length.

## Why not fine-tune?

For this kind of problem, lessons are a better fit. A lesson costs one reviewer call and a few sceptic re-scores, not a training run. Every lesson is a line of text with an audit record of why it was accepted, so I can read exactly what the agent has been told. Removing a bad lesson takes effect on the next call, and I don't have to retrain or keep model versions around. The cap of six short lessons keeps the prompt from growing over time. Fine-tuning makes more sense when there's a lot of labelled data and the behaviour is too fuzzy to write down. House rules like the ones here are neither.

## Limitations

- The sceptic accepts any lesson that doesn't lower the training score. That lets in neutral lessons, and in run 1 one that contradicts a house rule. Requiring a strict improvement was too harsh: some lessons only help together (in the mock, "use Total Due" does nothing until "comma is the decimal" is also there), so I left it at "does not drop".
- The sceptic only checks the training set, so with a small set it can accept a lesson that overfits. A separate validation split would be better.
- The reviewer sees two examples per field. That was enough for the prefix and VAT rules and not enough for the month-end rule.
- The house rules were added because the model was already near 100% without them. They are a fair test of learning conventions from feedback, but they are my own design, not a real team's rules.
- Lessons are plain text in the prompt. Nothing stops a real reviewer from writing a lesson that leaks a specific example; the prompt asks it not to, and the cap limits the damage.
- Twelve held-out invoices, one model and three runs is a small sample.

## Next steps

- Give the reviewer more examples for fields that stay wrong across rounds, and see whether that gets the date rule.
- Add a validation split for the sceptic and keep the test split untouched until the end.
- Run the same table on a second model (Claude, GPT) to see if the plateau is the model or the loop.
- Try LLM-judged scorers for fields where exact match is too strict, and compare them with the deterministic scorer.
- Let lessons expire if they stop earning their place, rather than only capping by recency.
- Register the agents and scorer on a `Mastra` instance so the runs show up in Mastra's own tracing and eval storage.

## License

MIT. Copyright (c) 2026 Juan van Wyk.
