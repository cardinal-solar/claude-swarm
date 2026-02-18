import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { TaskService } from '../../../src/services/task.service';
import { TaskStore } from '../../../src/storage/task.store';
import { Scheduler } from '../../../src/scheduler/scheduler';
import { WorkspaceManager } from '../../../src/workspace/workspace-manager';
import { initializeDatabase } from '../../../src/storage/database';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Mock the ProcessExecutor to avoid needing claude-task-runner.
// The execute mock returns a promise that never resolves so that the task
// stays in 'running' status during synchronous assertions.
vi.mock('../../../src/executors/process.executor', () => {
  return {
    ProcessExecutor: class MockProcessExecutor {
      execute = vi.fn().mockReturnValue(new Promise(() => {}));
      cancel = vi.fn();
    },
  };
});

describe('TaskService', () => {
  let service: TaskService;
  let taskStore: TaskStore;
  let baseDir: string;

  beforeEach(async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    taskStore = new TaskStore(db);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-svc-'));
    const workspace = new WorkspaceManager(baseDir);
    const scheduler = new Scheduler({ maxConcurrency: 2 });

    service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager: workspace,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });
  });

  it('creates a task and returns its ID', async () => {
    const { id } = await service.createTask({
      prompt: 'Hello',
      apiKey: 'sk-test',
    });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('retrieves a created task', async () => {
    const { id } = await service.createTask({
      prompt: 'Hello',
      apiKey: 'sk-test',
    });
    const task = service.getTask(id);
    expect(task).toBeDefined();
    expect(task!.status).toBe('running');
    expect(task!.prompt).toBe('Hello');
  });

  it('throws TaskNotFoundError for unknown ID', () => {
    expect(() => service.getTask('nonexistent')).toThrow('Task not found');
  });

  it('lists tasks', async () => {
    await service.createTask({ prompt: 'A', apiKey: 'k' });
    await service.createTask({ prompt: 'B', apiKey: 'k' });
    const tasks = service.listTasks();
    expect(tasks).toHaveLength(2);
  });
});
