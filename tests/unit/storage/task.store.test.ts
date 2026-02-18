import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { TaskStore } from '../../../src/storage/task.store';
import { initializeDatabase } from '../../../src/storage/database';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    store = new TaskStore(db);
  });

  it('creates and retrieves a task', () => {
    const id = store.create({
      prompt: 'Write hello world',
      mode: 'process',
      tags: { env: 'test' },
    });
    const task = store.getById(id);
    expect(task).toBeDefined();
    expect(task!.prompt).toBe('Write hello world');
    expect(task!.status).toBe('queued');
    expect(task!.mode).toBe('process');
  });

  it('updates task status to running', () => {
    const id = store.create({ prompt: 'test', mode: 'process' });
    store.updateStatus(id, 'running');
    const task = store.getById(id);
    expect(task!.status).toBe('running');
    expect(task!.startedAt).toBeDefined();
  });

  it('completes a task with result', () => {
    const id = store.create({ prompt: 'test', mode: 'process' });
    store.updateStatus(id, 'running');
    store.complete(id, { data: { answer: 42 }, valid: true }, 1500);
    const task = store.getById(id);
    expect(task!.status).toBe('completed');
    expect(task!.result).toEqual({ data: { answer: 42 }, valid: true });
    expect(task!.duration).toBe(1500);
    expect(task!.completedAt).toBeDefined();
  });

  it('fails a task with error', () => {
    const id = store.create({ prompt: 'test', mode: 'process' });
    store.updateStatus(id, 'running');
    store.fail(id, { code: 'TIMEOUT', message: 'timed out' }, 5000);
    const task = store.getById(id);
    expect(task!.status).toBe('failed');
    expect(task!.error).toEqual({ code: 'TIMEOUT', message: 'timed out' });
  });

  it('lists tasks with status filter', () => {
    store.create({ prompt: 'a', mode: 'process' });
    const id2 = store.create({ prompt: 'b', mode: 'process' });
    store.updateStatus(id2, 'running');

    const queued = store.list({ status: 'queued' });
    expect(queued).toHaveLength(1);
    expect(queued[0].prompt).toBe('a');

    const running = store.list({ status: 'running' });
    expect(running).toHaveLength(1);
    expect(running[0].prompt).toBe('b');
  });

  it('returns null for non-existent task', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });
});
