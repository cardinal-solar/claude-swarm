import Docker from 'dockerode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Executor, ExecuteParams } from './executor.interface';
import type { ExecutorResult } from '../shared/types';

const RUNNER_IMAGE = 'claude-swarm-runner:latest';

export class ContainerExecutor implements Executor {
  private docker: Docker;
  private runningContainers = new Map<string, Docker.Container>();

  constructor() {
    this.docker = new Docker();
  }

  async execute(params: ExecuteParams): Promise<ExecutorResult> {
    const start = Date.now();
    try {
      const env = [
        `ANTHROPIC_API_KEY=${params.apiKey}`,
        `TASK_PROMPT=${params.prompt}`,
      ];
      if (params.schema) env.push(`TASK_SCHEMA=${JSON.stringify(params.schema)}`);
      if (params.model) env.push(`CLAUDE_MODEL=${params.model}`);
      if (params.timeout) env.push(`TASK_TIMEOUT=${params.timeout}`);

      const container = await this.docker.createContainer({
        Image: RUNNER_IMAGE,
        Env: env,
        HostConfig: { Binds: [`${params.workspacePath}:/workspace`] },
        WorkingDir: '/workspace',
      });

      this.runningContainers.set(params.taskId, container);
      await container.start();
      const { StatusCode } = await container.wait();
      const logs = (await container.logs({ stdout: true, stderr: true })).toString();
      await container.remove();
      this.runningContainers.delete(params.taskId);

      if (StatusCode !== 0) {
        return {
          success: false, logs, artifacts: [], duration: Date.now() - start,
          error: { code: 'CONTAINER_ERROR', message: `Container exited with code ${StatusCode}` },
        };
      }

      let data: unknown;
      let valid = false;
      try {
        const resultPath = path.join(params.workspacePath, 'result.json');
        const resultStr = await fs.readFile(resultPath, 'utf-8');
        data = JSON.parse(resultStr);
        valid = true;
      } catch {
        data = { output: logs };
      }

      return { success: true, data, valid, logs, artifacts: [], duration: Date.now() - start };
    } catch (err) {
      this.runningContainers.delete(params.taskId);
      return {
        success: false, logs: (err as Error).message, artifacts: [], duration: Date.now() - start,
        error: { code: 'CONTAINER_ERROR', message: (err as Error).message },
      };
    }
  }

  async cancel(taskId: string): Promise<void> {
    const container = this.runningContainers.get(taskId);
    if (container) {
      try { await container.stop({ t: 5 }); await container.remove(); } catch {}
      this.runningContainers.delete(taskId);
    }
  }
}
