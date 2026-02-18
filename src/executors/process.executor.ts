import { ClaudeCodeManager } from 'claude-code-manager';
import type { Executor, ExecuteParams } from './executor.interface';
import type { ExecutorResult } from '../shared/types';

// Re-import zod from claude-code-manager's dependency to avoid Zod v3/v4 type mismatch.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { z } = require('zod') as { z: typeof import('zod') };

export class ProcessExecutor implements Executor {
  private manager: ClaudeCodeManager;
  private runningTasks = new Map<string, { cancel: () => void }>();

  constructor() {
    this.manager = new ClaudeCodeManager();
  }

  async execute(params: ExecuteParams): Promise<ExecutorResult> {
    const start = Date.now();
    try {
      const schema = params.schema
        ? z.any()
        : z.any();

      const result = await this.manager.execute({
        prompt: params.prompt,
        schema: schema as any,
        timeout: params.timeout,
        onOutput: params.onOutput,
      });

      return {
        success: result.success,
        data: result.data,
        valid: result.success,
        logs: result.logs,
        artifacts: result.artifacts || [],
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        logs: (err as Error).message,
        artifacts: [],
        duration: Date.now() - start,
        error: {
          code: 'EXECUTION_ERROR',
          message: (err as Error).message,
        },
      };
    }
  }

  async cancel(taskId: string): Promise<void> {
    const running = this.runningTasks.get(taskId);
    if (running) {
      running.cancel();
      this.runningTasks.delete(taskId);
    }
  }
}
