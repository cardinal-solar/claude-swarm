import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createApp } from '../../src/server';
import { initializeDatabase } from '../../src/storage/database';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock executors to avoid needing real claude-code-manager / docker
vi.mock('../../src/executors/process.executor', () => {
  return {
    ProcessExecutor: class MockProcessExecutor {
      execute = vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'ok' },
        valid: true,
        logs: '',
        artifacts: [],
        duration: 100,
      });
      cancel = vi.fn();
    },
  };
});

vi.mock('../../src/executors/container.executor', () => {
  return {
    ContainerExecutor: class MockContainerExecutor {
      execute = vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'ok' },
        valid: true,
        logs: '',
        artifacts: [],
        duration: 100,
      });
      cancel = vi.fn();
    },
  };
});

describe('Smoke Test: Full Task Lifecycle', () => {
  let app: ReturnType<typeof createApp>;
  let baseDir: string;

  beforeEach(async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-smoke-'));

    app = createApp({
      db,
      workspacesDir: baseDir,
      maxConcurrency: 2,
      defaultMode: 'process',
      defaultTimeout: 300000,
      logLevel: 'silent',
    });
  });

  it('health endpoint returns scheduler status', async () => {
    const res = await app.request('/health');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.scheduler.maxConcurrency).toBe(2);
  });

  it('MCP profile CRUD lifecycle', async () => {
    // Create
    const createRes = await app.request('/mcp-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-profile',
        servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
      }),
    });
    expect(createRes.status).toBe(201);
    const profile = await createRes.json();

    // List
    const listRes = await app.request('/mcp-profiles');
    const profiles = await listRes.json();
    expect(profiles).toHaveLength(1);

    // Get
    const getRes = await app.request(`/mcp-profiles/${profile.id}`);
    expect(getRes.status).toBe(200);

    // Delete
    const delRes = await app.request(`/mcp-profiles/${profile.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    // Verify deleted
    const afterDelRes = await app.request('/mcp-profiles');
    expect((await afterDelRes.json())).toHaveLength(0);
  });

  it('rejects invalid task creation', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });
    expect(res.status).toBe(400);
  });
});
