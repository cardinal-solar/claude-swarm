import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessExecutor } from '../../../src/executors/process.executor';

// Mock claude-code-manager
const mockExecute = vi.fn().mockResolvedValue({
  success: true,
  data: { answer: 42 },
  artifacts: ['output.txt'],
  logs: 'done',
  duration: 1200,
  outputDir: '/tmp/out',
});

vi.mock('claude-code-manager', () => {
  return {
    ClaudeCodeManager: class {
      execute = mockExecute;
    },
  };
});

describe('ProcessExecutor', () => {
  let executor: ProcessExecutor;

  beforeEach(() => {
    executor = new ProcessExecutor();
  });

  it('returns a successful result from claude-code-manager', async () => {
    const result = await executor.execute({
      taskId: 'task-1',
      prompt: 'Say hello',
      apiKey: 'sk-test-key',
      workspacePath: '/tmp/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ answer: 42 });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns an error result when execution fails', async () => {
    mockExecute.mockRejectedValueOnce(new Error('process crashed'));

    const result = await executor.execute({
      taskId: 'task-2',
      prompt: 'crash',
      apiKey: 'sk-test-key',
      workspacePath: '/tmp/workspace',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EXECUTION_ERROR');
    expect(result.error?.message).toBe('process crashed');
  });
});
