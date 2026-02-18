# Claude Swarm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude-Code-as-a-Service platform with REST API, CLI, and SDK for managing Claude Code instances as subprocesses or Docker containers.

**Architecture:** Monolithic Hono server with bounded worker pool, SQLite persistence via Drizzle ORM, strategy-pattern executors (process + container), workspace isolation per task.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, better-sqlite3, dockerode, Zod, vitest, claude-code-manager, pino, commander

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts`

**Step 1: Initialize project and install dependencies**

```bash
cd /Users/federicocosta/Codes/experiments/claude-swarm
npm init -y
```

Then update `package.json`:

```json
{
  "name": "claude-swarm",
  "version": "0.1.0",
  "description": "Claude-Code-as-a-Service platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint src --ext .ts"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 2: Install dependencies**

```bash
npm install hono @hono/node-server zod drizzle-orm better-sqlite3 dockerode adm-zip simple-git pino pino-pretty commander uuid
npm install -D typescript tsx vitest @types/node @types/better-sqlite3 @types/dockerode @types/adm-zip @types/uuid drizzle-kit
```

Note: `claude-code-manager` is a local dependency. Install via relative path:
```bash
npm install ../claude-code-manager
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*", "cli/**/*", "sdk/**/*"],
  "exclude": ["node_modules", "dist", "tests", "data"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
data/
*.db
*.db-journal
.env
.DS_Store
```

**Step 5: Create minimal entry point**

Create `src/index.ts`:
```typescript
console.log('claude-swarm starting...');
```

**Step 6: Verify build works**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts package-lock.json
git commit -m "chore: scaffold project with dependencies"
```

---

### Task 2: Shared Types & Errors

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/errors.ts`
- Test: `tests/unit/shared/errors.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/shared/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  SwarmError,
  TaskNotFoundError,
  ValidationError,
  ExecutionError,
  TimeoutError,
  WorkspaceError,
} from '../../../src/shared/errors';

describe('SwarmError', () => {
  it('is an instance of Error with code and details', () => {
    const err = new SwarmError('test', 'UNKNOWN', { foo: 'bar' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test');
    expect(err.code).toBe('UNKNOWN');
    expect(err.details).toEqual({ foo: 'bar' });
  });
});

describe('TaskNotFoundError', () => {
  it('has TASK_NOT_FOUND code', () => {
    const err = new TaskNotFoundError('abc-123');
    expect(err.code).toBe('TASK_NOT_FOUND');
    expect(err.message).toContain('abc-123');
  });
});

describe('ValidationError', () => {
  it('has VALIDATION_ERROR code', () => {
    const err = new ValidationError('bad input', [{ path: 'prompt', message: 'required' }]);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details.issues).toHaveLength(1);
  });
});

describe('ExecutionError', () => {
  it('has EXECUTION_ERROR code', () => {
    const err = new ExecutionError('claude crashed', 'task-1', 'stderr output');
    expect(err.code).toBe('EXECUTION_ERROR');
    expect(err.details.taskId).toBe('task-1');
  });
});

describe('TimeoutError', () => {
  it('has TIMEOUT code', () => {
    const err = new TimeoutError('task-1', 30000);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toContain('30000');
  });
});

describe('WorkspaceError', () => {
  it('has WORKSPACE_ERROR code', () => {
    const err = new WorkspaceError('zip extract failed');
    expect(err.code).toBe('WORKSPACE_ERROR');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/shared/errors.test.ts`
Expected: FAIL - modules not found

**Step 3: Write types**

Create `src/shared/types.ts`:

```typescript
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ExecutionMode = 'process' | 'container';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface TaskFiles {
  type: 'zip' | 'git';
  zipBuffer?: Buffer;
  gitUrl?: string;
  gitRef?: string;
}

export interface TaskMcpConfig {
  inline?: McpServerConfig[];
  profiles?: string[];
}

export interface CreateTaskInput {
  prompt: string;
  apiKey: string;
  schema?: Record<string, unknown>;
  mode?: ExecutionMode;
  timeout?: number;
  model?: string;
  permissionMode?: string;
  files?: TaskFiles;
  mcpServers?: TaskMcpConfig;
  tags?: Record<string, string>;
}

export interface TaskRecord {
  id: string;
  status: TaskStatus;
  prompt: string;
  mode: ExecutionMode;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: {
    data: unknown;
    valid: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
  duration?: number;
  tags?: Record<string, string>;
  workspacePath?: string;
}

export interface McpProfile {
  id: string;
  name: string;
  servers: McpServerConfig[];
  createdAt: string;
}

export interface ExecutorResult {
  success: boolean;
  data?: unknown;
  valid?: boolean;
  logs: string;
  artifacts: string[];
  duration: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface SchedulerStatus {
  running: number;
  queued: number;
  maxConcurrency: number;
}
```

**Step 4: Write errors**

Create `src/shared/errors.ts`:

```typescript
export class SwarmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'SwarmError';
  }
}

export class TaskNotFoundError extends SwarmError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND', { taskId });
    this.name = 'TaskNotFoundError';
  }
}

export class ValidationError extends SwarmError {
  constructor(message: string, issues: Array<{ path: string; message: string }>) {
    super(message, 'VALIDATION_ERROR', { issues });
    this.name = 'ValidationError';
  }
}

export class ExecutionError extends SwarmError {
  constructor(message: string, taskId: string, stderr?: string) {
    super(message, 'EXECUTION_ERROR', { taskId, stderr });
    this.name = 'ExecutionError';
  }
}

export class TimeoutError extends SwarmError {
  constructor(taskId: string, timeoutMs: number) {
    super(`Task ${taskId} timed out after ${timeoutMs}ms`, 'TIMEOUT', { taskId, timeoutMs });
    this.name = 'TimeoutError';
  }
}

export class WorkspaceError extends SwarmError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, 'WORKSPACE_ERROR', details);
    this.name = 'WorkspaceError';
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/shared/errors.test.ts`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/errors.ts tests/unit/shared/errors.test.ts
git commit -m "feat: add shared types and error classes"
```

---

### Task 3: Configuration Module

**Files:**
- Create: `src/config.ts`
- Test: `tests/unit/config.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig } from '../../src/config';

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns defaults when no env vars set', () => {
    const config = getConfig();
    expect(config.port).toBe(3000);
    expect(config.maxConcurrency).toBe(3);
    expect(config.defaultTimeout).toBe(300000);
    expect(config.defaultMode).toBe('process');
  });

  it('reads from environment variables', () => {
    process.env.PORT = '8080';
    process.env.MAX_CONCURRENCY = '5';
    process.env.DEFAULT_TIMEOUT = '60000';
    process.env.DEFAULT_MODE = 'container';
    process.env.DATA_DIR = '/tmp/swarm-data';

    const config = getConfig();
    expect(config.port).toBe(8080);
    expect(config.maxConcurrency).toBe(5);
    expect(config.defaultTimeout).toBe(60000);
    expect(config.defaultMode).toBe('container');
    expect(config.dataDir).toBe('/tmp/swarm-data');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `src/config.ts`:

```typescript
import * as path from 'path';
import type { ExecutionMode } from './shared/types';

export interface SwarmConfig {
  port: number;
  host: string;
  maxConcurrency: number;
  defaultTimeout: number;
  defaultMode: ExecutionMode;
  dataDir: string;
  dbPath: string;
  workspacesDir: string;
  logLevel: string;
}

export function getConfig(): SwarmConfig {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '3', 10),
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '300000', 10),
    defaultMode: (process.env.DEFAULT_MODE as ExecutionMode) || 'process',
    dataDir,
    dbPath: process.env.DB_PATH || path.join(dataDir, 'swarm.db'),
    workspacesDir: process.env.WORKSPACES_DIR || path.join(dataDir, 'workspaces'),
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat: add configuration module with env var support"
```

---

### Task 4: Storage Layer (SQLite + Drizzle)

**Files:**
- Create: `src/storage/schema.ts` (Drizzle schema)
- Create: `src/storage/database.ts`
- Create: `src/storage/task.store.ts`
- Create: `src/storage/mcp-profile.store.ts`
- Test: `tests/unit/storage/task.store.test.ts`
- Test: `tests/unit/storage/mcp-profile.store.test.ts`

**Step 1: Write the failing test for TaskStore**

Create `tests/unit/storage/task.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { TaskStore } from '../../../src/storage/task.store';
import { initializeDatabase } from '../../../src/storage/database';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    store = new TaskStore(db);
  });

  it('creates and retrieves a task', () => {
    const id = store.create({
      prompt: 'Write hello world',
      mode: 'process',
      tags: { env: 'test' },
    });
    const task = store.getById(id);
    expect(task).toBeDefined();
    expect(task!.prompt).toBe('Write hello world');
    expect(task!.status).toBe('queued');
    expect(task!.mode).toBe('process');
  });

  it('updates task status to running', () => {
    const id = store.create({ prompt: 'test', mode: 'process' });
    store.updateStatus(id, 'running');
    const task = store.getById(id);
    expect(task!.status).toBe('running');
    expect(task!.startedAt).toBeDefined();
  });

  it('completes a task with result', () => {
    const id = store.create({ prompt: 'test', mode: 'process' });
    store.updateStatus(id, 'running');
    store.complete(id, { data: { answer: 42 }, valid: true }, 1500);
    const task = store.getById(id);
    expect(task!.status).toBe('completed');
    expect(task!.result).toEqual({ data: { answer: 42 }, valid: true });
    expect(task!.duration).toBe(1500);
    expect(task!.completedAt).toBeDefined();
  });

  it('fails a task with error', () => {
    const id = store.create({ prompt: 'test', mode: 'process' });
    store.updateStatus(id, 'running');
    store.fail(id, { code: 'TIMEOUT', message: 'timed out' }, 5000);
    const task = store.getById(id);
    expect(task!.status).toBe('failed');
    expect(task!.error).toEqual({ code: 'TIMEOUT', message: 'timed out' });
  });

  it('lists tasks with status filter', () => {
    store.create({ prompt: 'a', mode: 'process' });
    const id2 = store.create({ prompt: 'b', mode: 'process' });
    store.updateStatus(id2, 'running');

    const queued = store.list({ status: 'queued' });
    expect(queued).toHaveLength(1);
    expect(queued[0].prompt).toBe('a');

    const running = store.list({ status: 'running' });
    expect(running).toHaveLength(1);
    expect(running[0].prompt).toBe('b');
  });

  it('returns null for non-existent task', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/storage/task.store.test.ts`
Expected: FAIL - modules not found

**Step 3: Create Drizzle schema**

Create `src/storage/schema.ts`:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('queued'),
  prompt: text('prompt').notNull(),
  mode: text('mode').notNull().default('process'),
  schemaJson: text('schema_json'),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  resultJson: text('result_json'),
  errorJson: text('error_json'),
  duration: integer('duration'),
  tagsJson: text('tags_json'),
  workspacePath: text('workspace_path'),
});

export const mcpProfiles = sqliteTable('mcp_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  serversJson: text('servers_json').notNull(),
  createdAt: text('created_at').notNull(),
});
```

**Step 4: Create database initialization**

Create `src/storage/database.ts`:

```typescript
import Database from 'better-sqlite3';

export function initializeDatabase(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'process',
      schema_json TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      result_json TEXT,
      error_json TEXT,
      duration INTEGER,
      tags_json TEXT,
      workspace_path TEXT
    );

    CREATE TABLE IF NOT EXISTS mcp_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      servers_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
  `);
}

export function createDatabase(dbPath: string): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  initializeDatabase(sqlite);
  return sqlite;
}
```

**Step 5: Create TaskStore**

Create `src/storage/task.store.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { tasks } from './schema';
import type { TaskRecord, TaskStatus } from '../shared/types';

interface CreateTaskParams {
  prompt: string;
  mode: string;
  schemaJson?: string;
  tags?: Record<string, string>;
  workspacePath?: string;
}

interface ListTasksFilter {
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

export class TaskStore {
  constructor(private db: BetterSQLite3Database) {}

  create(params: CreateTaskParams): string {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.insert(tasks).values({
      id,
      prompt: params.prompt,
      mode: params.mode,
      schemaJson: params.schemaJson,
      createdAt: now,
      tagsJson: params.tags ? JSON.stringify(params.tags) : null,
      workspacePath: params.workspacePath,
    }).run();
    return id;
  }

  getById(id: string): TaskRecord | null {
    const rows = this.db.select().from(tasks).where(eq(tasks.id, id)).all();
    if (rows.length === 0) return null;
    return this.toTaskRecord(rows[0]);
  }

  updateStatus(id: string, status: TaskStatus): void {
    const updates: Record<string, unknown> = { status };
    if (status === 'running') {
      updates.startedAt = new Date().toISOString();
    }
    this.db.update(tasks).set(updates).where(eq(tasks.id, id)).run();
  }

  complete(id: string, result: { data: unknown; valid: boolean }, duration: number): void {
    this.db.update(tasks).set({
      status: 'completed',
      resultJson: JSON.stringify(result),
      completedAt: new Date().toISOString(),
      duration,
    }).where(eq(tasks.id, id)).run();
  }

  fail(id: string, error: { code: string; message: string }, duration?: number): void {
    this.db.update(tasks).set({
      status: 'failed',
      errorJson: JSON.stringify(error),
      completedAt: new Date().toISOString(),
      duration,
    }).where(eq(tasks.id, id)).run();
  }

  list(filter: ListTasksFilter = {}): TaskRecord[] {
    let query = this.db.select().from(tasks);
    if (filter.status) {
      query = query.where(eq(tasks.status, filter.status)) as typeof query;
    }
    const rows = query.all();
    return rows.map((row) => this.toTaskRecord(row));
  }

  private toTaskRecord(row: typeof tasks.$inferSelect): TaskRecord {
    return {
      id: row.id,
      status: row.status as TaskStatus,
      prompt: row.prompt,
      mode: row.mode as 'process' | 'container',
      createdAt: row.createdAt,
      startedAt: row.startedAt ?? undefined,
      completedAt: row.completedAt ?? undefined,
      result: row.resultJson ? JSON.parse(row.resultJson) : undefined,
      error: row.errorJson ? JSON.parse(row.errorJson) : undefined,
      duration: row.duration ?? undefined,
      tags: row.tagsJson ? JSON.parse(row.tagsJson) : undefined,
      workspacePath: row.workspacePath ?? undefined,
    };
  }
}
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/storage/task.store.test.ts`
Expected: All 6 tests PASS

**Step 7: Write the failing test for McpProfileStore**

Create `tests/unit/storage/mcp-profile.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { McpProfileStore } from '../../../src/storage/mcp-profile.store';
import { initializeDatabase } from '../../../src/storage/database';

describe('McpProfileStore', () => {
  let store: McpProfileStore;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    store = new McpProfileStore(db);
  });

  it('creates and retrieves a profile', () => {
    const id = store.create({
      name: 'my-postgres',
      servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
    });
    const profile = store.getById(id);
    expect(profile).toBeDefined();
    expect(profile!.name).toBe('my-postgres');
    expect(profile!.servers).toHaveLength(1);
    expect(profile!.servers[0].command).toBe('npx');
  });

  it('lists all profiles', () => {
    store.create({ name: 'p1', servers: [] });
    store.create({ name: 'p2', servers: [] });
    const all = store.list();
    expect(all).toHaveLength(2);
  });

  it('deletes a profile', () => {
    const id = store.create({ name: 'deleteme', servers: [] });
    store.delete(id);
    expect(store.getById(id)).toBeNull();
  });

  it('rejects duplicate names', () => {
    store.create({ name: 'unique', servers: [] });
    expect(() => store.create({ name: 'unique', servers: [] })).toThrow();
  });
});
```

**Step 8: Create McpProfileStore**

Create `src/storage/mcp-profile.store.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { mcpProfiles } from './schema';
import type { McpProfile, McpServerConfig } from '../shared/types';

interface CreateProfileParams {
  name: string;
  servers: McpServerConfig[];
}

export class McpProfileStore {
  constructor(private db: BetterSQLite3Database) {}

  create(params: CreateProfileParams): string {
    const id = uuidv4();
    this.db.insert(mcpProfiles).values({
      id,
      name: params.name,
      serversJson: JSON.stringify(params.servers),
      createdAt: new Date().toISOString(),
    }).run();
    return id;
  }

  getById(id: string): McpProfile | null {
    const rows = this.db.select().from(mcpProfiles).where(eq(mcpProfiles.id, id)).all();
    if (rows.length === 0) return null;
    return this.toProfile(rows[0]);
  }

  list(): McpProfile[] {
    return this.db.select().from(mcpProfiles).all().map(this.toProfile);
  }

  delete(id: string): void {
    this.db.delete(mcpProfiles).where(eq(mcpProfiles.id, id)).run();
  }

  private toProfile(row: typeof mcpProfiles.$inferSelect): McpProfile {
    return {
      id: row.id,
      name: row.name,
      servers: JSON.parse(row.serversJson),
      createdAt: row.createdAt,
    };
  }
}
```

**Step 9: Run both store tests**

Run: `npx vitest run tests/unit/storage/`
Expected: All tests PASS

**Step 10: Commit**

```bash
git add src/storage/ tests/unit/storage/
git commit -m "feat: add SQLite storage layer with task and MCP profile stores"
```

---

### Task 5: Workspace Manager

**Files:**
- Create: `src/workspace/workspace-manager.ts`
- Test: `tests/unit/workspace/workspace-manager.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/workspace/workspace-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { WorkspaceManager } from '../../../src/workspace/workspace-manager';

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-test-'));
    manager = new WorkspaceManager(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('creates a workspace directory for a task', async () => {
    const workspace = await manager.create('task-123');
    expect(workspace.path).toContain('task-123');
    const stat = await fs.stat(workspace.path);
    expect(stat.isDirectory()).toBe(true);
  });

  it('extracts a zip file into the workspace', async () => {
    const zip = new AdmZip();
    zip.addFile('hello.txt', Buffer.from('world'));
    zip.addFile('src/main.ts', Buffer.from('console.log("hi")'));
    const zipBuffer = zip.toBuffer();

    const workspace = await manager.create('task-zip');
    await manager.extractZip(workspace.path, zipBuffer);

    const content = await fs.readFile(path.join(workspace.path, 'hello.txt'), 'utf-8');
    expect(content).toBe('world');
    const tsContent = await fs.readFile(path.join(workspace.path, 'src', 'main.ts'), 'utf-8');
    expect(tsContent).toBe('console.log("hi")');
  });

  it('writes MCP config (.claude.json) into workspace', async () => {
    const workspace = await manager.create('task-mcp');
    await manager.writeMcpConfig(workspace.path, [
      { name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'], env: {} },
    ]);

    const configPath = path.join(workspace.path, '.claude.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(config.mcpServers.pg).toBeDefined();
    expect(config.mcpServers.pg.command).toBe('npx');
  });

  it('collects artifacts from workspace', async () => {
    const workspace = await manager.create('task-artifacts');
    // Simulate Claude creating files
    await fs.writeFile(path.join(workspace.path, 'output.json'), '{}');
    await fs.mkdir(path.join(workspace.path, 'generated'), { recursive: true });
    await fs.writeFile(path.join(workspace.path, 'generated', 'code.ts'), 'export {}');

    const artifacts = await manager.collectArtifacts(workspace.path);
    expect(artifacts.length).toBeGreaterThanOrEqual(2);
    expect(artifacts).toContain('output.json');
    expect(artifacts).toContain(path.join('generated', 'code.ts'));
  });

  it('cleans up a workspace', async () => {
    const workspace = await manager.create('task-cleanup');
    await manager.cleanup(workspace.path);
    await expect(fs.stat(workspace.path)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/workspace/workspace-manager.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `src/workspace/workspace-manager.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';
import type { McpServerConfig } from '../shared/types';
import { WorkspaceError } from '../shared/errors';

export interface Workspace {
  path: string;
  taskId: string;
}

export class WorkspaceManager {
  constructor(private baseDir: string) {}

  async create(taskId: string): Promise<Workspace> {
    const workspacePath = path.join(this.baseDir, `task-${taskId}`);
    await fs.mkdir(workspacePath, { recursive: true, mode: 0o700 });
    return { path: workspacePath, taskId };
  }

  async extractZip(workspacePath: string, zipBuffer: Buffer): Promise<void> {
    try {
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(workspacePath, true);
    } catch (err) {
      throw new WorkspaceError(`Failed to extract zip: ${(err as Error).message}`);
    }
  }

  async cloneGit(workspacePath: string, gitUrl: string, gitRef?: string): Promise<void> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit();
    try {
      await git.clone(gitUrl, workspacePath);
      if (gitRef) {
        const repo = simpleGit(workspacePath);
        await repo.checkout(gitRef);
      }
    } catch (err) {
      throw new WorkspaceError(`Failed to clone git repo: ${(err as Error).message}`, {
        gitUrl,
        gitRef,
      });
    }
  }

  async writeMcpConfig(workspacePath: string, servers: McpServerConfig[]): Promise<void> {
    const mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> = {};
    for (const server of servers) {
      mcpServers[server.name] = {
        command: server.command,
        args: server.args,
        env: server.env,
      };
    }
    const config = { mcpServers };
    await fs.writeFile(
      path.join(workspacePath, '.claude.json'),
      JSON.stringify(config, null, 2),
    );
  }

  async collectArtifacts(workspacePath: string): Promise<string[]> {
    const artifacts: string[] = [];
    const ignore = new Set(['.claude.json', 'node_modules', '.git']);

    async function walk(dir: string, rel: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (ignore.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = rel ? path.join(rel, entry.name) : entry.name;
        if (entry.isDirectory()) {
          await walk(fullPath, relPath);
        } else {
          artifacts.push(relPath);
        }
      }
    }

    await walk(workspacePath, '');
    return artifacts;
  }

  async cleanup(workspacePath: string): Promise<void> {
    await fs.rm(workspacePath, { recursive: true, force: true });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/workspace/workspace-manager.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/workspace/ tests/unit/workspace/
git commit -m "feat: add workspace manager for task isolation"
```

---

### Task 6: Executor Interface & Process Executor

**Files:**
- Create: `src/executors/executor.interface.ts`
- Create: `src/executors/process.executor.ts`
- Test: `tests/unit/executors/process.executor.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/executors/process.executor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessExecutor } from '../../../src/executors/process.executor';

// Mock claude-code-manager
vi.mock('claude-code-manager', () => {
  return {
    ClaudeCodeManager: vi.fn().mockImplementation(() => ({
      execute: vi.fn().mockResolvedValue({
        success: true,
        data: { answer: 42 },
        artifacts: ['output.txt'],
        logs: 'done',
        duration: 1200,
        outputDir: '/tmp/out',
      }),
    })),
  };
});

describe('ProcessExecutor', () => {
  let executor: ProcessExecutor;

  beforeEach(() => {
    executor = new ProcessExecutor();
  });

  it('returns a successful result from claude-code-manager', async () => {
    const result = await executor.execute({
      taskId: 'task-1',
      prompt: 'Say hello',
      apiKey: 'sk-test-key',
      workspacePath: '/tmp/workspace',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ answer: 42 });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns an error result when execution fails', async () => {
    const { ClaudeCodeManager } = await import('claude-code-manager');
    const mockInstance = new ClaudeCodeManager();
    (mockInstance.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('process crashed')
    );

    // Create a new executor that will use the mocked module
    const failExecutor = new ProcessExecutor();
    // Override internal manager for this test
    (failExecutor as any).manager = mockInstance;

    const result = await failExecutor.execute({
      taskId: 'task-2',
      prompt: 'crash',
      apiKey: 'sk-test-key',
      workspacePath: '/tmp/workspace',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EXECUTION_ERROR');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/executors/process.executor.test.ts`
Expected: FAIL - modules not found

**Step 3: Write executor interface**

Create `src/executors/executor.interface.ts`:

```typescript
import type { ExecutorResult } from '../shared/types';

export interface ExecuteParams {
  taskId: string;
  prompt: string;
  apiKey: string;
  workspacePath: string;
  schema?: Record<string, unknown>;
  timeout?: number;
  model?: string;
  permissionMode?: string;
  onOutput?: (chunk: string) => void;
}

export interface Executor {
  execute(params: ExecuteParams): Promise<ExecutorResult>;
  cancel(taskId: string): Promise<void>;
}
```

**Step 4: Write ProcessExecutor**

Create `src/executors/process.executor.ts`:

```typescript
import { z } from 'zod';
import { ClaudeCodeManager } from 'claude-code-manager';
import type { Executor, ExecuteParams } from './executor.interface';
import type { ExecutorResult } from '../shared/types';

export class ProcessExecutor implements Executor {
  private manager: ClaudeCodeManager;
  private runningTasks = new Map<string, { cancel: () => void }>();

  constructor() {
    this.manager = new ClaudeCodeManager();
  }

  async execute(params: ExecuteParams): Promise<ExecutorResult> {
    const start = Date.now();
    try {
      // Build a dynamic Zod schema from JSON Schema if provided, else use a passthrough
      const schema = params.schema
        ? z.any()
        : z.any();

      const result = await this.manager.execute({
        prompt: params.prompt,
        schema,
        timeout: params.timeout,
        onOutput: params.onOutput,
      });

      return {
        success: result.success,
        data: result.data,
        valid: result.success,
        logs: result.logs,
        artifacts: result.artifacts || [],
        duration: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        logs: (err as Error).message,
        artifacts: [],
        duration: Date.now() - start,
        error: {
          code: 'EXECUTION_ERROR',
          message: (err as Error).message,
        },
      };
    }
  }

  async cancel(taskId: string): Promise<void> {
    const running = this.runningTasks.get(taskId);
    if (running) {
      running.cancel();
      this.runningTasks.delete(taskId);
    }
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/executors/process.executor.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/executors/ tests/unit/executors/
git commit -m "feat: add executor interface and process executor"
```

---

### Task 7: Scheduler (Worker Pool)

**Files:**
- Create: `src/scheduler/scheduler.ts`
- Test: `tests/unit/scheduler/scheduler.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/scheduler/scheduler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scheduler } from '../../../src/scheduler/scheduler';
import type { Executor, ExecuteParams } from '../../../src/executors/executor.interface';
import type { ExecutorResult } from '../../../src/shared/types';

function createMockExecutor(delay = 50): Executor {
  return {
    execute: vi.fn(async (params: ExecuteParams): Promise<ExecutorResult> => {
      await new Promise((r) => setTimeout(r, delay));
      return {
        success: true,
        data: { echo: params.prompt },
        valid: true,
        logs: '',
        artifacts: [],
        duration: delay,
      };
    }),
    cancel: vi.fn(async () => {}),
  };
}

describe('Scheduler', () => {
  it('executes a task immediately when pool has capacity', async () => {
    const executor = createMockExecutor(10);
    const scheduler = new Scheduler({ maxConcurrency: 2 });
    const onComplete = vi.fn();

    scheduler.enqueue({
      taskId: 'task-1',
      params: {
        taskId: 'task-1',
        prompt: 'hello',
        apiKey: 'key',
        workspacePath: '/tmp',
      },
      executor,
      onComplete,
    });

    // Wait for task to complete
    await new Promise((r) => setTimeout(r, 100));
    expect(onComplete).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ success: true })
    );
  });

  it('queues tasks when at max concurrency', async () => {
    const executor = createMockExecutor(100);
    const scheduler = new Scheduler({ maxConcurrency: 1 });
    const completions: string[] = [];

    scheduler.enqueue({
      taskId: 'task-1',
      params: { taskId: 'task-1', prompt: 'first', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: (id) => completions.push(id),
    });

    scheduler.enqueue({
      taskId: 'task-2',
      params: { taskId: 'task-2', prompt: 'second', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: (id) => completions.push(id),
    });

    const status = scheduler.getStatus();
    expect(status.running).toBe(1);
    expect(status.queued).toBe(1);

    // Wait for both to complete
    await new Promise((r) => setTimeout(r, 350));
    expect(completions).toEqual(['task-1', 'task-2']);
  });

  it('reports status correctly', () => {
    const scheduler = new Scheduler({ maxConcurrency: 5 });
    const status = scheduler.getStatus();
    expect(status.running).toBe(0);
    expect(status.queued).toBe(0);
    expect(status.maxConcurrency).toBe(5);
  });

  it('cancels a queued task', async () => {
    const executor = createMockExecutor(200);
    const scheduler = new Scheduler({ maxConcurrency: 1 });
    const onComplete1 = vi.fn();
    const onComplete2 = vi.fn();

    scheduler.enqueue({
      taskId: 'task-1',
      params: { taskId: 'task-1', prompt: 'a', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: onComplete1,
    });

    scheduler.enqueue({
      taskId: 'task-2',
      params: { taskId: 'task-2', prompt: 'b', apiKey: 'k', workspacePath: '/tmp' },
      executor,
      onComplete: onComplete2,
    });

    const cancelled = await scheduler.cancel('task-2');
    expect(cancelled).toBe(true);
    expect(scheduler.getStatus().queued).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scheduler/scheduler.test.ts`
Expected: FAIL - module not found

**Step 3: Write implementation**

Create `src/scheduler/scheduler.ts`:

```typescript
import type { Executor, ExecuteParams } from '../executors/executor.interface';
import type { ExecutorResult, SchedulerStatus } from '../shared/types';

interface QueuedTask {
  taskId: string;
  params: ExecuteParams;
  executor: Executor;
  onComplete: (taskId: string, result: ExecutorResult) => void;
}

export class Scheduler {
  private queue: QueuedTask[] = [];
  private running = new Map<string, { executor: Executor }>();
  private maxConcurrency: number;

  constructor(opts: { maxConcurrency: number }) {
    this.maxConcurrency = opts.maxConcurrency;
  }

  enqueue(task: QueuedTask): void {
    if (this.running.size < this.maxConcurrency) {
      this.run(task);
    } else {
      this.queue.push(task);
    }
  }

  async cancel(taskId: string): Promise<boolean> {
    // Check queue first
    const queueIdx = this.queue.findIndex((t) => t.taskId === taskId);
    if (queueIdx !== -1) {
      this.queue.splice(queueIdx, 1);
      return true;
    }

    // Check running
    const runningTask = this.running.get(taskId);
    if (runningTask) {
      await runningTask.executor.cancel(taskId);
      this.running.delete(taskId);
      this.drainQueue();
      return true;
    }

    return false;
  }

  getStatus(): SchedulerStatus {
    return {
      running: this.running.size,
      queued: this.queue.length,
      maxConcurrency: this.maxConcurrency,
    };
  }

  private run(task: QueuedTask): void {
    this.running.set(task.taskId, { executor: task.executor });

    task.executor.execute(task.params).then(
      (result) => {
        this.running.delete(task.taskId);
        task.onComplete(task.taskId, result);
        this.drainQueue();
      },
      (err) => {
        this.running.delete(task.taskId);
        task.onComplete(task.taskId, {
          success: false,
          logs: (err as Error).message,
          artifacts: [],
          duration: 0,
          error: { code: 'SCHEDULER_ERROR', message: (err as Error).message },
        });
        this.drainQueue();
      },
    );
  }

  private drainQueue(): void {
    while (this.running.size < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.run(next);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scheduler/scheduler.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/scheduler/ tests/unit/scheduler/
git commit -m "feat: add bounded-concurrency task scheduler"
```

---

### Task 8: API Schemas (Zod)

**Files:**
- Create: `src/api/schemas/task.schema.ts`
- Create: `src/api/schemas/mcp-profile.schema.ts`
- Test: `tests/unit/api/schemas.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/api/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CreateTaskSchema, TaskResponseSchema } from '../../../src/api/schemas/task.schema';
import { CreateMcpProfileSchema } from '../../../src/api/schemas/mcp-profile.schema';

describe('CreateTaskSchema', () => {
  it('validates a minimal task request', () => {
    const result = CreateTaskSchema.safeParse({
      prompt: 'Hello world',
      apiKey: 'sk-ant-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing prompt', () => {
    const result = CreateTaskSchema.safeParse({
      apiKey: 'sk-ant-123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing apiKey', () => {
    const result = CreateTaskSchema.safeParse({
      prompt: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('validates a full task request with all optional fields', () => {
    const result = CreateTaskSchema.safeParse({
      prompt: 'Hello world',
      apiKey: 'sk-ant-123',
      schema: { type: 'object', properties: { answer: { type: 'string' } } },
      mode: 'container',
      timeout: 60000,
      model: 'claude-sonnet-4-6',
      permissionMode: 'default',
      files: { type: 'git', gitUrl: 'https://github.com/user/repo.git', gitRef: 'main' },
      mcpServers: {
        inline: [{ name: 'pg', command: 'npx', args: ['-y', 'pg'] }],
        profiles: ['profile-1'],
      },
      tags: { env: 'prod' },
    });
    expect(result.success).toBe(true);
  });
});

describe('CreateMcpProfileSchema', () => {
  it('validates a profile creation request', () => {
    const result = CreateMcpProfileSchema.safeParse({
      name: 'my-postgres',
      servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = CreateMcpProfileSchema.safeParse({
      servers: [],
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api/schemas.test.ts`
Expected: FAIL

**Step 3: Write task schema**

Create `src/api/schemas/task.schema.ts`:

```typescript
import { z } from 'zod';

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const TaskFilesSchema = z.object({
  type: z.enum(['zip', 'git']),
  gitUrl: z.string().url().optional(),
  gitRef: z.string().optional(),
});

const TaskMcpSchema = z.object({
  inline: z.array(McpServerConfigSchema).optional(),
  profiles: z.array(z.string()).optional(),
});

export const CreateTaskSchema = z.object({
  prompt: z.string().min(1),
  apiKey: z.string().min(1),
  schema: z.record(z.unknown()).optional(),
  mode: z.enum(['process', 'container']).default('process'),
  timeout: z.number().positive().optional(),
  model: z.string().optional(),
  permissionMode: z.string().optional(),
  files: TaskFilesSchema.optional(),
  mcpServers: TaskMcpSchema.optional(),
  tags: z.record(z.string()).optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const TaskResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  prompt: z.string(),
  mode: z.enum(['process', 'container']),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  result: z.object({
    data: z.unknown(),
    valid: z.boolean(),
  }).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
  duration: z.number().optional(),
  tags: z.record(z.string()).optional(),
});
```

**Step 4: Write MCP profile schema**

Create `src/api/schemas/mcp-profile.schema.ts`:

```typescript
import { z } from 'zod';

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

export const CreateMcpProfileSchema = z.object({
  name: z.string().min(1),
  servers: z.array(McpServerConfigSchema),
});

export type CreateMcpProfileInput = z.infer<typeof CreateMcpProfileSchema>;

export const McpProfileResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  servers: z.array(McpServerConfigSchema),
  createdAt: z.string(),
});
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/api/schemas.test.ts`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add src/api/schemas/ tests/unit/api/
git commit -m "feat: add Zod schemas for API request/response validation"
```

---

### Task 9: Services Layer

**Files:**
- Create: `src/services/task.service.ts`
- Create: `src/services/mcp-profile.service.ts`
- Create: `src/services/health.service.ts`
- Test: `tests/unit/services/task.service.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/services/task.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { TaskService } from '../../../src/services/task.service';
import { TaskStore } from '../../../src/storage/task.store';
import { Scheduler } from '../../../src/scheduler/scheduler';
import { WorkspaceManager } from '../../../src/workspace/workspace-manager';
import { initializeDatabase } from '../../../src/storage/database';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('TaskService', () => {
  let service: TaskService;
  let taskStore: TaskStore;
  let baseDir: string;

  beforeEach(async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    taskStore = new TaskStore(db);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-svc-'));
    const workspace = new WorkspaceManager(baseDir);
    const scheduler = new Scheduler({ maxConcurrency: 2 });

    service = new TaskService({
      taskStore,
      scheduler,
      workspaceManager: workspace,
      defaultMode: 'process',
      defaultTimeout: 300000,
    });
  });

  it('creates a task and returns its ID', async () => {
    const { id } = await service.createTask({
      prompt: 'Hello',
      apiKey: 'sk-test',
    });
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('retrieves a created task', async () => {
    const { id } = await service.createTask({
      prompt: 'Hello',
      apiKey: 'sk-test',
    });
    const task = service.getTask(id);
    expect(task).toBeDefined();
    expect(task!.status).toBe('queued');
    expect(task!.prompt).toBe('Hello');
  });

  it('throws TaskNotFoundError for unknown ID', () => {
    expect(() => service.getTask('nonexistent')).toThrow('TASK_NOT_FOUND');
  });

  it('lists tasks', async () => {
    await service.createTask({ prompt: 'A', apiKey: 'k' });
    await service.createTask({ prompt: 'B', apiKey: 'k' });
    const tasks = service.listTasks();
    expect(tasks).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/task.service.test.ts`
Expected: FAIL

**Step 3: Write TaskService**

Create `src/services/task.service.ts`:

```typescript
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

    // Create task record in database
    const id = this.deps.taskStore.create({
      prompt: input.prompt,
      mode,
      schemaJson: input.schema ? JSON.stringify(input.schema) : undefined,
      tags: input.tags,
      workspacePath: workspace.path,
    });

    // Enqueue for execution
    const executor = new ProcessExecutor(); // TODO: select based on mode
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
          this.deps.taskStore.complete(
            taskId,
            { data: result.data, valid: result.valid ?? true },
            result.duration,
          );
        } else {
          this.deps.taskStore.fail(
            taskId,
            result.error || { code: 'UNKNOWN', message: 'Unknown error' },
            result.duration,
          );
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
```

**Step 4: Write HealthService and McpProfileService**

Create `src/services/health.service.ts`:

```typescript
import { Scheduler } from '../scheduler/scheduler';
import type { SchedulerStatus } from '../shared/types';

export class HealthService {
  constructor(private scheduler: Scheduler) {}

  getHealth(): { status: 'ok'; scheduler: SchedulerStatus; uptime: number } {
    return {
      status: 'ok',
      scheduler: this.scheduler.getStatus(),
      uptime: process.uptime(),
    };
  }
}
```

Create `src/services/mcp-profile.service.ts`:

```typescript
import { McpProfileStore } from '../storage/mcp-profile.store';
import type { McpProfile } from '../shared/types';
import type { CreateMcpProfileInput } from '../api/schemas/mcp-profile.schema';

export class McpProfileService {
  constructor(private store: McpProfileStore) {}

  create(input: CreateMcpProfileInput): McpProfile {
    const id = this.store.create(input);
    return this.store.getById(id)!;
  }

  getById(id: string): McpProfile | null {
    return this.store.getById(id);
  }

  list(): McpProfile[] {
    return this.store.list();
  }

  delete(id: string): void {
    this.store.delete(id);
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/services/task.service.test.ts`
Expected: All 4 tests PASS

**Step 6: Commit**

```bash
git add src/services/ tests/unit/services/
git commit -m "feat: add service layer (task, MCP profile, health)"
```

---

### Task 10: API Middleware

**Files:**
- Create: `src/api/middleware/error-handler.ts`
- Create: `src/api/middleware/logger.ts`

**Step 1: Write error handler middleware**

Create `src/api/middleware/error-handler.ts`:

```typescript
import { Context } from 'hono';
import { SwarmError, TaskNotFoundError } from '../../shared/errors';

export function errorHandler(err: Error, c: Context) {
  if (err instanceof TaskNotFoundError) {
    return c.json({ error: { code: err.code, message: err.message } }, 404);
  }
  if (err instanceof SwarmError) {
    const status = err.code === 'VALIDATION_ERROR' ? 400 : 500;
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
}
```

**Step 2: Write logger middleware**

Create `src/api/middleware/logger.ts`:

```typescript
import { MiddlewareHandler } from 'hono';
import pino from 'pino';

export function createLogger(level: string) {
  return pino({ level, transport: level === 'debug' ? { target: 'pino-pretty' } : undefined });
}

export function loggerMiddleware(logger: pino.Logger): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    logger.info({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration,
    });
  };
}
```

**Step 3: Commit**

```bash
git add src/api/middleware/
git commit -m "feat: add error handler and logger middleware"
```

---

### Task 11: API Routes

**Files:**
- Create: `src/api/routes/tasks.ts`
- Create: `src/api/routes/mcp-profiles.ts`
- Create: `src/api/routes/health.ts`
- Test: `tests/integration/api.test.ts`

**Step 1: Write the failing integration test**

Create `tests/integration/api.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createApp } from '../../src/server';
import { initializeDatabase } from '../../src/storage/database';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('API Integration', () => {
  let app: ReturnType<typeof createApp>;
  let baseDir: string;

  beforeEach(async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-api-'));

    app = createApp({
      db,
      workspacesDir: baseDir,
      maxConcurrency: 2,
      defaultMode: 'process',
      defaultTimeout: 300000,
      logLevel: 'silent',
    });
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.scheduler).toBeDefined();
    });
  });

  describe('POST /mcp-profiles', () => {
    it('creates a profile', async () => {
      const res = await app.request('/mcp-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test-pg',
          servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('test-pg');
    });
  });

  describe('GET /mcp-profiles', () => {
    it('lists profiles', async () => {
      // Create one first
      await app.request('/mcp-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'p1', servers: [] }),
      });

      const res = await app.request('/mcp-profiles');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });
  });

  describe('POST /tasks', () => {
    it('returns 400 for invalid request', async () => {
      const res = await app.request('/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /tasks/:id', () => {
    it('returns 404 for unknown task', async () => {
      const res = await app.request('/tasks/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/api.test.ts`
Expected: FAIL - createApp not found

**Step 3: Write route files**

Create `src/api/routes/health.ts`:

```typescript
import { Hono } from 'hono';
import { HealthService } from '../../services/health.service';

export function healthRoutes(healthService: HealthService) {
  const router = new Hono();

  router.get('/', (c) => {
    return c.json(healthService.getHealth());
  });

  return router;
}
```

Create `src/api/routes/mcp-profiles.ts`:

```typescript
import { Hono } from 'hono';
import { McpProfileService } from '../../services/mcp-profile.service';
import { CreateMcpProfileSchema } from '../schemas/mcp-profile.schema';

export function mcpProfileRoutes(mcpProfileService: McpProfileService) {
  const router = new Hono();

  router.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateMcpProfileSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const profile = mcpProfileService.create(parsed.data);
    return c.json(profile, 201);
  });

  router.get('/', (c) => {
    return c.json(mcpProfileService.list());
  });

  router.get('/:id', (c) => {
    const profile = mcpProfileService.getById(c.req.param('id'));
    if (!profile) return c.json({ error: { code: 'NOT_FOUND', message: 'Profile not found' } }, 404);
    return c.json(profile);
  });

  router.delete('/:id', (c) => {
    mcpProfileService.delete(c.req.param('id'));
    return c.json({ ok: true });
  });

  return router;
}
```

Create `src/api/routes/tasks.ts`:

```typescript
import { Hono } from 'hono';
import { TaskService } from '../../services/task.service';
import { CreateTaskSchema } from '../schemas/task.schema';
import { TaskNotFoundError } from '../../shared/errors';

export function taskRoutes(taskService: TaskService) {
  const router = new Hono();

  router.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const { id } = await taskService.createTask(parsed.data);
    const task = taskService.getTask(id);
    return c.json(task, 202);
  });

  router.get('/', (c) => {
    const status = c.req.query('status') as any;
    return c.json(taskService.listTasks(status ? { status } : undefined));
  });

  router.get('/:id', (c) => {
    try {
      const task = taskService.getTask(c.req.param('id'));
      return c.json(task);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return c.json({ error: { code: err.code, message: err.message } }, 404);
      }
      throw err;
    }
  });

  router.delete('/:id', async (c) => {
    try {
      await taskService.cancelTask(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return c.json({ error: { code: err.code, message: err.message } }, 404);
      }
      throw err;
    }
  });

  return router;
}
```

**Step 4: Write server.ts (Hono app factory)**

Create `src/server.ts`:

```typescript
import { Hono } from 'hono';
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
}

export function createApp(opts: AppOptions) {
  const app = new Hono();

  // Stores
  const taskStore = new TaskStore(opts.db);
  const mcpProfileStore = new McpProfileStore(opts.db);

  // Infrastructure
  const scheduler = new Scheduler({ maxConcurrency: opts.maxConcurrency });
  const workspaceManager = new WorkspaceManager(opts.workspacesDir);

  // Services
  const taskService = new TaskService({
    taskStore,
    scheduler,
    workspaceManager,
    mcpProfileStore,
    defaultMode: opts.defaultMode,
    defaultTimeout: opts.defaultTimeout,
  });
  const mcpProfileService = new McpProfileService(mcpProfileStore);
  const healthService = new HealthService(scheduler);

  // Routes
  app.route('/tasks', taskRoutes(taskService));
  app.route('/mcp-profiles', mcpProfileRoutes(mcpProfileService));
  app.route('/health', healthRoutes(healthService));

  return app;
}
```

**Step 5: Run integration test**

Run: `npx vitest run tests/integration/api.test.ts`
Expected: All 5 tests PASS

**Step 6: Commit**

```bash
git add src/api/routes/ src/server.ts tests/integration/
git commit -m "feat: add Hono API routes and server factory"
```

---

### Task 12: Entry Point & Server Startup

**Files:**
- Modify: `src/index.ts`

**Step 1: Write entry point**

Update `src/index.ts`:

```typescript
import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';
import { createApp } from './server';
import { getConfig } from './config';
import { initializeDatabase } from './storage/database';
import { createLogger } from './api/middleware/logger';

const config = getConfig();
const logger = createLogger(config.logLevel);

// Ensure data directories exist
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.workspacesDir, { recursive: true });

// Initialize database
const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
initializeDatabase(sqlite);
const db = drizzle(sqlite);

// Create app
const app = createApp({
  db,
  workspacesDir: config.workspacesDir,
  maxConcurrency: config.maxConcurrency,
  defaultMode: config.defaultMode,
  defaultTimeout: config.defaultTimeout,
  logLevel: config.logLevel,
});

// Start server
serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
}, (info) => {
  logger.info(`claude-swarm listening on http://${config.host}:${info.port}`);
});
```

**Step 2: Verify server starts**

Run: `npx tsx src/index.ts`
Expected: Logs "claude-swarm listening on http://0.0.0.0:3000"
Stop with Ctrl+C.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add server entry point with startup initialization"
```

---

### Task 13: Container Executor

**Files:**
- Create: `src/executors/container.executor.ts`
- Create: `docker/runner/Dockerfile`
- Create: `docker/runner/entrypoint.sh`
- Test: `tests/unit/executors/container.executor.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/executors/container.executor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerExecutor } from '../../../src/executors/container.executor';

// Mock dockerode
vi.mock('dockerode', () => {
  const mockContainer = {
    start: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
    logs: vi.fn().mockResolvedValue(Buffer.from('task completed')),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: vi.fn().mockImplementation(() => ({
      createContainer: vi.fn().mockResolvedValue(mockContainer),
      pull: vi.fn((image: string, cb: (err: any, stream: any) => void) => {
        cb(null, { on: vi.fn((event: string, handler: () => void) => { if (event === 'end') handler(); }), pipe: vi.fn() });
      }),
    })),
  };
});

describe('ContainerExecutor', () => {
  let executor: ContainerExecutor;

  beforeEach(() => {
    executor = new ContainerExecutor();
  });

  it('creates and runs a container', async () => {
    const result = await executor.execute({
      taskId: 'task-1',
      prompt: 'Hello',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
    });
    expect(result.success).toBe(true);
  });

  it('returns error when container exits non-zero', async () => {
    const Docker = (await import('dockerode')).default;
    const instance = new Docker();
    const mockContainer = {
      start: vi.fn().mockResolvedValue(undefined),
      wait: vi.fn().mockResolvedValue({ StatusCode: 1 }),
      logs: vi.fn().mockResolvedValue(Buffer.from('error occurred')),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    (instance.createContainer as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockContainer);

    const failExecutor = new ContainerExecutor();
    (failExecutor as any).docker = instance;

    const result = await failExecutor.execute({
      taskId: 'task-2',
      prompt: 'fail',
      apiKey: 'sk-test',
      workspacePath: '/tmp/workspace',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONTAINER_ERROR');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/executors/container.executor.test.ts`
Expected: FAIL

**Step 3: Write ContainerExecutor**

Create `src/executors/container.executor.ts`:

```typescript
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
      if (params.schema) {
        env.push(`TASK_SCHEMA=${JSON.stringify(params.schema)}`);
      }
      if (params.model) {
        env.push(`CLAUDE_MODEL=${params.model}`);
      }
      if (params.timeout) {
        env.push(`TASK_TIMEOUT=${params.timeout}`);
      }

      const container = await this.docker.createContainer({
        Image: RUNNER_IMAGE,
        Env: env,
        HostConfig: {
          Binds: [`${params.workspacePath}:/workspace`],
        },
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
          success: false,
          logs,
          artifacts: [],
          duration: Date.now() - start,
          error: { code: 'CONTAINER_ERROR', message: `Container exited with code ${StatusCode}` },
        };
      }

      // Read result from workspace
      let data: unknown;
      let valid = false;
      try {
        const resultPath = path.join(params.workspacePath, 'result.json');
        const resultStr = await fs.readFile(resultPath, 'utf-8');
        data = JSON.parse(resultStr);
        valid = true;
      } catch {
        // No result file - use logs as output
        data = { output: logs };
      }

      return {
        success: true,
        data,
        valid,
        logs,
        artifacts: [],
        duration: Date.now() - start,
      };
    } catch (err) {
      this.runningContainers.delete(params.taskId);
      return {
        success: false,
        logs: (err as Error).message,
        artifacts: [],
        duration: Date.now() - start,
        error: { code: 'CONTAINER_ERROR', message: (err as Error).message },
      };
    }
  }

  async cancel(taskId: string): Promise<void> {
    const container = this.runningContainers.get(taskId);
    if (container) {
      try {
        await container.stop({ t: 5 });
        await container.remove();
      } catch {
        // Container may already be stopped
      }
      this.runningContainers.delete(taskId);
    }
  }
}
```

**Step 4: Write runner Dockerfile**

Create `docker/runner/Dockerfile`:

```dockerfile
FROM node:20-slim

RUN npm install -g @anthropic-ai/claude-code

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
```

Create `docker/runner/entrypoint.sh`:

```bash
#!/bin/bash
set -e

ARGS="--print --output-format json --no-session-persistence"

if [ -n "$TASK_SCHEMA" ]; then
  ARGS="$ARGS --json-schema '$TASK_SCHEMA'"
fi

if [ -n "$CLAUDE_MODEL" ]; then
  ARGS="$ARGS --model $CLAUDE_MODEL"
fi

if [ -n "$TASK_TIMEOUT" ]; then
  TIMEOUT_FLAG="timeout ${TASK_TIMEOUT}s"
fi

RESULT=$(eval $TIMEOUT_FLAG claude $ARGS "$TASK_PROMPT" 2>/tmp/stderr.log) || {
  echo "Claude execution failed" >&2
  cat /tmp/stderr.log >&2
  exit 1
}

echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'structured_output' in data:
    json.dump(data['structured_output'], open('/workspace/result.json', 'w'))
else:
    json.dump(data, open('/workspace/result.json', 'w'))
" 2>/dev/null || echo "$RESULT" > /workspace/result.json
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/executors/container.executor.test.ts`
Expected: Both tests PASS

**Step 6: Commit**

```bash
git add src/executors/container.executor.ts docker/ tests/unit/executors/container.executor.test.ts
git commit -m "feat: add Docker container executor with runner image"
```

---

### Task 14: CLI

**Files:**
- Create: `cli/index.ts`
- Create: `cli/commands/run.ts`
- Create: `cli/commands/status.ts`
- Create: `cli/commands/list.ts`

**Step 1: Write CLI entry point**

Create `cli/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run';
import { statusCommand } from './commands/status';
import { listCommand } from './commands/list';

const program = new Command();

program
  .name('claude-swarm')
  .description('Claude-Code-as-a-Service CLI')
  .version('0.1.0');

program.addCommand(runCommand());
program.addCommand(statusCommand());
program.addCommand(listCommand());

program.parse();
```

**Step 2: Write run command**

Create `cli/commands/run.ts`:

```typescript
import { Command } from 'commander';

export function runCommand() {
  const cmd = new Command('run')
    .description('Submit a task to claude-swarm')
    .requiredOption('-p, --prompt <prompt>', 'The prompt for Claude')
    .requiredOption('-k, --api-key <key>', 'Anthropic API key')
    .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
    .option('-m, --mode <mode>', 'Execution mode (process|container)', 'process')
    .option('--schema <json>', 'JSON Schema for structured output')
    .option('--timeout <ms>', 'Timeout in milliseconds')
    .option('--wait', 'Wait for task completion and print result', false)
    .action(async (opts) => {
      const body: Record<string, unknown> = {
        prompt: opts.prompt,
        apiKey: opts.apiKey,
        mode: opts.mode,
      };
      if (opts.schema) body.schema = JSON.parse(opts.schema);
      if (opts.timeout) body.timeout = parseInt(opts.timeout, 10);

      const res = await fetch(`${opts.server}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error('Error:', err);
        process.exit(1);
      }

      const task = await res.json();
      console.log(`Task created: ${task.id}`);
      console.log(`Status: ${task.status}`);

      if (opts.wait) {
        console.log('Waiting for completion...');
        let current = task;
        while (current.status === 'queued' || current.status === 'running') {
          await new Promise((r) => setTimeout(r, 2000));
          const pollRes = await fetch(`${opts.server}/tasks/${task.id}`);
          current = await pollRes.json();
        }
        console.log(`\nFinal status: ${current.status}`);
        if (current.result) {
          console.log('Result:', JSON.stringify(current.result.data, null, 2));
        }
        if (current.error) {
          console.error('Error:', current.error);
        }
      }
    });

  return cmd;
}
```

**Step 3: Write status command**

Create `cli/commands/status.ts`:

```typescript
import { Command } from 'commander';

export function statusCommand() {
  const cmd = new Command('status')
    .description('Get task status')
    .argument('<id>', 'Task ID')
    .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
    .action(async (id, opts) => {
      const res = await fetch(`${opts.server}/tasks/${id}`);
      if (!res.ok) {
        console.error('Task not found');
        process.exit(1);
      }
      const task = await res.json();
      console.log(JSON.stringify(task, null, 2));
    });

  return cmd;
}
```

**Step 4: Write list command**

Create `cli/commands/list.ts`:

```typescript
import { Command } from 'commander';

export function listCommand() {
  const cmd = new Command('list')
    .description('List tasks')
    .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
    .option('--status <status>', 'Filter by status')
    .action(async (opts) => {
      const url = new URL(`${opts.server}/tasks`);
      if (opts.status) url.searchParams.set('status', opts.status);

      const res = await fetch(url.toString());
      const tasks = await res.json();

      if (tasks.length === 0) {
        console.log('No tasks found.');
        return;
      }

      for (const task of tasks) {
        const duration = task.duration ? ` (${task.duration}ms)` : '';
        console.log(`${task.id}  ${task.status.padEnd(10)}  ${task.prompt.slice(0, 50)}${duration}`);
      }
    });

  return cmd;
}
```

**Step 5: Add bin to package.json**

Add to `package.json`:
```json
{
  "bin": {
    "claude-swarm": "./dist/cli/index.js"
  }
}
```

**Step 6: Commit**

```bash
git add cli/ package.json
git commit -m "feat: add CLI with run, status, and list commands"
```

---

### Task 15: SDK Client

**Files:**
- Create: `sdk/index.ts`
- Create: `sdk/client.ts`
- Test: `tests/unit/sdk/client.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/sdk/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeSwarm } from '../../../sdk';

describe('ClaudeSwarm SDK', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a task', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'task-1', status: 'queued', prompt: 'hi', mode: 'process', createdAt: '2026-01-01' }),
    }) as any;

    const client = new ClaudeSwarm({ baseUrl: 'http://localhost:3000' });
    const task = await client.createTask({ prompt: 'hi', apiKey: 'sk-test' });

    expect(task.id).toBe('task-1');
    expect(task.status).toBe('queued');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/tasks',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('gets a task by ID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'task-1', status: 'completed', prompt: 'hi', mode: 'process', createdAt: '2026-01-01' }),
    }) as any;

    const client = new ClaudeSwarm({ baseUrl: 'http://localhost:3000' });
    const task = await client.getTask('task-1');
    expect(task.status).toBe('completed');
  });

  it('lists tasks', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 'task-1', status: 'queued', prompt: 'hi', mode: 'process', createdAt: '2026-01-01' }]),
    }) as any;

    const client = new ClaudeSwarm({ baseUrl: 'http://localhost:3000' });
    const tasks = await client.listTasks();
    expect(tasks).toHaveLength(1);
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: 'NOT_FOUND', message: 'not found' } }),
    }) as any;

    const client = new ClaudeSwarm({ baseUrl: 'http://localhost:3000' });
    await expect(client.getTask('bad-id')).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sdk/client.test.ts`
Expected: FAIL

**Step 3: Write SDK client**

Create `sdk/client.ts`:

```typescript
import type { TaskRecord, McpProfile } from '../src/shared/types';
import type { CreateTaskInput } from '../src/api/schemas/task.schema';
import type { CreateMcpProfileInput } from '../src/api/schemas/mcp-profile.schema';

export interface ClaudeSwarmOptions {
  baseUrl: string;
}

export class ClaudeSwarmError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: { code: string; message: string },
  ) {
    super(`${error.code}: ${error.message}`);
    this.name = 'ClaudeSwarmError';
  }
}

export class ClaudeSwarm {
  private baseUrl: string;

  constructor(opts: ClaudeSwarmOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
  }

  async createTask(input: CreateTaskInput): Promise<TaskRecord> {
    return this.post('/tasks', input);
  }

  async getTask(id: string): Promise<TaskRecord> {
    return this.get(`/tasks/${id}`);
  }

  async listTasks(filter?: { status?: string }): Promise<TaskRecord[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.set('status', filter.status);
    const qs = params.toString();
    return this.get(`/tasks${qs ? `?${qs}` : ''}`);
  }

  async cancelTask(id: string): Promise<void> {
    await this.delete(`/tasks/${id}`);
  }

  async createMcpProfile(input: CreateMcpProfileInput): Promise<McpProfile> {
    return this.post('/mcp-profiles', input);
  }

  async listMcpProfiles(): Promise<McpProfile[]> {
    return this.get('/mcp-profiles');
  }

  async deleteMcpProfile(id: string): Promise<void> {
    await this.delete(`/mcp-profiles/${id}`);
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
      const body = await res.json();
      throw new ClaudeSwarmError(res.status, body.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
    return res.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const responseBody = await res.json();
      throw new ClaudeSwarmError(res.status, responseBody.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
    return res.json();
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json();
      throw new ClaudeSwarmError(res.status, body.error || { code: 'UNKNOWN', message: 'Request failed' });
    }
  }
}
```

Create `sdk/index.ts`:

```typescript
export { ClaudeSwarm, ClaudeSwarmError } from './client';
export type { ClaudeSwarmOptions } from './client';
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/sdk/client.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add sdk/ tests/unit/sdk/
git commit -m "feat: add TypeScript SDK client"
```

---

### Task 16: Wire Container Executor into TaskService

**Files:**
- Modify: `src/services/task.service.ts`

**Step 1: Update TaskService to select executor based on mode**

In `src/services/task.service.ts`, replace the hard-coded `ProcessExecutor` with mode-based selection:

Replace the `createTask` method's executor selection section:

```typescript
// Replace this line:
const executor = new ProcessExecutor(); // TODO: select based on mode

// With:
import { ContainerExecutor } from '../executors/container.executor';

// In the createTask method:
const executor = mode === 'container'
  ? new ContainerExecutor()
  : new ProcessExecutor();
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/services/task.service.ts
git commit -m "feat: wire container executor into task service"
```

---

### Task 17: Full Integration Smoke Test

**Files:**
- Create: `tests/integration/smoke.test.ts`

**Step 1: Write smoke test**

Create `tests/integration/smoke.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { createApp } from '../../src/server';
import { initializeDatabase } from '../../src/storage/database';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Smoke Test: Full Task Lifecycle', () => {
  let app: ReturnType<typeof createApp>;
  let baseDir: string;

  beforeEach(async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-smoke-'));

    app = createApp({
      db,
      workspacesDir: baseDir,
      maxConcurrency: 2,
      defaultMode: 'process',
      defaultTimeout: 300000,
      logLevel: 'silent',
    });
  });

  it('health endpoint returns scheduler status', async () => {
    const res = await app.request('/health');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.scheduler.maxConcurrency).toBe(2);
  });

  it('MCP profile CRUD lifecycle', async () => {
    // Create
    const createRes = await app.request('/mcp-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-profile',
        servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
      }),
    });
    expect(createRes.status).toBe(201);
    const profile = await createRes.json();

    // List
    const listRes = await app.request('/mcp-profiles');
    const profiles = await listRes.json();
    expect(profiles).toHaveLength(1);

    // Get
    const getRes = await app.request(`/mcp-profiles/${profile.id}`);
    expect(getRes.status).toBe(200);

    // Delete
    const delRes = await app.request(`/mcp-profiles/${profile.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    // Verify deleted
    const afterDelRes = await app.request('/mcp-profiles');
    expect((await afterDelRes.json())).toHaveLength(0);
  });

  it('rejects invalid task creation', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '' }),
    });
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run smoke test**

Run: `npx vitest run tests/integration/smoke.test.ts`
Expected: All 3 tests PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add tests/integration/smoke.test.ts
git commit -m "test: add full integration smoke tests"
```

---

### Task 18: Docker Compose for Development

**Files:**
- Create: `docker-compose.yml`

**Step 1: Write docker-compose.yml**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  swarm:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=3000
      - MAX_CONCURRENCY=3
      - DATA_DIR=/app/data
      - LOG_LEVEL=info
    restart: unless-stopped

  runner:
    build: ./docker/runner
    profiles:
      - build-only
```

**Step 2: Create root Dockerfile for the swarm server**

Create `Dockerfile`:

```dockerfile
FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
```

**Step 3: Commit**

```bash
git add docker-compose.yml Dockerfile
git commit -m "chore: add Docker Compose and server Dockerfile"
```

---

### Task 19: Final Wiring & Run Full Suite

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 2: Build TypeScript**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 3: Test manual startup**

Run: `npx tsx src/index.ts &`
Then: `curl http://localhost:3000/health`
Expected: `{"status":"ok","scheduler":{"running":0,"queued":0,"maxConcurrency":3},...}`
Stop with: `kill %1`

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: finalize v0.1.0 project setup"
```
