import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { TaskService } from '../../../src/services/task.service';
import { TaskStore } from '../../../src/storage/task.store';
import { Scheduler } from '../../../src/scheduler/scheduler';
import { WorkspaceManager } from '../../../src/workspace/workspace-manager';
import { KnowledgeService } from '../../../src/services/knowledge.service';
import { initializeDatabase } from '../../../src/storage/database';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Mock the ProcessExecutor to avoid needing claude CLI.
// By default, execute returns a promise that never resolves so tasks stay 'running'.
// Individual tests can override via mockExecuteResult.
let mockExecuteResult: Promise<any> = new Promise(() => {});
vi.mock('../../../src/executors/process.executor', () => {
  return {
    ProcessExecutor: class MockProcessExecutor {
      execute = vi.fn().mockImplementation(() => mockExecuteResult);
      cancel = vi.fn();
    },
  };
});

describe('TaskService', () => {
  let service: TaskService;
  let taskStore: TaskStore;
  let baseDir: string;

  beforeEach(async () => {
    // Reset to never-resolving by default
    mockExecuteResult = new Promise(() => {});

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

describe('TaskService - Knowledge Integration', () => {
  let taskStore: TaskStore;
  let scheduler: Scheduler;
  let workspaceManager: WorkspaceManager;
  let baseDir: string;

  beforeEach(async () => {
    // Reset to never-resolving by default
    mockExecuteResult = new Promise(() => {});

    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    taskStore = new TaskStore(db);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-know-'));
    workspaceManager = new WorkspaceManager(baseDir);
    scheduler = new Scheduler({ maxConcurrency: 2 });
  });

  it('injects knowledge context into the prompt when knowledgeService is provided', async () => {
    const mockKnowledgeService = {
      buildContext: vi.fn().mockResolvedValue('Available knowledge entries (use if relevant):\n1. [test-skill] - A test skill'),
      learnFromWorkspace: vi.fn().mockResolvedValue(null),
    } as unknown as KnowledgeService;

    const enqueueSpy = vi.spyOn(scheduler, 'enqueue');

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      knowledgeService: mockKnowledgeService,
      knowledgeAutoLearn: true,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    await service.createTask({
      prompt: 'Build a web app',
      apiKey: 'sk-test',
    });

    expect(mockKnowledgeService.buildContext).toHaveBeenCalledWith('Build a web app');
    expect(enqueueSpy).toHaveBeenCalledTimes(1);

    const enqueueArg = enqueueSpy.mock.calls[0][0];
    // The prompt should contain the knowledge context followed by separator
    expect(enqueueArg.params.prompt).toContain('Available knowledge entries (use if relevant):');
    expect(enqueueArg.params.prompt).toContain('1. [test-skill] - A test skill');
    expect(enqueueArg.params.prompt).toContain('---');
    // The original prompt should follow
    expect(enqueueArg.params.prompt).toContain('Build a web app');
    // Learning instructions should be appended
    expect(enqueueArg.params.prompt).toContain('AFTER completing the task above');
    expect(enqueueArg.params.prompt).toContain('.knowledge/skill.yaml');
  });

  it('does not inject knowledge context when buildContext returns empty string', async () => {
    const mockKnowledgeService = {
      buildContext: vi.fn().mockResolvedValue(''),
      learnFromWorkspace: vi.fn().mockResolvedValue(null),
    } as unknown as KnowledgeService;

    const enqueueSpy = vi.spyOn(scheduler, 'enqueue');

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      knowledgeService: mockKnowledgeService,
      knowledgeAutoLearn: true,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    await service.createTask({
      prompt: 'Build a web app',
      apiKey: 'sk-test',
    });

    const enqueueArg = enqueueSpy.mock.calls[0][0];
    // Should NOT contain the separator when context is empty
    expect(enqueueArg.params.prompt).not.toContain('---');
    // Should start with the original prompt (no knowledge prefix)
    expect(enqueueArg.params.prompt).toMatch(/^Build a web app/);
    // But should still have learning instructions
    expect(enqueueArg.params.prompt).toContain('AFTER completing the task above');
  });

  it('does not include learning instructions when knowledgeAutoLearn is false', async () => {
    const mockKnowledgeService = {
      buildContext: vi.fn().mockResolvedValue(''),
      learnFromWorkspace: vi.fn().mockResolvedValue(null),
    } as unknown as KnowledgeService;

    const enqueueSpy = vi.spyOn(scheduler, 'enqueue');

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      knowledgeService: mockKnowledgeService,
      knowledgeAutoLearn: false,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    await service.createTask({
      prompt: 'Build a web app',
      apiKey: 'sk-test',
    });

    const enqueueArg = enqueueSpy.mock.calls[0][0];
    // Should NOT contain learning instructions
    expect(enqueueArg.params.prompt).not.toContain('AFTER completing the task above');
    expect(enqueueArg.params.prompt).not.toContain('.knowledge/');
  });

  it('does not inject knowledge context when no knowledgeService is provided', async () => {
    const enqueueSpy = vi.spyOn(scheduler, 'enqueue');

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    await service.createTask({
      prompt: 'Build a web app',
      apiKey: 'sk-test',
    });

    const enqueueArg = enqueueSpy.mock.calls[0][0];
    // Without knowledgeService, prompt should just be the original
    expect(enqueueArg.params.prompt).toBe('Build a web app');
  });

  it('calls learnFromWorkspace after successful task completion', async () => {
    const mockKnowledgeService = {
      buildContext: vi.fn().mockResolvedValue(''),
      learnFromWorkspace: vi.fn().mockResolvedValue(null),
    } as unknown as KnowledgeService;

    // Make the executor resolve with a success result
    mockExecuteResult = Promise.resolve({
      success: true,
      data: { result: 'done' },
      valid: true,
      logs: '',
      artifacts: [],
      duration: 100,
    });

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      knowledgeService: mockKnowledgeService,
      knowledgeAutoLearn: true,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    const { id } = await service.createTask({
      prompt: 'Build something',
      apiKey: 'sk-test',
    });

    // Wait for the executor to resolve and onComplete to fire
    // The scheduler runs the task asynchronously, so we need to wait
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockKnowledgeService.learnFromWorkspace).toHaveBeenCalledTimes(1);
    expect(mockKnowledgeService.learnFromWorkspace).toHaveBeenCalledWith(
      expect.stringContaining(baseDir),
      id,
    );
  });

  it('does not call learnFromWorkspace after failed task', async () => {
    const mockKnowledgeService = {
      buildContext: vi.fn().mockResolvedValue(''),
      learnFromWorkspace: vi.fn().mockResolvedValue(null),
    } as unknown as KnowledgeService;

    // Make the executor resolve with a failure result
    mockExecuteResult = Promise.resolve({
      success: false,
      logs: 'error output',
      artifacts: [],
      duration: 50,
      error: { code: 'PROCESS_ERROR', message: 'Something went wrong' },
    });

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      knowledgeService: mockKnowledgeService,
      knowledgeAutoLearn: true,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    await service.createTask({
      prompt: 'Build something',
      apiKey: 'sk-test',
    });

    // Wait for the executor to resolve and onComplete to fire
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockKnowledgeService.learnFromWorkspace).not.toHaveBeenCalled();
  });

  it('does not fail the task if learnFromWorkspace throws', async () => {
    const mockKnowledgeService = {
      buildContext: vi.fn().mockResolvedValue(''),
      learnFromWorkspace: vi.fn().mockRejectedValue(new Error('Learning failed')),
    } as unknown as KnowledgeService;

    // Make the executor resolve with a success result
    mockExecuteResult = Promise.resolve({
      success: true,
      data: { result: 'done' },
      valid: true,
      logs: '',
      artifacts: [],
      duration: 100,
    });

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      knowledgeService: mockKnowledgeService,
      knowledgeAutoLearn: true,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    const { id } = await service.createTask({
      prompt: 'Build something',
      apiKey: 'sk-test',
    });

    // Wait for onComplete to fire (including the async learnFromWorkspace)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Despite learnFromWorkspace throwing, the task should be completed
    const task = service.getTask(id);
    expect(task.status).toBe('completed');
    // learnFromWorkspace was called (it just failed)
    expect(mockKnowledgeService.learnFromWorkspace).toHaveBeenCalledTimes(1);
  });

  it('does not call learnFromWorkspace when knowledgeAutoLearn is false', async () => {
    const mockKnowledgeService = {
      buildContext: vi.fn().mockResolvedValue(''),
      learnFromWorkspace: vi.fn().mockResolvedValue(null),
    } as unknown as KnowledgeService;

    // Make the executor resolve with a success result
    mockExecuteResult = Promise.resolve({
      success: true,
      data: { result: 'done' },
      valid: true,
      logs: '',
      artifacts: [],
      duration: 100,
    });

    const service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager,
      knowledgeService: mockKnowledgeService,
      knowledgeAutoLearn: false,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });

    await service.createTask({
      prompt: 'Build something',
      apiKey: 'sk-test',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockKnowledgeService.learnFromWorkspace).not.toHaveBeenCalled();
  });
});
