export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecutionMode = 'process' | 'container' | 'sdk';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface TaskFiles {
  type: 'zip' | 'git';
  zipBuffer?: Buffer;
  gitUrl?: string;
  gitRef?: string;
}

export interface TaskMcpConfig {
  inline?: McpServerConfig[];
  profiles?: string[];
}

export interface CreateTaskInput {
  prompt: string;
  apiKey: string;
  schema?: Record<string, unknown>;
  mode?: ExecutionMode;
  timeout?: number;
  model?: string;
  permissionMode?: string;
  files?: TaskFiles;
  mcpServers?: TaskMcpConfig;
  tags?: Record<string, string>;
}

export interface TaskRecord {
  id: string;
  status: TaskStatus;
  prompt: string;
  mode: ExecutionMode;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: {
    data: unknown;
    valid: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
  duration?: number;
  tags?: Record<string, string>;
  workspacePath?: string;
}

export interface McpProfile {
  id: string;
  name: string;
  servers: McpServerConfig[];
  createdAt: string;
}

export interface ExecutorResult {
  success: boolean;
  data?: unknown;
  valid?: boolean;
  logs: string;
  artifacts: string[];
  duration: number;
  cost?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface SchedulerStatus {
  running: number;
  queued: number;
  maxConcurrency: number;
}

export type KnowledgeStatus = 'active' | 'draft' | 'deprecated';
export type KnowledgeSource = 'auto' | 'manual';

export interface KnowledgeEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  status: KnowledgeStatus;
  avgRating: number;
  voteCount: number;
  source: KnowledgeSource;
  originTaskId?: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
}
