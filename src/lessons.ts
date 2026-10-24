import { Memory } from '@mastra/memory';
import { InMemoryStore } from '@mastra/core/storage';

export const MAX_LESSONS = 6;
export const MAX_LESSON_CHARS = 160;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Merge new lessons into existing ones: trim, cap length, drop duplicates, keep the newest MAX_LESSONS. */
export function mergeLessons(existing: string[], incoming: string[], max = MAX_LESSONS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...existing, ...incoming]) {
    const l = raw.replace(/^[-*\d.\s]+/, '').trim().slice(0, MAX_LESSON_CHARS);
    const k = norm(l);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out.slice(-max);
}

export const toMarkdown = (lessons: string[]) => lessons.map((l) => `- ${l}`).join('\n');
export const fromMarkdown = (md: string | null | undefined) =>
  (md ?? '').split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean);

/**
 * Lessons live in Mastra working memory, scoped to a resource, so any agent
 * sharing that resource id reads the same list. Storage defaults to in-memory;
 * pass any Mastra storage adapter (e.g. LibSQLStore from @mastra/libsql) to persist across runs.
 */
export class LessonStore {
  readonly memory: Memory;
  constructor(
    private readonly resourceId = 'invoice-extractor',
    private readonly threadId = 'lessons',
    storage = new InMemoryStore(),
  ) {
    this.memory = new Memory({ storage, options: { workingMemory: { enabled: true, scope: 'resource' } } });
  }
  private async ensureThread() {
    const t = await this.memory.getThreadById({ threadId: this.threadId });
    if (!t) await this.memory.createThread({ resourceId: this.resourceId, threadId: this.threadId, title: 'lessons' });
  }
  async get(): Promise<string[]> {
    await this.ensureThread();
    return fromMarkdown(await this.memory.getWorkingMemory({ threadId: this.threadId, resourceId: this.resourceId }));
  }
  async set(lessons: string[]): Promise<void> {
    await this.ensureThread();
    await this.memory.updateWorkingMemory({ threadId: this.threadId, resourceId: this.resourceId, workingMemory: toMarkdown(lessons) });
  }
}
