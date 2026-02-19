import { EventEmitter } from 'events';

/**
 * In-memory log store for running tasks.
 * Accumulates stdout/stderr chunks and supports SSE streaming via EventEmitter.
 * Logs are kept until explicitly cleared (task cleanup).
 */
export class TaskLogStore {
  private logs = new Map<string, string[]>();
  private emitter = new EventEmitter();

  /** Append a log chunk for a task. Emits 'log:<taskId>' event for SSE listeners. */
  append(taskId: string, chunk: string): void {
    if (!this.logs.has(taskId)) {
      this.logs.set(taskId, []);
    }
    this.logs.get(taskId)!.push(chunk);
    this.emitter.emit(`log:${taskId}`, chunk);
  }

  /** Get all accumulated log chunks for a task, joined as a single string. */
  get(taskId: string): string {
    const chunks = this.logs.get(taskId);
    return chunks ? chunks.join('') : '';
  }

  /** Subscribe to live log chunks. Returns an unsubscribe function. */
  subscribe(taskId: string, listener: (chunk: string) => void): () => void {
    const event = `log:${taskId}`;
    this.emitter.on(event, listener);
    return () => {
      this.emitter.off(event, listener);
    };
  }

  /** Clear logs for a task (called after task completion + retrieval). */
  clear(taskId: string): void {
    this.logs.delete(taskId);
    this.emitter.removeAllListeners(`log:${taskId}`);
  }

  /** Check if any logs exist for a task. */
  has(taskId: string): boolean {
    return this.logs.has(taskId);
  }
}
