import type { Agent } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createMockModel } from './mock-model.js';

export type AgentModel = ConstructorParameters<typeof Agent>[0]['model'];

export interface ModelChoice { model: AgentModel; label: string; mock: boolean }

/**
 * MOCK=1 (or no key set) -> deterministic mock.
 * OPENROUTER_API_KEY -> OpenRouter, model from MODEL (default openai/gpt-4o-mini).
 * OPENAI_API_KEY -> OpenAI, model from MODEL (default gpt-4o-mini).
 */
export function pickModel(env: NodeJS.ProcessEnv = process.env): ModelChoice {
  if (env.MOCK !== '0' && (env.MOCK === '1' || (!env.OPENROUTER_API_KEY && !env.OPENAI_API_KEY))) {
    return { model: createMockModel() as unknown as AgentModel, label: 'mock (deterministic, offline)', mock: true };
  }
  if (env.OPENROUTER_API_KEY) {
    const id = env.MODEL ?? 'openai/gpt-4o-mini';
    const provider = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    return { model: provider.chat(id) as unknown as AgentModel, label: `openrouter:${id}`, mock: false };
  }
  if (env.OPENAI_API_KEY) {
    const id = env.MODEL ?? 'gpt-4o-mini';
    const provider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return { model: provider(id) as unknown as AgentModel, label: `openai:${id}`, mock: false };
  }
  throw new Error('MOCK=0 but no OPENROUTER_API_KEY or OPENAI_API_KEY set');
}
