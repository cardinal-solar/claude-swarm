import type { ExecutorResult } from '../shared/types';

export interface ExecuteParams {
  taskId: string;
  prompt: string;
  apiKey: string;
  workspacePath: string;
  schema?: Record<string, unknown>;
  timeout?: number;
  model?: string;
  permissionMode?: string;
  onOutput?: (chunk: string) => void;
}

export interface Executor {
  execute(params: ExecuteParams): Promise<ExecutorResult>;
  cancel(taskId: string): Promise<void>;
}
