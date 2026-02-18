import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerExecutor } from '../../../src/executors/container.executor';

const mockContainer = {
  start: vi.fn().mockResolvedValue(undefined),
  wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
  logs: vi.fn().mockResolvedValue(Buffer.from('task completed')),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockCreateContainer = vi.fn().mockResolvedValue(mockContainer);

vi.mock('dockerode', () => {
  return {
    default: class MockDocker {
      createContainer = mockCreateContainer;
    },
  };
});

describe('ContainerExecutor', () => {
  let executor: ContainerExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContainer.start.mockResolvedValue(undefined);
    mockContainer.wait.mockResolvedValue({ StatusCode: 0 });
    mockContainer.logs.mockResolvedValue(Buffer.from('task completed'));
    mockContainer.remove.mockResolvedValue(undefined);
    mockCreateContainer.mockResolvedValue(mockContainer);
    executor = new ContainerExecutor();
  });

  it('creates and runs a container successfully', async () => {
    const result = await executor.execute({
      taskId: 'task-1', prompt: 'Hello', apiKey: 'sk-test', workspacePath: '/tmp/workspace',
    });
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns error when container exits non-zero', async () => {
    const failContainer = {
      start: vi.fn().mockResolvedValue(undefined),
      wait: vi.fn().mockResolvedValue({ StatusCode: 1 }),
      logs: vi.fn().mockResolvedValue(Buffer.from('error')),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    mockCreateContainer.mockResolvedValueOnce(failContainer);

    const result = await executor.execute({
      taskId: 'task-2', prompt: 'fail', apiKey: 'sk-test', workspacePath: '/tmp/workspace',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONTAINER_ERROR');
  });
});
