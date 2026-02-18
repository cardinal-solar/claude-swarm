import { TaskStore } from '../storage/task.store';
import { McpProfileStore } from '../storage/mcp-profile.store';
import { Scheduler } from '../scheduler/scheduler';
import { WorkspaceManager } from '../workspace/workspace-manager';
import { ProcessExecutor } from '../executors/process.executor';
import { TaskNotFoundError } from '../shared/errors';
import type { TaskRecord, TaskStatus, ExecutionMode, McpServerConfig } from '../shared/types';
import type { CreateTaskInput } from '../api/schemas/task.schema';

interface TaskServiceDeps {
  taskStore: TaskStore;
  scheduler: Scheduler;
  workspaceManager: WorkspaceManager;
  mcpProfileStore?: McpProfileStore;
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

    // Create task record
    const id = this.deps.taskStore.create({
      prompt: input.prompt,
      mode,
      schemaJson: input.schema ? JSON.stringify(input.schema) : undefined,
      tags: input.tags,
      workspacePath: workspace.path,
    });

    // Enqueue for execution
    const executor = new ProcessExecutor();
    const timeout = input.timeout || this.deps.defaultTimeout;

    this.deps.scheduler.enqueue({
      taskId: id,
      params: {
        taskId: id,
        prompt: input.prompt,
        apiKey: input.apiKey,
        workspacePath: workspace.path,
        schema: input.schema,
        timeout,
        model: input.model,
        permissionMode: input.permissionMode,
      },
      executor,
      onComplete: (taskId, result) => {
        if (result.success) {
          this.deps.taskStore.complete(taskId, { data: result.data, valid: result.valid ?? true }, result.duration);
        } else {
          this.deps.taskStore.fail(taskId, result.error || { code: 'UNKNOWN', message: 'Unknown error' }, result.duration);
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

  async cancelTask(id: string): Promise<void> {
    const task = this.deps.taskStore.getById(id);
    if (!task) throw new TaskNotFoundError(id);
    await this.deps.scheduler.cancel(id);
    this.deps.taskStore.updateStatus(id, 'cancelled');
  }
}
