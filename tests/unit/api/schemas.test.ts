import { describe, it, expect } from 'vitest';
import { CreateTaskSchema, TaskResponseSchema } from '../../../src/api/schemas/task.schema';
import { CreateMcpProfileSchema } from '../../../src/api/schemas/mcp-profile.schema';

describe('CreateTaskSchema', () => {
  it('validates a minimal task request', () => {
    const result = CreateTaskSchema.safeParse({
      prompt: 'Hello world',
      apiKey: 'sk-ant-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing prompt', () => {
    const result = CreateTaskSchema.safeParse({
      apiKey: 'sk-ant-123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing apiKey', () => {
    const result = CreateTaskSchema.safeParse({
      prompt: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('validates a full task request with all optional fields', () => {
    const result = CreateTaskSchema.safeParse({
      prompt: 'Hello world',
      apiKey: 'sk-ant-123',
      schema: { type: 'object', properties: { answer: { type: 'string' } } },
      mode: 'container',
      timeout: 60000,
      model: 'claude-sonnet-4-6',
      permissionMode: 'default',
      files: { type: 'git', gitUrl: 'https://github.com/user/repo.git', gitRef: 'main' },
      mcpServers: {
        inline: [{ name: 'pg', command: 'npx', args: ['-y', 'pg'] }],
        profiles: ['profile-1'],
      },
      tags: { env: 'prod' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts sdk execution mode', () => {
    const result = CreateTaskSchema.safeParse({
      prompt: 'Hello world',
      apiKey: 'sk-ant-123',
      mode: 'sdk',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('sdk');
    }
  });
});

describe('CreateMcpProfileSchema', () => {
  it('validates a profile creation request', () => {
    const result = CreateMcpProfileSchema.safeParse({
      name: 'my-postgres',
      servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = CreateMcpProfileSchema.safeParse({
      servers: [],
    });
    expect(result.success).toBe(false);
  });
});
