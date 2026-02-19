import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessExecutor } from '../../../src/executors/process.executor';

// Mock child_process.spawn
const mockOn = vi.fn();
const mockStdout = { on: vi.fn() };
const mockStderr = { on: vi.fn() };
const mockKill = vi.fn();

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const child = {
      stdout: mockStdout,
      stderr: mockStderr,
      kill: mockKill,
      on: mockOn,
    };
    return child;
  }),
}));

function simulateExit(code: number, stdout = '', stderr = '') {
  // Trigger stdout data
  if (stdout) {
    mockStdout.on.mock.calls.find(([ev]: [string]) => ev === 'data')?.[1](Buffer.from(stdout));
  }
  if (stderr) {
    mockStderr.on.mock.calls.find(([ev]: [string]) => ev === 'data')?.[1](Buffer.from(stderr));
  }
  // Trigger close event
  const closeHandler = mockOn.mock.calls.find(([ev]: [string]) => ev === 'close')?.[1];
  closeHandler?.(code, null);
}

describe('ProcessExecutor', () => {
  let executor: ProcessExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new ProcessExecutor();
  });

  it('returns a successful result when claude exits 0 with JSON', async () => {
    const jsonOutput = JSON.stringify({ structured_output: { answer: 42 } });

    const promise = executor.execute({
      taskId: 'task-1',
      prompt: 'Say hello',
      apiKey: 'sk-test-key',
      workspacePath: '/tmp/workspace',
    });

    // Let the spawn happen
    await vi.waitFor(() => expect(mockOn).toHaveBeenCalled());
    simulateExit(0, jsonOutput);

    const result = await promise;
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ answer: 42 });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns an error result when claude exits non-zero', async () => {
    const promise = executor.execute({
      taskId: 'task-2',
      prompt: 'crash',
      apiKey: 'sk-test-key',
      workspacePath: '/tmp/workspace',
    });

    await vi.waitFor(() => expect(mockOn).toHaveBeenCalled());
    simulateExit(1, '', 'process crashed');

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PROCESS_ERROR');
    expect(result.error?.message).toContain('process crashed');
  });
});
