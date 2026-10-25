import type { Agent } from '@mastra/core/agent';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createMockModel } from './mock-model.js';

export type AgentModel = ConstructorParameters<typeof Agent>[0]['model'];

export interface ModelChoice { model: AgentModel; label: string; mock: boolean }

/**
 * MOCK=1 (or no key set) -> deterministic mock.
 * ANTHROPIC_API_KEY -> Anthropic, model from MODEL (default claude-opus-5-5).
 * MINIMAX_API_KEY -> MiniMax (OpenAI-compatible API), model from MODEL (default MiniMax-M3.1-Flash).
 * OPENROUTER_API_KEY -> OpenRouter, model from MODEL (default openai/gpt-4o-mini).
 * OPENAI_API_KEY -> OpenAI, model from MODEL (default gpt-4o-mini).
 */
export function pickModel(env: NodeJS.ProcessEnv = process.env): ModelChoice {
  const hasKey = Boolean(env.ANTHROPIC_API_KEY || env.MINIMAX_API_KEY || env.OPENROUTER_API_KEY || env.OPENAI_API_KEY);
  if (env.MOCK !== '0' && (env.MOCK === '1' || !hasKey)) {
    return { model: createMockModel() as unknown as AgentModel, label: 'mock (deterministic, offline)', mock: true };
  }
  if (env.ANTHROPIC_API_KEY) {
    const id = env.MODEL || 'claude-opus-5-5';
    const provider = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return { model: provider(id) as unknown as AgentModel, label: `anthropic:${id}`, mock: false };
  }
  if (env.MINIMAX_API_KEY) {
    const id = env.MODEL || 'MiniMax-M3.1-Flash';
    const provider = createOpenAI({ apiKey: env.MINIMAX_API_KEY, baseURL: 'https://api.minimax.io/v1' });
    return { model: provider.chat(id) as unknown as AgentModel, label: `minimax:${id}`, mock: false };
  }
  if (env.OPENROUTER_API_KEY) {
    const id = env.MODEL || 'openai/gpt-4o-mini';
    const provider = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    return { model: provider.chat(id) as unknown as AgentModel, label: `openrouter:${id}`, mock: false };
  }
  if (env.OPENAI_API_KEY) {
    const id = env.MODEL || 'gpt-4o-mini';
    const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return { model: provider(id) as unknown as AgentModel, label: `openai:${id}`, mock: false };
  }
  throw new Error('MOCK=0 but no ANTHROPIC_API_KEY, MINIMAX_API_KEY, OPENROUTER_API_KEY or OPENAI_API_KEY set');
}
