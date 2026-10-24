import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AuditEvent { step: string; [k: string]: unknown }

/** Append-only JSONL audit log. One line per step, with a timestamp and sequence number. */
export class AuditLog {
  private seq = 0;
  readonly events: AuditEvent[] = [];
  constructor(private readonly path?: string) {
    if (path) mkdirSync(dirname(path), { recursive: true });
  }
  write(event: AuditEvent): void {
    const line = { seq: ++this.seq, ts: new Date().toISOString(), ...event };
    this.events.push(line);
    if (this.path) appendFileSync(this.path, JSON.stringify(line) + '\n');
  }
}
