# Web UI Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an ops dashboard to claude-swarm for monitoring tasks, managing MCP profiles, and viewing server health.

**Architecture:** React + Vite SPA in a `web/` directory, built to static files and served by Hono at `/app`. API routes move under `/api` prefix. Polling for real-time updates.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, shadcn/ui, React Router, TypeScript

---

### Task 1: Move API Routes Under /api Prefix

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/integration/api.test.ts`
- Modify: `tests/integration/smoke.test.ts`
- Modify: `cli/commands/run.ts` (default URL)
- Modify: `cli/commands/status.ts`
- Modify: `cli/commands/list.ts`
- Modify: `sdk/client.ts`

**Step 1: Update server.ts to prefix routes with /api**

In `src/server.ts`, change lines 38-40 from:
```typescript
app.route('/tasks', taskRoutes(taskService));
app.route('/mcp-profiles', mcpProfileRoutes(mcpProfileService));
app.route('/health', healthRoutes(healthService));
```
To:
```typescript
const api = new Hono();
api.route('/tasks', taskRoutes(taskService));
api.route('/mcp-profiles', mcpProfileRoutes(mcpProfileService));
api.route('/health', healthRoutes(healthService));
app.route('/api', api);
```

Add `Hono` is already imported. Add the API sub-app pattern.

**Step 2: Update all test files to use /api prefix**

In `tests/integration/api.test.ts`, update all request paths:
- `/health` -> `/api/health`
- `/mcp-profiles` -> `/api/mcp-profiles`
- `/tasks` -> `/api/tasks`
- `/tasks/nonexistent` -> `/api/tasks/nonexistent`

In `tests/integration/smoke.test.ts`, same changes:
- `/health` -> `/api/health`
- `/mcp-profiles` -> `/api/mcp-profiles`
- `/tasks` -> `/api/tasks`

**Step 3: Update CLI default paths**

In `cli/commands/run.ts`, `cli/commands/status.ts`, `cli/commands/list.ts`:
- Change all fetch URLs from `${opts.server}/tasks` to `${opts.server}/api/tasks`

In `sdk/client.ts`:
- Change all paths from `/tasks` to `/api/tasks`, `/mcp-profiles` to `/api/mcp-profiles`

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All 53 tests pass

**Step 5: Commit**

```bash
git add src/server.ts tests/ cli/ sdk/
git commit -m "refactor: move API routes under /api prefix"
```

---

### Task 2: Scaffold React Frontend

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/globals.css`
- Create: `web/postcss.config.js`

**Step 1: Create web/package.json**

```json
{
  "name": "claude-swarm-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.9.0",
    "vite": "^6.0.0"
  }
}
```

**Step 2: Install dependencies**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm/web && npm install
```

**Step 3: Create web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

**Step 4: Create web/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/app/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

**Step 5: Create web/postcss.config.js**

```javascript
export default {
  plugins: {},
};
```

**Step 6: Create web/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Swarm</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: Create web/src/globals.css**

```css
@import "tailwindcss";
```

**Step 8: Create web/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 9: Create web/src/App.tsx**

```tsx
export function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <h1 className="text-2xl font-bold text-gray-900">Claude Swarm Dashboard</h1>
    </div>
  );
}
```

**Step 10: Verify frontend builds**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm/web && npm run build
```
Expected: Build succeeds, `web/dist/` created.

**Step 11: Add web/dist and web/node_modules to .gitignore**

Append to root `.gitignore`:
```
web/node_modules/
web/dist/
```

**Step 12: Commit**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm
git add web/ .gitignore
git commit -m "feat: scaffold React frontend with Vite + Tailwind"
```

---

### Task 3: Serve Frontend from Hono

**Files:**
- Modify: `src/server.ts`
- Modify: `src/index.ts`

**Step 1: Add static file serving to server.ts**

Add to `src/server.ts`, after the API routes:

```typescript
import { serveStatic } from '@hono/node-server/serve-static';
import * as path from 'path';

// In createApp, after app.route('/api', api):

// Serve frontend static files
app.use('/app/*', serveStatic({
  root: path.relative(process.cwd(), path.join(__dirname, '..', 'web', 'dist')),
  rewriteRequestPath: (p) => p.replace(/^\/app/, ''),
}));

// Redirect root to dashboard
app.get('/', (c) => c.redirect('/app/'));

// SPA fallback: serve index.html for all /app/* routes not matched by static
app.get('/app/*', serveStatic({
  root: path.relative(process.cwd(), path.join(__dirname, '..', 'web', 'dist')),
  rewriteRequestPath: () => '/index.html',
}));
```

Note: `serveStatic` from `@hono/node-server/serve-static` works with the node server adapter. The `__dirname` approach works in CommonJS. If paths are tricky at runtime, use a config option `webDistDir` passed via `AppOptions`.

Alternatively, add `webDistDir?: string` to `AppOptions` and use that:

```typescript
interface AppOptions {
  // ... existing fields
  webDistDir?: string;
}

// Then in createApp:
if (opts.webDistDir) {
  app.use('/app/*', serveStatic({
    root: opts.webDistDir,
    rewriteRequestPath: (p) => p.replace(/^\/app/, ''),
  }));
  app.get('/', (c) => c.redirect('/app/'));
  app.get('/app/*', serveStatic({
    root: opts.webDistDir,
    rewriteRequestPath: () => '/index.html',
  }));
}
```

**Step 2: Update src/index.ts to pass webDistDir**

```typescript
import * as path from 'path';

const app = createApp({
  // ... existing opts
  webDistDir: path.join(__dirname, '..', 'web', 'dist'),
});
```

**Step 3: Add dev scripts to root package.json**

Add to root `package.json` scripts:
```json
{
  "scripts": {
    "dev:api": "tsx watch src/index.ts",
    "dev:web": "cd web && npm run dev",
    "build:web": "cd web && npm run build"
  }
}
```

**Step 4: Build frontend and test static serving**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm/web && npm run build
cd /Users/federicocosta/Codes/experiments/claude-swarm && npx tsx src/index.ts
# In another terminal: curl http://localhost:3000/app/
# Expected: HTML with "Claude Swarm Dashboard"
# curl http://localhost:3000/api/health
# Expected: JSON health response
```

**Step 5: Commit**

```bash
git add src/server.ts src/index.ts package.json
git commit -m "feat: serve React frontend from Hono at /app"
```

---

### Task 4: API Client & Hooks

**Files:**
- Create: `web/src/lib/api-client.ts`
- Create: `web/src/hooks/useApi.ts`
- Create: `web/src/hooks/useTasks.ts`
- Create: `web/src/hooks/useProfiles.ts`
- Create: `web/src/hooks/useHealth.ts`

**Step 1: Create API client**

Create `web/src/lib/api-client.ts`:

```typescript
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
      const qs = status ? `?status=${status}` : '';
      return fetchJson<TaskRecord[]>(`/tasks${qs}`);
    },
    get: (id: string) => fetchJson<TaskRecord>(`/tasks/${id}`),
    cancel: (id: string) => fetchJson<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  profiles: {
    list: () => fetchJson<McpProfile[]>('/mcp-profiles'),
    create: (data: { name: string; servers: McpProfile['servers'] }) =>
      fetchJson<McpProfile>('/mcp-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    delete: (id: string) => fetchJson<{ ok: boolean }>(`/mcp-profiles/${id}`, { method: 'DELETE' }),
  },
  health: () => fetchJson<HealthResponse>('/health'),
};
```

**Step 2: Create polling hook**

Create `web/src/hooks/useApi.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
): { data: T | null; error: string | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    fetcher()
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetcher]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}
```

**Step 3: Create domain hooks**

Create `web/src/hooks/useTasks.ts`:

```typescript
import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useTasks(statusFilter?: string) {
  const fetcher = useCallback(() => api.tasks.list(statusFilter), [statusFilter]);
  return usePolling(fetcher, 5000);
}

export function useTask(id: string) {
  const fetcher = useCallback(() => api.tasks.get(id), [id]);
  return usePolling(fetcher, 3000);
}
```

Create `web/src/hooks/useProfiles.ts`:

```typescript
import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useProfiles() {
  const fetcher = useCallback(() => api.profiles.list(), []);
  return usePolling(fetcher, 10000);
}
```

Create `web/src/hooks/useHealth.ts`:

```typescript
import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useHealth() {
  const fetcher = useCallback(() => api.health(), []);
  return usePolling(fetcher, 10000);
}
```

**Step 4: Commit**

```bash
git add web/src/lib/ web/src/hooks/
git commit -m "feat: add API client and polling hooks"
```

---

### Task 5: Layout & Routing

**Files:**
- Create: `web/src/components/layout/Sidebar.tsx`
- Create: `web/src/components/layout/Layout.tsx`
- Modify: `web/src/App.tsx`
- Create: `web/src/pages/TasksPage.tsx` (placeholder)
- Create: `web/src/pages/TaskDetailPage.tsx` (placeholder)
- Create: `web/src/pages/ProfilesPage.tsx` (placeholder)
- Create: `web/src/pages/HealthPage.tsx` (placeholder)

**Step 1: Create Sidebar**

Create `web/src/components/layout/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/app', label: 'Tasks', icon: '>' },
  { to: '/app/profiles', label: 'MCP Profiles', icon: '#' },
  { to: '/app/health', label: 'Health', icon: '+' },
];

export function Sidebar() {
  return (
    <aside className="w-56 bg-gray-900 text-gray-300 min-h-screen flex flex-col">
      <div className="px-4 py-5 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white tracking-tight">Claude Swarm</h1>
        <p className="text-xs text-gray-500 mt-0.5">Dashboard</p>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/app'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-xs font-mono w-4">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

**Step 2: Create Layout**

Create `web/src/components/layout/Layout.tsx`:

```tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 3: Create placeholder pages**

Create `web/src/pages/TasksPage.tsx`:
```tsx
export function TasksPage() {
  return <div><h2 className="text-xl font-semibold text-gray-900">Tasks</h2></div>;
}
```

Create `web/src/pages/TaskDetailPage.tsx`:
```tsx
export function TaskDetailPage() {
  return <div><h2 className="text-xl font-semibold text-gray-900">Task Detail</h2></div>;
}
```

Create `web/src/pages/ProfilesPage.tsx`:
```tsx
export function ProfilesPage() {
  return <div><h2 className="text-xl font-semibold text-gray-900">MCP Profiles</h2></div>;
}
```

Create `web/src/pages/HealthPage.tsx`:
```tsx
export function HealthPage() {
  return <div><h2 className="text-xl font-semibold text-gray-900">Health</h2></div>;
}
```

**Step 4: Wire routing in App.tsx**

Replace `web/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { HealthPage } from './pages/HealthPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/app" element={<TasksPage />} />
          <Route path="/app/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/app/profiles" element={<ProfilesPage />} />
          <Route path="/app/health" element={<HealthPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

**Step 5: Verify build**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm/web && npm run build
```
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add web/src/
git commit -m "feat: add layout, sidebar, routing, and placeholder pages"
```

---

### Task 6: Tasks Page (Data Table)

**Files:**
- Create: `web/src/components/tasks/StatusBadge.tsx`
- Create: `web/src/components/tasks/TaskTable.tsx`
- Modify: `web/src/pages/TasksPage.tsx`

**Step 1: Create StatusBadge**

Create `web/src/components/tasks/StatusBadge.tsx`:

```tsx
const styles: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-yellow-100 text-yellow-700',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}
```

**Step 2: Create TaskTable**

Create `web/src/components/tasks/TaskTable.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { TaskRecord } from '@/lib/api-client';
import { StatusBadge } from './StatusBadge';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TaskTable({ tasks }: { tasks: TaskRecord[] }) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">No tasks found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prompt</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <StatusBadge status={task.status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <Link to={`/app/tasks/${task.id}`} className="text-sm font-mono text-blue-600 hover:text-blue-800">
                  {task.id.slice(0, 8)}...
                </Link>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 max-w-md truncate">
                {task.prompt.slice(0, 80)}{task.prompt.length > 80 ? '...' : ''}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{task.mode}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{timeAgo(task.createdAt)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {task.duration ? `${(task.duration / 1000).toFixed(1)}s` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 3: Implement TasksPage**

Replace `web/src/pages/TasksPage.tsx`:

```tsx
import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { TaskTable } from '@/components/tasks/TaskTable';

const STATUSES = ['all', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const;

export function TasksPage() {
  const [filter, setFilter] = useState<string>('all');
  const { data: tasks, loading, error } = useTasks(filter === 'all' ? undefined : filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Tasks</h2>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                filter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
      {loading && !tasks ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <TaskTable tasks={tasks || []} />
      )}
    </div>
  );
}
```

**Step 4: Verify build**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm/web && npm run build
```

**Step 5: Commit**

```bash
git add web/src/
git commit -m "feat: add tasks page with data table and status filtering"
```

---

### Task 7: Task Detail Page

**Files:**
- Modify: `web/src/pages/TaskDetailPage.tsx`

**Step 1: Implement TaskDetailPage**

Replace `web/src/pages/TaskDetailPage.tsx`:

```tsx
import { useParams, Link } from 'react-router-dom';
import { useTask } from '@/hooks/useTasks';
import { StatusBadge } from '@/components/tasks/StatusBadge';

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task, loading, error } = useTask(id!);

  if (loading && !task) return <div className="text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!task) return <div className="text-sm text-gray-500">Task not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/app" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</Link>
        <h2 className="text-xl font-semibold text-gray-900">Task {task.id.slice(0, 8)}...</h2>
        <StatusBadge status={task.status} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Info card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Info</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="font-mono text-gray-900">{task.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Mode</dt>
              <dd className="text-gray-900">{task.mode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">{new Date(task.createdAt).toLocaleString()}</dd>
            </div>
            {task.startedAt && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Started</dt>
                <dd className="text-gray-900">{new Date(task.startedAt).toLocaleString()}</dd>
              </div>
            )}
            {task.completedAt && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Completed</dt>
                <dd className="text-gray-900">{new Date(task.completedAt).toLocaleString()}</dd>
              </div>
            )}
            {task.duration != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Duration</dt>
                <dd className="text-gray-900">{(task.duration / 1000).toFixed(1)}s</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Prompt card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Prompt</h3>
          <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-64 overflow-auto">
            {task.prompt}
          </pre>
        </div>
      </div>

      {/* Result */}
      {task.result && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">
            Result {task.result.valid ? '(valid)' : '(invalid)'}
          </h3>
          <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-96 overflow-auto">
            {JSON.stringify(task.result.data, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {task.error && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-5 space-y-2">
          <h3 className="text-sm font-medium text-red-700 uppercase">Error: {task.error.code}</h3>
          <p className="text-sm text-red-600">{task.error.message}</p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/pages/TaskDetailPage.tsx
git commit -m "feat: add task detail page with status, prompt, result, and error display"
```

---

### Task 8: MCP Profiles Page

**Files:**
- Modify: `web/src/pages/ProfilesPage.tsx`

**Step 1: Implement ProfilesPage**

Replace `web/src/pages/ProfilesPage.tsx`:

```tsx
import { useState } from 'react';
import { useProfiles } from '@/hooks/useProfiles';
import { api } from '@/lib/api-client';

export function ProfilesPage() {
  const { data: profiles, loading, error, refresh } = useProfiles();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [serverJson, setServerJson] = useState('[\n  {\n    "name": "example",\n    "command": "npx",\n    "args": ["-y", "example-mcp"]\n  }\n]');
  const [formError, setFormError] = useState('');

  async function handleCreate() {
    try {
      const servers = JSON.parse(serverJson);
      await api.profiles.create({ name, servers });
      setName('');
      setShowForm(false);
      setFormError('');
      refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function handleDelete(id: string) {
    await api.profiles.delete(id);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">MCP Profiles</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Profile'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <input
            type="text"
            placeholder="Profile name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <textarea
            value={serverJson}
            onChange={(e) => setServerJson(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            onClick={handleCreate}
            className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800"
          >
            Create
          </button>
        </div>
      )}

      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

      {loading && !profiles ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : profiles && profiles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No profiles.</div>
      ) : (
        <div className="space-y-2">
          {profiles?.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">{p.servers.length} server(s) - Created {new Date(p.createdAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/pages/ProfilesPage.tsx
git commit -m "feat: add MCP profiles page with create and delete"
```

---

### Task 9: Health Page

**Files:**
- Modify: `web/src/pages/HealthPage.tsx`

**Step 1: Implement HealthPage**

Replace `web/src/pages/HealthPage.tsx`:

```tsx
import { useHealth } from '@/hooks/useHealth';

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function HealthPage() {
  const { data, loading, error } = useHealth();

  if (loading && !data) return <div className="text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const { scheduler, uptime } = data;
  const utilization = scheduler.maxConcurrency > 0
    ? Math.round((scheduler.running / scheduler.maxConcurrency) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Health</h2>
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Running" value={scheduler.running} sub={`of ${scheduler.maxConcurrency} slots`} />
        <KpiCard label="Queued" value={scheduler.queued} />
        <KpiCard label="Utilization" value={`${utilization}%`} />
        <KpiCard label="Uptime" value={formatUptime(uptime)} />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Pool Capacity</p>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gray-900 h-3 rounded-full transition-all"
            style={{ width: `${utilization}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {scheduler.running} running / {scheduler.maxConcurrency} max concurrency
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add web/src/pages/HealthPage.tsx
git commit -m "feat: add health page with KPI cards and capacity bar"
```

---

### Task 10: Final Build & Verification

**Step 1: Build frontend**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm/web && npm run build
```
Expected: Build succeeds.

**Step 2: Run backend tests**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm && npx vitest run
```
Expected: All 53 tests pass.

**Step 3: TypeScript check on backend**

```bash
npx tsc --noEmit
```
Expected: No errors.

**Step 4: Manual smoke test**

```bash
npx tsx src/index.ts &
# curl http://localhost:3000/api/health  -> JSON
# curl http://localhost:3000/app/        -> HTML
kill %1
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: finalize v0.2.0 web UI dashboard"
```
