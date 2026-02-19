import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock messages used in tests
const mockMessages: any[] = [];

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(() => {
    // Return an async generator that yields mockMessages
    return (async function* () {
      for (const msg of mockMessages) {
        yield msg;
      }
    })();
  }),
}));

import { SdkExecutor } from '../../../src/executors/sdk.executor';
import { query } from '@anthropic-ai/claude-agent-sdk';

describe('SdkExecutor', () => {
  let executor: SdkExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMessages.length = 0;
    executor = new SdkExecutor();
  });

  it('returns a successful result on success message', async () => {
    mockMessages.push(
      {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-abc123',
        model: 'claude-sonnet-4-6',
      },
      {
        type: 'assistant',
        message: {
          content: [{ text: 'I will analyze the file.' }],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        session_id: 'sess-abc123',
        duration_ms: 5000,
        is_error: false,
        num_turns: 3,
        result: '{"answer": 42}',
        total_cost_usd: 0.045,
        usage: { input_tokens: 100, output_tokens: 50 },
        modelUsage: {},
        permission_denials: [],
        structured_output: { answer: 42 },
      },
    );

    const onOutput = vi.fn();
    const result = await executor.execute({
      taskId: 'task-1',
      prompt: 'Analyze the file',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
      onOutput,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ answer: 42 });
    expect(result.cost).toBe(0.045);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    // Verify onOutput was called with system, assistant, and result messages
    expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('[system]'));
    expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('[assistant]'));
    expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('[result]'));
  });

  it('returns result text when no structured_output', async () => {
    mockMessages.push({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-1',
      duration_ms: 1000,
      is_error: false,
      num_turns: 1,
      result: 'Plain text answer',
      total_cost_usd: 0.01,
      usage: { input_tokens: 10, output_tokens: 5 },
      modelUsage: {},
      permission_denials: [],
    });

    const result = await executor.execute({
      taskId: 'task-2',
      prompt: 'Hello',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('Plain text answer');
  });

  it('returns error result on error_during_execution', async () => {
    mockMessages.push({
      type: 'result',
      subtype: 'error_during_execution',
      session_id: 'sess-2',
      duration_ms: 2000,
      is_error: true,
      num_turns: 1,
      total_cost_usd: 0.005,
      usage: { input_tokens: 10, output_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      errors: ['Tool execution failed', 'File not found'],
    });

    const onOutput = vi.fn();
    const result = await executor.execute({
      taskId: 'task-3',
      prompt: 'Do something',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
      onOutput,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('ERROR_DURING_EXECUTION');
    expect(result.error?.message).toContain('Tool execution failed');
    expect(result.cost).toBe(0.005);
    expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('[error]'));
  });

  it('streams tool use messages to onOutput', async () => {
    mockMessages.push(
      {
        type: 'assistant',
        message: {
          content: [
            { name: 'Bash', input: { command: 'ls -la' } },
          ],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        session_id: 'sess-3',
        duration_ms: 1000,
        is_error: false,
        num_turns: 1,
        result: 'done',
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5 },
        modelUsage: {},
        permission_denials: [],
      },
    );

    const onOutput = vi.fn();
    await executor.execute({
      taskId: 'task-4',
      prompt: 'List files',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
      onOutput,
    });

    expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('[tool] Bash'));
    expect(onOutput).toHaveBeenCalledWith(expect.stringContaining('ls -la'));
  });

  it('passes schema as outputFormat', async () => {
    mockMessages.push({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-4',
      duration_ms: 1000,
      is_error: false,
      num_turns: 1,
      result: '{}',
      total_cost_usd: 0.01,
      usage: { input_tokens: 10, output_tokens: 5 },
      modelUsage: {},
      permission_denials: [],
      structured_output: { answer: 'test' },
    });

    const schema = { type: 'object', properties: { answer: { type: 'string' } } };
    await executor.execute({
      taskId: 'task-5',
      prompt: 'Answer',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
      schema,
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          outputFormat: { type: 'json_schema', schema },
        }),
      }),
    );
  });

  it('passes MCP servers to query options', async () => {
    mockMessages.push({
      type: 'result',
      subtype: 'success',
      session_id: 'sess-5',
      duration_ms: 500,
      is_error: false,
      num_turns: 1,
      result: 'ok',
      total_cost_usd: 0.001,
      usage: { input_tokens: 5, output_tokens: 5 },
      modelUsage: {},
      permission_denials: [],
    });

    await executor.execute({
      taskId: 'task-6',
      prompt: 'Query DB',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
      mcpServers: [
        { name: 'postgres', command: 'npx', args: ['-y', 'pg-mcp'], env: { PG_URL: 'localhost' } },
      ],
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          mcpServers: {
            postgres: {
              command: 'npx',
              args: ['-y', 'pg-mcp'],
              env: { PG_URL: 'localhost' },
            },
          },
        }),
      }),
    );
  });

  it('cancels a running query via abort controller', async () => {
    // Simulate a query that throws when aborted (real SDK behavior)
    let rejectFn: (err: Error) => void;
    const blockPromise = new Promise<void>((_, reject) => { rejectFn = reject; });

    vi.mocked(query).mockImplementationOnce(({ options }: any) => {
      // Listen for abort and reject the blocking promise
      options?.abortController?.signal?.addEventListener('abort', () => {
        rejectFn(new Error('aborted'));
      });

      return (async function* () {
        yield { type: 'system', subtype: 'init', session_id: 's1', model: 'test' };
        await blockPromise;
      })() as any;
    });

    const executePromise = executor.execute({
      taskId: 'task-cancel',
      prompt: 'Long task',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
    });

    // Wait a tick for the query to start
    await new Promise((r) => setTimeout(r, 10));

    // Cancel should resolve without error
    await executor.cancel('task-cancel');

    const result = await executePromise;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CANCELLED');
  });

  it('handles SDK throwing an error', async () => {
    vi.mocked(query).mockReturnValueOnce(
      (async function* () {
        throw new Error('API rate limited');
      })() as any,
    );

    const result = await executor.execute({
      taskId: 'task-err',
      prompt: 'Fail',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SDK_ERROR');
    expect(result.error?.message).toContain('API rate limited');
  });
});
