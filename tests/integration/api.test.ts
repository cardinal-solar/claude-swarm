import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createApp } from '../../src/server';
import { initializeDatabase } from '../../src/storage/database';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock the ProcessExecutor to avoid needing claude-code-manager
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

describe('API Integration', () => {
  let app: ReturnType<typeof createApp>;
  let baseDir: string;

  beforeEach(async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-api-'));

    app = createApp({
      db,
      workspacesDir: baseDir,
      maxConcurrency: 2,
      defaultMode: 'process',
      defaultTimeout: 300000,
      logLevel: 'silent',
    });
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.scheduler).toBeDefined();
    });
  });

  describe('POST /mcp-profiles', () => {
    it('creates a profile', async () => {
      const res = await app.request('/api/mcp-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-pg',
          servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('test-pg');
    });
  });

  describe('GET /mcp-profiles', () => {
    it('lists profiles', async () => {
      await app.request('/api/mcp-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'p1', servers: [] }),
      });
      const res = await app.request('/api/mcp-profiles');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });
  });

  describe('POST /tasks', () => {
    it('returns 400 for invalid request', async () => {
      const res = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns 404 for unknown task', async () => {
      const res = await app.request('/api/tasks/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
