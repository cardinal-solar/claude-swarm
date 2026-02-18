export class SwarmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'SwarmError';
  }
}

export class TaskNotFoundError extends SwarmError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND', { taskId });
    this.name = 'TaskNotFoundError';
  }
}

export class ValidationError extends SwarmError {
  constructor(message: string, issues: Array<{ path: string; message: string }>) {
    super(message, 'VALIDATION_ERROR', { issues });
    this.name = 'ValidationError';
  }
}

export class ExecutionError extends SwarmError {
  constructor(message: string, taskId: string, stderr?: string) {
    super(message, 'EXECUTION_ERROR', { taskId, stderr });
    this.name = 'ExecutionError';
  }
}

export class TimeoutError extends SwarmError {
  constructor(taskId: string, timeoutMs: number) {
    super(`Task ${taskId} timed out after ${timeoutMs}ms`, 'TIMEOUT', { taskId, timeoutMs });
    this.name = 'TimeoutError';
  }
}

export class WorkspaceError extends SwarmError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'WORKSPACE_ERROR', details);
    this.name = 'WorkspaceError';
  }
}
