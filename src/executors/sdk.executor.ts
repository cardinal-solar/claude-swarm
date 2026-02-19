import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Executor, ExecuteParams } from './executor.interface';
import type { ExecutorResult } from '../shared/types';
import pino from 'pino';

const log = pino({ name: 'sdk-executor' });

export class SdkExecutor implements Executor {
  private runningQueries = new Map<string, { abort: AbortController }>();

  async execute(params: ExecuteParams): Promise<ExecutorResult> {
    const start = Date.now();
    const taskLog = log.child({ taskId: params.taskId });

    taskLog.info({ prompt: params.prompt.slice(0, 100) }, 'Starting SDK query');

    const abortController = new AbortController();
    this.runningQueries.set(params.taskId, { abort: abortController });

    // Build MCP servers config (Record<string, McpServerConfig>)
    const mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};
    if (params.mcpServers) {
      for (const server of params.mcpServers) {
        mcpServers[server.name] = {
          command: server.command,
          args: server.args,
          env: server.env,
        };
      }
    }

    // Build environment: inherit process.env, override API key, remove CLAUDECODE to avoid nested detection
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    env.ANTHROPIC_API_KEY = params.apiKey;
    delete env.CLAUDECODE;

    // Build permission mode
    const permissionMode = params.permissionMode || 'bypassPermissions';

    // Timeout handling
    let timeoutId: NodeJS.Timeout | undefined;
    if (params.timeout) {
      timeoutId = setTimeout(() => {
        taskLog.warn({ timeout: params.timeout }, 'Task timed out, aborting SDK query');
        abortController.abort();
      }, params.timeout);
    }

    // Wrap user prompt with workspace instruction
    const wrappedPrompt = `IMPORTANT: Your working directory is the task workspace. When creating or saving any output files, save them in the current working directory (.) unless the user explicitly specifies an absolute path. This ensures artifacts are collected properly.\n\n${params.prompt}`;

    try {
      const q = query({
        prompt: wrappedPrompt,
        options: {
          cwd: params.workspacePath,
          env,
          model: params.model,
          permissionMode: permissionMode as 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan',
          allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
          abortController,
          ...(params.schema ? { outputFormat: { type: 'json_schema' as const, schema: params.schema } } : {}),
        },
      });

      let sessionId = '';

      for await (const message of q) {
        if (message.type === 'system' && message.subtype === 'init') {
          sessionId = message.session_id;
          const model = message.model || params.model || 'unknown';
          params.onOutput?.(`[system] Session ${sessionId.slice(0, 8)} started (model: ${model})\n`);
        } else if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if ('text' in block && block.text) {
              params.onOutput?.(`[assistant] ${block.text}\n`);
            } else if ('name' in block) {
              const toolName = block.name;
              const input = 'input' in block ? JSON.stringify(block.input) : '';
              params.onOutput?.(`[tool] ${toolName}(${input.slice(0, 200)})\n`);
            }
          }
        } else if (message.type === 'result') {
          const duration = Date.now() - start;
          if (timeoutId) clearTimeout(timeoutId);
          this.runningQueries.delete(params.taskId);

          if (message.subtype === 'success') {
            const cost = message.total_cost_usd;
            params.onOutput?.(`[result] Task completed (cost: $${cost.toFixed(4)}, duration: ${duration}ms)\n`);

            taskLog.info({ cost, duration, sessionId }, 'SDK task completed successfully');

            // Extract result data
            let data: unknown;
            if (message.structured_output !== undefined) {
              data = message.structured_output;
            } else {
              // Try to parse the result text as JSON
              try {
                data = JSON.parse(message.result);
              } catch {
                data = message.result;
              }
            }

            return {
              success: true,
              data,
              valid: true,
              logs: '',
              artifacts: [],
              duration,
              cost,
            };
          } else {
            // Error result
            const errors = 'errors' in message ? message.errors : [];
            const errorMsg = errors.join('; ') || `SDK error: ${message.subtype}`;
            params.onOutput?.(`[error] ${errorMsg}\n`);

            taskLog.error({ subtype: message.subtype, errors, duration }, 'SDK task failed');

            return {
              success: false,
              logs: errorMsg,
              artifacts: [],
              duration,
              cost: message.total_cost_usd,
              error: { code: message.subtype.toUpperCase(), message: errorMsg },
            };
          }
        }
      }

      // If we exit the loop without a result message (shouldn't happen)
      if (timeoutId) clearTimeout(timeoutId);
      this.runningQueries.delete(params.taskId);
      const duration = Date.now() - start;

      return {
        success: false,
        logs: 'SDK query ended without result',
        artifacts: [],
        duration,
        error: { code: 'NO_RESULT', message: 'SDK query ended without result message' },
      };
    } catch (err: unknown) {
      if (timeoutId) clearTimeout(timeoutId);
      this.runningQueries.delete(params.taskId);
      const duration = Date.now() - start;

      // Check if this was an abort (timeout or cancel)
      if (abortController.signal.aborted) {
        const isTimeout = params.timeout && duration >= (params.timeout - 1000);
        if (isTimeout) {
          params.onOutput?.(`[error] Task timed out after ${Math.round(duration / 1000)}s\n`);
          return {
            success: false,
            logs: `Task timed out after ${Math.round(duration / 1000)}s`,
            artifacts: [],
            duration,
            error: { code: 'TIMEOUT', message: `Task timed out after ${Math.round(duration / 1000)}s` },
          };
        }

        params.onOutput?.(`[error] Task cancelled\n`);
        return {
          success: false,
          logs: 'Task cancelled',
          artifacts: [],
          duration,
          error: { code: 'CANCELLED', message: 'Task was cancelled' },
        };
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      taskLog.error({ err: errMsg, duration }, 'SDK executor error');
      params.onOutput?.(`[error] ${errMsg}\n`);

      return {
        success: false,
        logs: errMsg,
        artifacts: [],
        duration,
        error: { code: 'SDK_ERROR', message: errMsg },
      };
    }
  }

  async cancel(taskId: string): Promise<void> {
    const running = this.runningQueries.get(taskId);
    if (running) {
      running.abort.abort();
      this.runningQueries.delete(taskId);
    }
  }
}
