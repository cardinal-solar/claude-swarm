import type { TaskRecord, McpProfile } from '../src/shared/types';

export interface ClaudeOpsOptions { baseUrl: string; }

export interface KnowledgeEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  status: string;
  avgRating: number;
  voteCount: number;
  source: string;
  originTaskId?: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
}

export class ClaudeOpsError extends Error {
  constructor(public readonly status: number, public readonly error: { code: string; message: string }) {
    super(`${error.code}: ${error.message}`);
    this.name = 'ClaudeOpsError';
  }
}

export class ClaudeOps {
  private baseUrl: string;
  constructor(opts: ClaudeOpsOptions) { this.baseUrl = opts.baseUrl.replace(/\/$/, ''); }

  async createTask(input: { prompt: string; apiKey: string; [key: string]: unknown }): Promise<TaskRecord> {
    return this.post('/api/tasks', input);
  }

  async getTask(id: string): Promise<TaskRecord> { return this.get(`/api/tasks/${id}`); }

  async listTasks(filter?: { status?: string }): Promise<TaskRecord[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString();
    return this.get(`/api/tasks${qs ? `?${qs}` : ''}`);
  }

  async cancelTask(id: string): Promise<void> { await this.delete(`/api/tasks/${id}`); }

  async createMcpProfile(input: { name: string; servers: unknown[] }): Promise<McpProfile> {
    return this.post('/api/mcp-profiles', input);
  }

  async listMcpProfiles(): Promise<McpProfile[]> { return this.get('/api/mcp-profiles'); }

  async deleteMcpProfile(id: string): Promise<void> { await this.delete(`/api/mcp-profiles/${id}`); }

  async listKnowledge(filter?: { status?: string; category?: string; tag?: string; sort?: string }): Promise<{ data: KnowledgeEntry[]; total: number }> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    if (filter?.category) params.set('category', filter.category);
    if (filter?.tag) params.set('tag', filter.tag);
    if (filter?.sort) params.set('sort', filter.sort);
    const qs = params.toString();
    return this.get(`/api/knowledge${qs ? `?${qs}` : ''}`);
  }

  async getKnowledge(id: string): Promise<KnowledgeEntry> {
    return this.get(`/api/knowledge/${id}`);
  }

  async createKnowledge(input: { title: string; description: string; tags?: string[]; category?: string; promptTemplate: string }): Promise<KnowledgeEntry> {
    return this.post('/api/knowledge', input);
  }

  async rateKnowledge(id: string, score: number): Promise<{ average: number; count: number }> {
    return this.post(`/api/knowledge/${id}/rate`, { score });
  }

  async deleteKnowledge(id: string): Promise<void> {
    await this.delete(`/api/knowledge/${id}`);
  }

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
      throw new ClaudeOpsError(res.status, body.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const rb = await res.json() as { error?: { code: string; message: string } };
      throw new ClaudeOpsError(res.status, rb.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
    return res.json() as Promise<T>;
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json() as { error?: { code: string; message: string } };
      throw new ClaudeOpsError(res.status, body.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
  }
}
