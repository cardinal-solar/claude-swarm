const BASE = '/api';

export interface TaskRecord {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  mode: 'process' | 'container';
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
  health: () => fetchJson<HealthResponse>('/health'),
};
