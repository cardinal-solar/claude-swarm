import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeOps } from '../../../sdk';

describe('ClaudeOps SDK', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('creates a task', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ id: 'task-1', status: 'queued', prompt: 'hi', mode: 'process', createdAt: '2026-01-01' }),
    }) as any;

    const client = new ClaudeOps({ baseUrl: 'http://localhost:3000' });
    const task = await client.createTask({ prompt: 'hi', apiKey: 'sk-test' });
    expect(task.id).toBe('task-1');
    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:3000/api/tasks', expect.objectContaining({ method: 'POST' }));
  });

  it('gets a task by ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ id: 'task-1', status: 'completed', prompt: 'hi', mode: 'process', createdAt: '2026-01-01' }),
    }) as any;

    const client = new ClaudeOps({ baseUrl: 'http://localhost:3000' });
    const task = await client.getTask('task-1');
    expect(task.status).toBe('completed');
  });

  it('lists tasks', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve([{ id: 'task-1', status: 'queued', prompt: 'hi', mode: 'process', createdAt: '2026-01-01' }]),
    }) as any;

    const client = new ClaudeOps({ baseUrl: 'http://localhost:3000' });
    const tasks = await client.listTasks();
    expect(tasks).toHaveLength(1);
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 404, json: () => Promise.resolve({ error: { code: 'NOT_FOUND', message: 'not found' } }),
    }) as any;

    const client = new ClaudeOps({ baseUrl: 'http://localhost:3000' });
    await expect(client.getTask('bad-id')).rejects.toThrow();
  });
});
