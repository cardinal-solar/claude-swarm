const BASE = '/api';

export interface TaskRecord {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  mode: 'process' | 'container' | 'sdk';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: { data: unknown; valid: boolean };
  error?: { code: string; message: string };
  duration?: number;
  tags?: Record<string, string>;
}

export interface McpProfile {
  id: string;
  name: string;
  servers: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
  createdAt: string;
}

export interface Artifact {
  name: string;
  path: string;
  size: number;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  status: 'active' | 'draft' | 'deprecated';
  avgRating: number;
  voteCount: number;
  source: 'auto' | 'manual';
  originTaskId?: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthResponse {
  status: 'ok';
  scheduler: { running: number; queued: number; maxConcurrency: number };
  uptime: number;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body.error?.message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  tasks: {
    list: (status?: string) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return fetchJson<TaskRecord[]>(`/tasks${qs}`);
    },
    get: (id: string) => fetchJson<TaskRecord>(`/tasks/${encodeURIComponent(id)}`),
    cancel: (id: string) => fetchJson<{ ok: boolean }>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    artifacts: (id: string) => fetchJson<Artifact[]>(`/tasks/${encodeURIComponent(id)}/artifacts`),
    artifactUrl: (id: string, path: string) => `${BASE}/tasks/${encodeURIComponent(id)}/artifacts/${path}`,
  },
  profiles: {
    list: () => fetchJson<McpProfile[]>('/mcp-profiles'),
    create: (data: { name: string; servers: McpProfile['servers'] }) =>
      fetchJson<McpProfile>('/mcp-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) => fetchJson<{ ok: boolean }>(`/mcp-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  knowledge: {
    list: (filter?: { status?: string; category?: string; tag?: string; sort?: string }) => {
      const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.category) params.set('category', filter.category);
      if (filter?.tag) params.set('tag', filter.tag);
      if (filter?.sort) params.set('sort', filter.sort);
      const qs = params.toString();
      return fetchJson<{ data: KnowledgeEntry[]; total: number }>(`/knowledge${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => fetchJson<KnowledgeEntry>(`/knowledge/${encodeURIComponent(id)}`),
    create: (data: { title: string; description: string; tags?: string[]; category?: string; promptTemplate: string }) =>
      fetchJson<KnowledgeEntry>('/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { title?: string; description?: string; tags?: string[]; category?: string; status?: string }) =>
      fetchJson<KnowledgeEntry>(`/knowledge/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) => fetchJson<{ ok: boolean }>(`/knowledge/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    rate: (id: string, score: number) =>
      fetchJson<{ average: number; count: number }>(`/knowledge/${encodeURIComponent(id)}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      }),
    artifacts: (id: string) => fetchJson<Artifact[]>(`/knowledge/${encodeURIComponent(id)}/artifacts`),
    artifactUrl: (id: string, artifactPath: string) => `${BASE}/knowledge/${encodeURIComponent(id)}/artifacts/${artifactPath}`,
  },
  health: () => fetchJson<HealthResponse>('/health'),
};
