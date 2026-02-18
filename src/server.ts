import * as path from 'path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { TaskStore } from './storage/task.store';
import { McpProfileStore } from './storage/mcp-profile.store';
import { Scheduler } from './scheduler/scheduler';
import { WorkspaceManager } from './workspace/workspace-manager';
import { TaskService } from './services/task.service';
import { McpProfileService } from './services/mcp-profile.service';
import { HealthService } from './services/health.service';
import { taskRoutes } from './api/routes/tasks';
import { mcpProfileRoutes } from './api/routes/mcp-profiles';
import { healthRoutes } from './api/routes/health';
import type { ExecutionMode } from './shared/types';

interface AppOptions {
  db: BetterSQLite3Database;
  workspacesDir: string;
  maxConcurrency: number;
  defaultMode: ExecutionMode;
  defaultTimeout: number;
  logLevel: string;
  webDistDir?: string;
}

export function createApp(opts: AppOptions) {
  const app = new Hono();
  const taskStore = new TaskStore(opts.db);
  const mcpProfileStore = new McpProfileStore(opts.db);
  const scheduler = new Scheduler({ maxConcurrency: opts.maxConcurrency });
  const workspaceManager = new WorkspaceManager(opts.workspacesDir);

  const taskService = new TaskService({
    taskStore, scheduler, workspaceManager, mcpProfileStore,
    defaultMode: opts.defaultMode, defaultTimeout: opts.defaultTimeout,
  });
  const mcpProfileService = new McpProfileService(mcpProfileStore);
  const healthService = new HealthService(scheduler);

  const api = new Hono();
  api.route('/tasks', taskRoutes(taskService));
  api.route('/mcp-profiles', mcpProfileRoutes(mcpProfileService));
  api.route('/health', healthRoutes(healthService));
  app.route('/api', api);

  if (opts.webDistDir) {
    const webDistDir = path.relative(process.cwd(), opts.webDistDir);
    app.use('/app/*', serveStatic({
      root: webDistDir,
      rewriteRequestPath: (p) => p.replace(/^\/app/, ''),
    }));
    app.get('/', (c) => c.redirect('/app/'));
    app.get('/app/*', serveStatic({
      root: webDistDir,
      rewriteRequestPath: () => '/index.html',
    }));
  }

  return app;
}
