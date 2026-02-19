import { spawn } from 'child_process';
import type { Executor, ExecuteParams } from './executor.interface';
import type { ExecutorResult } from '../shared/types';
import pino from 'pino';

const log = pino({ name: 'process-executor' });

export class ProcessExecutor implements Executor {
  private runningTasks = new Map<string, { kill: () => void }>();

  async execute(params: ExecuteParams): Promise<ExecutorResult> {
    const start = Date.now();
    const taskLog = log.child({ taskId: params.taskId });

    taskLog.info({ prompt: params.prompt.slice(0, 100) }, 'Starting claude process');

    return new Promise<ExecutorResult>((resolve) => {
      let stdout = '';
      let stderr = '';

      const args = [
        '--print',
        '--output-format', 'json',
        '--no-session-persistence',
      ];

      if (params.permissionMode) {
        args.push('--permission-mode', params.permissionMode);
      } else {
        args.push('--permission-mode', 'bypassPermissions');
      }

      if (params.model) {
        args.push('--model', params.model);
      }

      if (params.schema) {
        args.push('--json-schema', JSON.stringify(params.schema));
      }

      args.push(params.prompt);

      const env: Record<string, string> = { ...process.env as Record<string, string> };
      env.ANTHROPIC_API_KEY = params.apiKey;
      // Prevent "nested session" detection if server itself runs inside claude
      delete env.CLAUDECODE;

      taskLog.info('Spawning claude');

      const child = spawn('claude', args, {
        cwd: params.workspacePath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.runningTasks.set(params.taskId, { kill: () => child.kill('SIGTERM') });

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        params.onOutput?.(chunk.toString());
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      let timeoutId: NodeJS.Timeout | undefined;
      if (params.timeout) {
        timeoutId = setTimeout(() => {
          taskLog.warn({ timeout: params.timeout }, 'Task timed out, killing process');
          child.kill('SIGTERM');
        }, params.timeout);
      }

      child.on('close', (code, signal) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.runningTasks.delete(params.taskId);
        const duration = Date.now() - start;

        taskLog.info({ code, signal, duration, stdoutLen: stdout.length, stderrLen: stderr.length }, 'Process exited');

        if (signal === 'SIGTERM' && params.timeout && duration >= params.timeout - 1000) {
          resolve({
            success: false,
            logs: stderr || stdout,
            artifacts: [],
            duration,
            error: { code: 'TIMEOUT', message: `Task timed out after ${Math.round(duration / 1000)}s` },
          });
          return;
        }

        if (code !== 0) {
          taskLog.error({ code, stderr: stderr.slice(0, 500) }, 'Claude process failed');
          resolve({
            success: false,
            logs: stderr || stdout,
            artifacts: [],
            duration,
            error: { code: 'PROCESS_ERROR', message: stderr.slice(0, 1000) || `Exit code ${code}` },
          });
          return;
        }

        // Parse JSON output
        try {
          const parsed = JSON.parse(stdout);
          const data = parsed.structured_output ?? parsed.result ?? parsed;

          taskLog.info({ hasStructuredOutput: !!parsed.structured_output }, 'Task completed successfully');

          resolve({
            success: true,
            data,
            valid: true,
            logs: stderr,
            artifacts: [],
            duration,
          });
        } catch {
          // If not JSON, return raw stdout as data
          taskLog.info('Non-JSON output, returning raw');
          resolve({
            success: true,
            data: stdout,
            valid: true,
            logs: stderr,
            artifacts: [],
            duration,
          });
        }
      });

      child.on('error', (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.runningTasks.delete(params.taskId);
        taskLog.error({ err }, 'Failed to spawn claude process');
        resolve({
          success: false,
          logs: err.message,
          artifacts: [],
          duration: Date.now() - start,
          error: { code: 'SPAWN_ERROR', message: err.message },
        });
      });
    });
  }

  async cancel(taskId: string): Promise<void> {
    const running = this.runningTasks.get(taskId);
    if (running) {
      running.kill();
      this.runningTasks.delete(taskId);
    }
  }
}
