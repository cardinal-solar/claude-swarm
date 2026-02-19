import { TaskStore } from '../storage/task.store';
import { McpProfileStore } from '../storage/mcp-profile.store';
import { TaskLogStore } from '../storage/task-log.store';
import { Scheduler } from '../scheduler/scheduler';
import { WorkspaceManager } from '../workspace/workspace-manager';
import { ProcessExecutor } from '../executors/process.executor';
import { ContainerExecutor } from '../executors/container.executor';
import { TaskNotFoundError } from '../shared/errors';
import { KnowledgeService } from './knowledge.service';
import type { TaskRecord, TaskStatus, ExecutionMode, McpServerConfig } from '../shared/types';
import type { CreateTaskInput } from '../api/schemas/task.schema';

interface TaskServiceDeps {
  taskStore: TaskStore;
  scheduler: Scheduler;
  workspaceManager: WorkspaceManager;
  mcpProfileStore?: McpProfileStore;
  knowledgeService?: KnowledgeService;
  knowledgeAutoLearn?: boolean;
  taskLogStore: TaskLogStore;
  defaultMode: ExecutionMode;
  defaultTimeout: number;
}

export class TaskService {
  private deps: TaskServiceDeps;

  constructor(deps: TaskServiceDeps) {
    this.deps = deps;
  }

  async createTask(input: CreateTaskInput & { zipBuffer?: Buffer }): Promise<{ id: string }> {
    const mode = input.mode || this.deps.defaultMode;

    // Create workspace
    const tempId = crypto.randomUUID();
    const workspace = await this.deps.workspaceManager.create(tempId);

    // Handle file input
    if (input.files) {
      if (input.files.type === 'zip' && input.zipBuffer) {
        await this.deps.workspaceManager.extractZip(workspace.path, input.zipBuffer);
      } else if (input.files.type === 'git' && input.files.gitUrl) {
        await this.deps.workspaceManager.cloneGit(workspace.path, input.files.gitUrl, input.files.gitRef);
      }
    }

    // Resolve MCP servers (inline + profiles)
    const mcpServers: McpServerConfig[] = [];
    if (input.mcpServers?.inline) {
      mcpServers.push(...input.mcpServers.inline);
    }
    if (input.mcpServers?.profiles && this.deps.mcpProfileStore) {
      for (const profileId of input.mcpServers.profiles) {
        const profile = this.deps.mcpProfileStore.getById(profileId);
        if (profile) {
          mcpServers.push(...profile.servers);
        }
      }
    }
    if (mcpServers.length > 0) {
      await this.deps.workspaceManager.writeMcpConfig(workspace.path, mcpServers);
    }

    // Build knowledge context
    let knowledgeContext = '';
    if (this.deps.knowledgeService) {
      knowledgeContext = await this.deps.knowledgeService.buildContext(input.prompt);
    }

    // Knowledge learning instructions
    const knowledgeLearningInstructions = (this.deps.knowledgeAutoLearn !== false && this.deps.knowledgeService)
      ? `\n\nAFTER completing the task above, create a knowledge entry by saving these files in a .knowledge/ directory:\n- .knowledge/skill.yaml with fields: id (slug), title, description, tags (array), category\n- .knowledge/prompt.md with a reusable prompt template for this type of task\n- .knowledge/README.md with a human-readable guide\nCopy any reusable scripts to .knowledge/code/`
      : '';

    // Wrap prompt with knowledge context and learning instructions
    const wrappedPrompt = `${knowledgeContext ? knowledgeContext + '\n\n---\n\n' : ''}${input.prompt}${knowledgeLearningInstructions}`;

    // Create task record
    const id = this.deps.taskStore.create({
      prompt: input.prompt,
      mode,
      schemaJson: input.schema ? JSON.stringify(input.schema) : undefined,
      tags: input.tags,
      workspacePath: workspace.path,
    });

    // Enqueue for execution
    const executor = mode === 'container'
      ? new ContainerExecutor()
      : new ProcessExecutor();
    const timeout = input.timeout || this.deps.defaultTimeout;

    this.deps.scheduler.enqueue({
      taskId: id,
      params: {
        taskId: id,
        prompt: wrappedPrompt,
        apiKey: input.apiKey,
        workspacePath: workspace.path,
        schema: input.schema,
        timeout,
        model: input.model,
        permissionMode: input.permissionMode,
        onOutput: (chunk) => {
          this.deps.taskLogStore.append(id, chunk);
        },
      },
      executor,
      onComplete: async (taskId, result) => {
        if (result.success) {
          this.deps.taskStore.complete(taskId, { data: result.data, valid: result.valid ?? true }, result.duration);
        } else {
          this.deps.taskStore.fail(taskId, result.error || { code: 'UNKNOWN', message: 'Unknown error' }, result.duration);
        }
        // Auto-learn from workspace regardless of success/failure.
        // A timed-out task may still have produced valid .knowledge/ files.
        if (this.deps.knowledgeService && this.deps.knowledgeAutoLearn !== false) {
          try {
            await this.deps.knowledgeService.learnFromWorkspace(workspace.path, taskId);
          } catch {
            // Don't fail the task if learning fails - just ignore
          }
        }
      },
    });

    this.deps.taskStore.updateStatus(id, 'running');
    return { id };
  }

  getTask(id: string): TaskRecord {
    const task = this.deps.taskStore.getById(id);
    if (!task) throw new TaskNotFoundError(id);
    return task;
  }

  listTasks(filter?: { status?: TaskStatus }): TaskRecord[] {
    return this.deps.taskStore.list(filter);
  }

  async listArtifacts(id: string): Promise<{ name: string; path: string; size: number }[]> {
    const task = this.deps.taskStore.getById(id);
    if (!task) throw new TaskNotFoundError(id);
    if (!task.workspacePath) return [];
    const relativePaths = await this.deps.workspaceManager.collectArtifacts(task.workspacePath);
    const { stat } = await import('fs/promises');
    const { join } = await import('path');
    const results = [];
    for (const relPath of relativePaths) {
      try {
        const s = await stat(join(task.workspacePath, relPath));
        results.push({ name: relPath, path: relPath, size: s.size });
      } catch {
        results.push({ name: relPath, path: relPath, size: 0 });
      }
    }
    return results;
  }

  async cancelTask(id: string): Promise<void> {
    const task = this.deps.taskStore.getById(id);
    if (!task) throw new TaskNotFoundError(id);
    await this.deps.scheduler.cancel(id);
    this.deps.taskStore.updateStatus(id, 'cancelled');
  }

  /** Get accumulated logs for a task. */
  getTaskLogs(id: string): string {
    this.getTask(id); // throws if not found
    return this.deps.taskLogStore.get(id);
  }

  /** Subscribe to live log chunks (for SSE streaming). Returns unsubscribe function. */
  subscribeTaskLogs(id: string, listener: (chunk: string) => void): () => void {
    this.getTask(id); // throws if not found
    return this.deps.taskLogStore.subscribe(id, listener);
  }
}
