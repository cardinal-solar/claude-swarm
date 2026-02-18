import { z } from 'zod';

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const CreateMcpProfileSchema = z.object({
  name: z.string().min(1),
  servers: z.array(McpServerConfigSchema),
});

export type CreateMcpProfileInput = z.infer<typeof CreateMcpProfileSchema>;

export const McpProfileResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  servers: z.array(McpServerConfigSchema),
  createdAt: z.string(),
});
