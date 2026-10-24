export interface Usage { inputTokens: number; outputTokens: number }

/** USD per million tokens. Override with PRICE_IN_PER_M / PRICE_OUT_PER_M for your model. */
export class CostTracker {
  inputTokens = 0;
  outputTokens = 0;
  calls = 0;
  constructor(
    readonly priceInPerM = Number(process.env.PRICE_IN_PER_M ?? 0.15),
    readonly priceOutPerM = Number(process.env.PRICE_OUT_PER_M ?? 0.6),
  ) {}
  add(u: Partial<Usage> | undefined): void {
    this.calls++;
    this.inputTokens += u?.inputTokens ?? 0;
    this.outputTokens += u?.outputTokens ?? 0;
  }
  get usd(): number {
    return (this.inputTokens * this.priceInPerM + this.outputTokens * this.priceOutPerM) / 1e6;
  }
  snapshot() {
    return { calls: this.calls, inputTokens: this.inputTokens, outputTokens: this.outputTokens, usd: Number(this.usd.toFixed(6)) };
  }
}
