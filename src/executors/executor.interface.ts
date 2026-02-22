import type { ExecutorResult, McpServerConfig } from '../shared/types';

export interface AgentDefinition {
  description: string;
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  tools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
}

export interface ExecuteParams {
  taskId: string;
  prompt: string;
  apiKey: string;
  workspacePath: string;
  schema?: Record<string, unknown>;
  timeout?: number;
  model?: string;
  permissionMode?: string;
  mcpServers?: McpServerConfig[];
  agents?: Record<string, AgentDefinition>;
  onOutput?: (chunk: string) => void;
}

export interface Executor {
  execute(params: ExecuteParams): Promise<ExecutorResult>;
  cancel(taskId: string): Promise<void>;
}
