import { describe, expect, it } from 'vitest';
import { LessonStore, MAX_LESSON_CHARS, mergeLessons } from '../src/lessons.js';

describe('lessons', () => {
  it('dedupes ignoring case, punctuation and bullets', () => {
    expect(mergeLessons(['Use the From line.'], ['- use the from line', 'New one'])).toEqual(['Use the From line.', 'New one']);
  });
  it('caps count and length', () => {
    const many = Array.from({ length: 10 }, (_, i) => `lesson ${i} ${'x'.repeat(300)}`);
    const out = mergeLessons([], many, 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatch(/^lesson 6/);
    expect(out.every((l) => l.length <= MAX_LESSON_CHARS)).toBe(true);
  });
  it('round-trips through Mastra working memory', async () => {
    const store = new LessonStore();
    expect(await store.get()).toEqual([]);
    await store.set(['a', 'b']);
    expect(await store.get()).toEqual(['a', 'b']);
  });
});
