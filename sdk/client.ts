import type { TaskRecord, McpProfile } from '../src/shared/types';

export interface ClaudeSwarmOptions { baseUrl: string; }

export class ClaudeSwarmError extends Error {
  constructor(public readonly status: number, public readonly error: { code: string; message: string }) {
    super(`${error.code}: ${error.message}`);
    this.name = 'ClaudeSwarmError';
  }
}

export class ClaudeSwarm {
  private baseUrl: string;
  constructor(opts: ClaudeSwarmOptions) { this.baseUrl = opts.baseUrl.replace(/\/$/, ''); }

  async createTask(input: { prompt: string; apiKey: string; [key: string]: unknown }): Promise<TaskRecord> {
    return this.post('/tasks', input);
  }

  async getTask(id: string): Promise<TaskRecord> { return this.get(`/tasks/${id}`); }

  async listTasks(filter?: { status?: string }): Promise<TaskRecord[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString();
    return this.get(`/tasks${qs ? `?${qs}` : ''}`);
  }

  async cancelTask(id: string): Promise<void> { await this.delete(`/tasks/${id}`); }

  async createMcpProfile(input: { name: string; servers: unknown[] }): Promise<McpProfile> {
    return this.post('/mcp-profiles', input);
  }

  async listMcpProfiles(): Promise<McpProfile[]> { return this.get('/mcp-profiles'); }

  async deleteMcpProfile(id: string): Promise<void> { await this.delete(`/mcp-profiles/${id}`); }

  async waitForCompletion(id: string, pollIntervalMs = 2000): Promise<TaskRecord> {
    let task = await this.getTask(id);
    while (task.status === 'queued' || task.status === 'running') {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      task = await this.getTask(id);
    }
    return task;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.json() as { error?: { code: string; message: string } };
      throw new ClaudeSwarmError(res.status, body.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const rb = await res.json() as { error?: { code: string; message: string } };
      throw new ClaudeSwarmError(res.status, rb.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
    return res.json() as Promise<T>;
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json() as { error?: { code: string; message: string } };
      throw new ClaudeSwarmError(res.status, body.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
  }
}
