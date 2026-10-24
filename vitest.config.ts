import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { testTimeout: 60_000, env: { MOCK: '1' } } });
