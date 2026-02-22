import { z } from 'zod';

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const TaskFilesSchema = z.object({
  type: z.enum(['zip', 'git']),
  gitUrl: z.string().url().optional(),
  gitRef: z.string().optional(),
});

const TaskMcpSchema = z.object({
  inline: z.array(McpServerConfigSchema).optional(),
  profiles: z.array(z.string()).optional(),
});

const AgentDefinitionSchema = z.object({
  description: z.string(),
  prompt: z.string(),
  model: z.enum(['sonnet', 'opus', 'haiku', 'inherit']).optional(),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  maxTurns: z.number().optional(),
});

export const CreateTaskSchema = z.object({
  prompt: z.string().min(1),
  apiKey: z.string().min(1),
  schema: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(['process', 'container', 'sdk']).default('process'),
  timeout: z.number().positive().optional(),
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  files: TaskFilesSchema.optional(),
  mcpServers: TaskMcpSchema.optional(),
  agents: z.record(z.string(), AgentDefinitionSchema).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const TaskResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  prompt: z.string(),
  mode: z.enum(['process', 'container', 'sdk']),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  result: z.object({
    data: z.unknown(),
    valid: z.boolean(),
  }).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
  duration: z.number().optional(),
  tags: z.record(z.string(), z.string()).optional(),
});
