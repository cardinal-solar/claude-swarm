import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scheduler } from '../../../src/scheduler/scheduler';
import type { Executor, ExecuteParams } from '../../../src/executors/executor.interface';
import type { ExecutorResult } from '../../../src/shared/types';

function createMockExecutor(delay = 50): Executor {
  return {
    execute: vi.fn(async (params: ExecuteParams): Promise<ExecutorResult> => {
      await new Promise((r) => setTimeout(r, delay));
      return {
        success: true,
        data: { echo: params.prompt },
        valid: true,
        logs: '',
        artifacts: [],
        duration: delay,
      };
    }),
    cancel: vi.fn(async () => {}),
  };
}

describe('Scheduler', () => {
  it('executes a task immediately when pool has capacity', async () => {
    const executor = createMockExecutor(10);
    const scheduler = new Scheduler({ maxConcurrency: 2 });
    const onComplete = vi.fn();

    scheduler.enqueue({
      taskId: 'task-1',
      params: {
        taskId: 'task-1',
        prompt: 'hello',
        apiKey: 'key',
        workspacePath: '/tmp',
      },
      executor,
      onComplete,
    });

    // Wait for task to complete
    await new Promise((r) => setTimeout(r, 100));
    expect(onComplete).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ success: true })
    );
  });

  it('queues tasks when at max concurrency', async () => {
    const executor = createMockExecutor(100);
    const scheduler = new Scheduler({ maxConcurrency: 1 });
    const completions: string[] = [];

    scheduler.enqueue({
      taskId: 'task-1',
      params: { taskId: 'task-1', prompt: 'first', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: (id) => completions.push(id),
    });

    scheduler.enqueue({
      taskId: 'task-2',
      params: { taskId: 'task-2', prompt: 'second', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: (id) => completions.push(id),
    });

    const status = scheduler.getStatus();
    expect(status.running).toBe(1);
    expect(status.queued).toBe(1);

    // Wait for both to complete
    await new Promise((r) => setTimeout(r, 350));
    expect(completions).toEqual(['task-1', 'task-2']);
  });

  it('reports status correctly', () => {
    const scheduler = new Scheduler({ maxConcurrency: 5 });
    const status = scheduler.getStatus();
    expect(status.running).toBe(0);
    expect(status.queued).toBe(0);
    expect(status.maxConcurrency).toBe(5);
  });

  it('cancels a queued task', async () => {
    const executor = createMockExecutor(200);
    const scheduler = new Scheduler({ maxConcurrency: 1 });
    const onComplete1 = vi.fn();
    const onComplete2 = vi.fn();

    scheduler.enqueue({
      taskId: 'task-1',
      params: { taskId: 'task-1', prompt: 'a', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: onComplete1,
    });

    scheduler.enqueue({
      taskId: 'task-2',
      params: { taskId: 'task-2', prompt: 'b', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: onComplete2,
    });

    const cancelled = await scheduler.cancel('task-2');
    expect(cancelled).toBe(true);
    expect(scheduler.getStatus().queued).toBe(0);
  });
});
