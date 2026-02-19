# Knowledge Database Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an experience/knowledge database that stores reusable task patterns (prompts, code, artifacts), integrates with task execution for lookup and auto-learning, and provides a dashboard UI for browsing, rating, and creating entries.

**Architecture:** Filesystem-based entries (each a folder with skill.yaml + prompt.md + code/ + artifacts/) indexed in SQLite for fast queries. Knowledge context is injected into task prompts for LLM-driven matching. After successful tasks, Claude writes a `.knowledge/` directory that the server promotes to the knowledge store.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, better-sqlite3, js-yaml, Zod v4, vitest, React, Tailwind CSS

---

### Task 1: Add js-yaml dependency

**Files:**
- Modify: `package.json`

**Step 1: Install js-yaml**

Run: `npm install js-yaml && npm install -D @types/js-yaml`

**Step 2: Verify installation**

Run: `node -e "require('js-yaml'); console.log('ok')"`
Expected: `ok`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add js-yaml dependency for knowledge entries"
```

---

### Task 2: Add knowledge_entries table to SQLite schema

**Files:**
- Modify: `src/storage/schema.ts`
- Modify: `src/storage/database.ts`
- Create: `src/shared/types.ts` (append KnowledgeEntry type)
- Test: `tests/unit/storage/knowledge.store.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/storage/knowledge.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { KnowledgeStore } from '../../../src/storage/knowledge.store';
import { initializeDatabase } from '../../../src/storage/database';

describe('KnowledgeStore', () => {
  let store: KnowledgeStore;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    store = new KnowledgeStore(db);
  });

  it('creates and retrieves a knowledge entry', () => {
    const id = store.create({
      id: 'excel-report',
      title: 'Excel Report Generator',
      description: 'Generates Excel reports from CSV',
      tags: ['excel', 'report'],
      category: 'document-generation',
      source: 'manual',
      folderPath: '/data/knowledge/excel-report',
    });
    const entry = store.getById(id);
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Excel Report Generator');
    expect(entry!.tags).toEqual(['excel', 'report']);
    expect(entry!.avgRating).toBe(0);
    expect(entry!.voteCount).toBe(0);
    expect(entry!.status).toBe('active');
  });

  it('lists entries sorted by rating', () => {
    store.create({
      id: 'low-rated',
      title: 'Low',
      description: 'Low rated',
      tags: [],
      source: 'auto',
      folderPath: '/data/knowledge/low-rated',
    });
    store.create({
      id: 'high-rated',
      title: 'High',
      description: 'High rated',
      tags: [],
      source: 'auto',
      folderPath: '/data/knowledge/high-rated',
    });
    store.updateRating('high-rated', 4.5, 3);
    store.updateRating('low-rated', 2.0, 1);

    const entries = store.list({ sort: 'rating' });
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('high-rated');
    expect(entries[1].id).toBe('low-rated');
  });

  it('filters by status', () => {
    store.create({ id: 'a', title: 'A', description: 'A', tags: [], source: 'auto', folderPath: '/a' });
    store.create({ id: 'b', title: 'B', description: 'B', tags: [], source: 'auto', folderPath: '/b' });
    store.updateStatus('b', 'deprecated');

    const active = store.list({ status: 'active' });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('a');
  });

  it('filters by tag', () => {
    store.create({ id: 'a', title: 'A', description: 'A', tags: ['excel', 'report'], source: 'auto', folderPath: '/a' });
    store.create({ id: 'b', title: 'B', description: 'B', tags: ['word'], source: 'auto', folderPath: '/b' });

    const entries = store.list({ tag: 'excel' });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('a');
  });

  it('updates rating', () => {
    store.create({ id: 'x', title: 'X', description: 'X', tags: [], source: 'auto', folderPath: '/x' });
    store.updateRating('x', 4.0, 2);
    const entry = store.getById('x');
    expect(entry!.avgRating).toBe(4.0);
    expect(entry!.voteCount).toBe(2);
  });

  it('deletes an entry', () => {
    store.create({ id: 'del', title: 'Del', description: 'Del', tags: [], source: 'auto', folderPath: '/del' });
    store.delete('del');
    expect(store.getById('del')).toBeNull();
  });

  it('returns null for non-existent entry', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });

  it('upserts an entry', () => {
    store.create({ id: 'up', title: 'V1', description: 'V1', tags: [], source: 'auto', folderPath: '/up' });
    store.upsert({ id: 'up', title: 'V2', description: 'V2', tags: ['new'], source: 'auto', folderPath: '/up' });
    const entry = store.getById('up');
    expect(entry!.title).toBe('V2');
    expect(entry!.tags).toEqual(['new']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/storage/knowledge.store.test.ts`
Expected: FAIL (module not found)

**Step 3: Add knowledge_entries to schema**

Add to `src/storage/schema.ts`:

```typescript
export const knowledgeEntries = sqliteTable('knowledge_entries', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  tagsJson: text('tags_json'),
  category: text('category'),
  status: text('status').notNull().default('active'),
  avgRating: integer('avg_rating').notNull().default(0),
  voteCount: integer('vote_count').notNull().default(0),
  source: text('source').notNull().default('auto'),
  originTaskId: text('origin_task_id'),
  folderPath: text('folder_path').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

Add the CREATE TABLE to `src/storage/database.ts` inside `initializeDatabase`:

```sql
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  avg_rating INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'auto',
  origin_task_id TEXT,
  folder_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_entries(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_rating ON knowledge_entries(avg_rating);
```

**Step 4: Add KnowledgeEntry type to `src/shared/types.ts`**

Append:

```typescript
export type KnowledgeStatus = 'active' | 'draft' | 'deprecated';
export type KnowledgeSource = 'auto' | 'manual';

export interface KnowledgeEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  status: KnowledgeStatus;
  avgRating: number;
  voteCount: number;
  source: KnowledgeSource;
  originTaskId?: string;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 5: Create `src/storage/knowledge.store.ts`**

```typescript
import { eq, desc, like } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { knowledgeEntries } from './schema';
import type { KnowledgeEntry, KnowledgeStatus } from '../shared/types';

interface CreateParams {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  source: string;
  originTaskId?: string;
  folderPath: string;
}

interface ListFilter {
  status?: string;
  category?: string;
  tag?: string;
  sort?: 'rating' | 'date' | 'title';
  limit?: number;
  offset?: number;
}

export class KnowledgeStore {
  constructor(private db: BetterSQLite3Database) {}

  create(params: CreateParams): string {
    const now = new Date().toISOString();
    this.db.insert(knowledgeEntries).values({
      id: params.id,
      title: params.title,
      description: params.description,
      tagsJson: JSON.stringify(params.tags),
      category: params.category ?? null,
      source: params.source,
      originTaskId: params.originTaskId ?? null,
      folderPath: params.folderPath,
      createdAt: now,
      updatedAt: now,
    }).run();
    return params.id;
  }

  upsert(params: CreateParams): void {
    const existing = this.getById(params.id);
    if (existing) {
      this.db.update(knowledgeEntries).set({
        title: params.title,
        description: params.description,
        tagsJson: JSON.stringify(params.tags),
        category: params.category ?? null,
        source: params.source,
        originTaskId: params.originTaskId ?? null,
        folderPath: params.folderPath,
        updatedAt: new Date().toISOString(),
      }).where(eq(knowledgeEntries.id, params.id)).run();
    } else {
      this.create(params);
    }
  }

  getById(id: string): KnowledgeEntry | null {
    const rows = this.db.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).all();
    if (rows.length === 0) return null;
    return this.toEntry(rows[0]);
  }

  list(filter: ListFilter = {}): KnowledgeEntry[] {
    let query = this.db.select().from(knowledgeEntries);

    if (filter.status) {
      query = query.where(eq(knowledgeEntries.status, filter.status)) as typeof query;
    }

    if (filter.category) {
      query = query.where(eq(knowledgeEntries.category, filter.category)) as typeof query;
    }

    // Tag filtering uses LIKE on JSON array — simple but effective for small datasets
    if (filter.tag) {
      query = query.where(like(knowledgeEntries.tagsJson, `%"${filter.tag}"%`)) as typeof query;
    }

    if (filter.sort === 'rating') {
      query = query.orderBy(desc(knowledgeEntries.avgRating)) as typeof query;
    } else if (filter.sort === 'title') {
      query = query.orderBy(knowledgeEntries.title) as typeof query;
    } else {
      query = query.orderBy(desc(knowledgeEntries.createdAt)) as typeof query;
    }

    const rows = query.all();
    return rows.map((row) => this.toEntry(row));
  }

  updateRating(id: string, avgRating: number, voteCount: number): void {
    this.db.update(knowledgeEntries).set({
      avgRating,
      voteCount,
      updatedAt: new Date().toISOString(),
    }).where(eq(knowledgeEntries.id, id)).run();
  }

  updateStatus(id: string, status: KnowledgeStatus): void {
    this.db.update(knowledgeEntries).set({
      status,
      updatedAt: new Date().toISOString(),
    }).where(eq(knowledgeEntries.id, id)).run();
  }

  delete(id: string): void {
    this.db.delete(knowledgeEntries).where(eq(knowledgeEntries.id, id)).run();
  }

  private toEntry(row: typeof knowledgeEntries.$inferSelect): KnowledgeEntry {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      tags: row.tagsJson ? JSON.parse(row.tagsJson) : [],
      category: row.category ?? undefined,
      status: row.status as KnowledgeEntry['status'],
      avgRating: row.avgRating ?? 0,
      voteCount: row.voteCount ?? 0,
      source: row.source as KnowledgeEntry['source'],
      originTaskId: row.originTaskId ?? undefined,
      folderPath: row.folderPath,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
```

**Step 6: Run tests**

Run: `npx vitest run tests/unit/storage/knowledge.store.test.ts`
Expected: All 8 tests PASS

**Step 7: Commit**

```bash
git add src/storage/schema.ts src/storage/database.ts src/storage/knowledge.store.ts src/shared/types.ts tests/unit/storage/knowledge.store.test.ts
git commit -m "feat: add knowledge_entries SQLite table and KnowledgeStore"
```

---

### Task 3: Create KnowledgeManager (filesystem operations)

**Files:**
- Create: `src/workspace/knowledge-manager.ts`
- Test: `tests/unit/workspace/knowledge-manager.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/workspace/knowledge-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { KnowledgeManager } from '../../../src/workspace/knowledge-manager';

describe('KnowledgeManager', () => {
  let manager: KnowledgeManager;
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-test-'));
    manager = new KnowledgeManager(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('creates a knowledge entry from data', async () => {
    await manager.createEntry({
      id: 'test-entry',
      title: 'Test Entry',
      description: 'A test knowledge entry',
      tags: ['test'],
      category: 'testing',
      source: 'manual',
      promptTemplate: '# Test prompt\nDo the thing.',
    });

    const skillYaml = await fs.readFile(path.join(baseDir, 'test-entry', 'skill.yaml'), 'utf-8');
    expect(skillYaml).toContain('title: Test Entry');
    expect(skillYaml).toContain('test');

    const promptMd = await fs.readFile(path.join(baseDir, 'test-entry', 'prompt.md'), 'utf-8');
    expect(promptMd).toContain('Do the thing');
  });

  it('extracts knowledge from a workspace .knowledge/ directory', async () => {
    // Simulate a workspace with .knowledge/ created by Claude
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-'));
    const knowledgeDir = path.join(workspacePath, '.knowledge');
    await fs.mkdir(knowledgeDir, { recursive: true });
    await fs.mkdir(path.join(knowledgeDir, 'code'), { recursive: true });

    await fs.writeFile(path.join(knowledgeDir, 'skill.yaml'), [
      'id: auto-generated',
      'title: Auto Generated Entry',
      'description: Created by Claude',
      'tags:',
      '  - auto',
      'category: misc',
    ].join('\n'));
    await fs.writeFile(path.join(knowledgeDir, 'prompt.md'), '# Auto prompt');
    await fs.writeFile(path.join(knowledgeDir, 'code', 'script.py'), 'print("hello")');

    const result = await manager.extractFromWorkspace(workspacePath);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('auto-generated');
    expect(result!.title).toBe('Auto Generated Entry');

    // Check that files were copied to the knowledge store
    const copied = await fs.readFile(path.join(baseDir, 'auto-generated', 'prompt.md'), 'utf-8');
    expect(copied).toBe('# Auto prompt');

    const code = await fs.readFile(path.join(baseDir, 'auto-generated', 'code', 'script.py'), 'utf-8');
    expect(code).toBe('print("hello")');

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('returns null when workspace has no .knowledge/ directory', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-'));
    const result = await manager.extractFromWorkspace(workspacePath);
    expect(result).toBeNull();
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('lists all entries on disk', async () => {
    await manager.createEntry({
      id: 'entry-a', title: 'A', description: 'A', tags: [], source: 'manual',
      promptTemplate: 'prompt a',
    });
    await manager.createEntry({
      id: 'entry-b', title: 'B', description: 'B', tags: [], source: 'manual',
      promptTemplate: 'prompt b',
    });
    const entries = await manager.scanEntries();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.id).sort()).toEqual(['entry-a', 'entry-b']);
  });

  it('deletes an entry folder', async () => {
    await manager.createEntry({
      id: 'to-delete', title: 'Del', description: 'Del', tags: [], source: 'manual',
      promptTemplate: 'x',
    });
    await manager.deleteEntry('to-delete');
    const entries = await manager.scanEntries();
    expect(entries).toHaveLength(0);
  });

  it('lists artifacts for an entry', async () => {
    await manager.createEntry({
      id: 'with-artifacts', title: 'Art', description: 'Art', tags: [], source: 'manual',
      promptTemplate: 'x',
    });
    const artifactsDir = path.join(baseDir, 'with-artifacts', 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });
    await fs.writeFile(path.join(artifactsDir, 'template.xlsx'), 'binary-content');

    const artifacts = await manager.listArtifacts('with-artifacts');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].name).toBe('template.xlsx');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/workspace/knowledge-manager.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement KnowledgeManager**

Create `src/workspace/knowledge-manager.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'js-yaml';

interface SkillYaml {
  id: string;
  title: string;
  description: string;
  tags?: string[];
  category?: string;
  source?: string;
  rating?: { average: number; count: number; votes: Array<{ score: number; timestamp: string }> };
  origin_task_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface CreateEntryInput {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  source: string;
  originTaskId?: string;
  promptTemplate: string;
  code?: Record<string, string>;
}

export interface ScannedEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  source: string;
  originTaskId?: string;
  avgRating: number;
  voteCount: number;
  folderPath: string;
  createdAt: string;
  updatedAt: string;
}

export class KnowledgeManager {
  constructor(private baseDir: string) {}

  async createEntry(input: CreateEntryInput): Promise<string> {
    const entryDir = path.join(this.baseDir, input.id);
    await fs.mkdir(entryDir, { recursive: true });

    const now = new Date().toISOString();
    const skillData: SkillYaml = {
      id: input.id,
      title: input.title,
      description: input.description,
      tags: input.tags,
      category: input.category,
      source: input.source,
      origin_task_id: input.originTaskId,
      rating: { average: 0, count: 0, votes: [] },
      created_at: now,
      updated_at: now,
    };

    await fs.writeFile(path.join(entryDir, 'skill.yaml'), yaml.dump(skillData));
    await fs.writeFile(path.join(entryDir, 'prompt.md'), input.promptTemplate);

    if (input.code) {
      const codeDir = path.join(entryDir, 'code');
      await fs.mkdir(codeDir, { recursive: true });
      for (const [filename, content] of Object.entries(input.code)) {
        await fs.writeFile(path.join(codeDir, filename), content);
      }
    }

    return input.id;
  }

  async extractFromWorkspace(workspacePath: string): Promise<ScannedEntry | null> {
    const knowledgeDir = path.join(workspacePath, '.knowledge');
    try {
      await fs.access(knowledgeDir);
    } catch {
      return null;
    }

    const skillYamlPath = path.join(knowledgeDir, 'skill.yaml');
    try {
      await fs.access(skillYamlPath);
    } catch {
      return null;
    }

    const skillContent = await fs.readFile(skillYamlPath, 'utf-8');
    const skill = yaml.load(skillContent) as SkillYaml;

    if (!skill.id || !skill.title) return null;

    const entryDir = path.join(this.baseDir, skill.id);
    await this.copyDir(knowledgeDir, entryDir);

    return {
      id: skill.id,
      title: skill.title,
      description: skill.description || '',
      tags: skill.tags || [],
      category: skill.category,
      source: 'auto',
      originTaskId: skill.origin_task_id,
      avgRating: skill.rating?.average ?? 0,
      voteCount: skill.rating?.count ?? 0,
      folderPath: entryDir,
      createdAt: skill.created_at || new Date().toISOString(),
      updatedAt: skill.updated_at || new Date().toISOString(),
    };
  }

  async scanEntries(): Promise<ScannedEntry[]> {
    const entries: ScannedEntry[] = [];
    let dirs: string[];
    try {
      dirs = await fs.readdir(this.baseDir);
    } catch {
      return [];
    }

    for (const dir of dirs) {
      const skillPath = path.join(this.baseDir, dir, 'skill.yaml');
      try {
        const content = await fs.readFile(skillPath, 'utf-8');
        const skill = yaml.load(content) as SkillYaml;
        if (!skill.id) continue;
        entries.push({
          id: skill.id,
          title: skill.title || dir,
          description: skill.description || '',
          tags: skill.tags || [],
          category: skill.category,
          source: skill.source || 'manual',
          originTaskId: skill.origin_task_id,
          avgRating: skill.rating?.average ?? 0,
          voteCount: skill.rating?.count ?? 0,
          folderPath: path.join(this.baseDir, dir),
          createdAt: skill.created_at || new Date().toISOString(),
          updatedAt: skill.updated_at || new Date().toISOString(),
        });
      } catch {
        // Skip invalid entries
      }
    }
    return entries;
  }

  async deleteEntry(id: string): Promise<void> {
    const entryDir = path.join(this.baseDir, id);
    await fs.rm(entryDir, { recursive: true, force: true });
  }

  async listArtifacts(id: string): Promise<{ name: string; path: string; size: number }[]> {
    const artifactsDir = path.join(this.baseDir, id, 'artifacts');
    const results: { name: string; path: string; size: number }[] = [];
    try {
      const files = await fs.readdir(artifactsDir);
      for (const file of files) {
        const stat = await fs.stat(path.join(artifactsDir, file));
        if (stat.isFile()) {
          results.push({ name: file, path: `artifacts/${file}`, size: stat.size });
        }
      }
    } catch {
      // No artifacts directory
    }
    return results;
  }

  async readPrompt(id: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(this.baseDir, id, 'prompt.md'), 'utf-8');
    } catch {
      return null;
    }
  }

  async updateSkillYaml(id: string, updates: Partial<SkillYaml>): Promise<void> {
    const skillPath = path.join(this.baseDir, id, 'skill.yaml');
    const content = await fs.readFile(skillPath, 'utf-8');
    const skill = yaml.load(content) as SkillYaml;
    const merged = { ...skill, ...updates, updated_at: new Date().toISOString() };
    await fs.writeFile(skillPath, yaml.dump(merged));
  }

  getEntryPath(id: string): string {
    return path.join(this.baseDir, id);
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/workspace/knowledge-manager.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/workspace/knowledge-manager.ts tests/unit/workspace/knowledge-manager.test.ts
git commit -m "feat: add KnowledgeManager for filesystem-based knowledge entries"
```

---

### Task 4: Create KnowledgeService (business logic)

**Files:**
- Create: `src/services/knowledge.service.ts`
- Test: `tests/unit/services/knowledge.service.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/services/knowledge.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { KnowledgeStore } from '../../../src/storage/knowledge.store';
import { KnowledgeManager } from '../../../src/workspace/knowledge-manager';
import { KnowledgeService } from '../../../src/services/knowledge.service';
import { initializeDatabase } from '../../../src/storage/database';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let store: KnowledgeStore;
  let manager: KnowledgeManager;
  let baseDir: string;

  beforeEach(async () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    store = new KnowledgeStore(db);
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knowledge-svc-'));
    manager = new KnowledgeManager(baseDir);
    service = new KnowledgeService({ store, manager, maxContext: 5 });
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('creates a knowledge entry (manual)', async () => {
    const entry = await service.create({
      title: 'Test Entry',
      description: 'A test',
      tags: ['test'],
      category: 'testing',
      promptTemplate: '# Do the thing',
    });
    expect(entry.id).toBeDefined();
    expect(entry.title).toBe('Test Entry');
    expect(entry.source).toBe('manual');

    // Verify filesystem
    const yamlContent = await fs.readFile(path.join(baseDir, entry.id, 'skill.yaml'), 'utf-8');
    expect(yamlContent).toContain('Test Entry');
  });

  it('builds knowledge context for prompt injection', async () => {
    await service.create({ title: 'Excel Generator', description: 'Makes Excel files from CSV', tags: ['excel'], promptTemplate: 'x' });
    await service.create({ title: 'Word Builder', description: 'Creates Word docs', tags: ['word'], promptTemplate: 'y' });

    const context = await service.buildContext('Create an excel report');
    expect(context).toContain('Excel Generator');
    expect(context).toContain('Word Builder');
    expect(context).toContain('Available knowledge entries');
  });

  it('returns empty context when no entries exist', async () => {
    const context = await service.buildContext('anything');
    expect(context).toBe('');
  });

  it('rates a knowledge entry', async () => {
    const entry = await service.create({ title: 'R', description: 'R', tags: [], promptTemplate: 'x' });
    await service.rate(entry.id, 5);
    await service.rate(entry.id, 3);

    const updated = service.getById(entry.id);
    expect(updated!.avgRating).toBe(4);
    expect(updated!.voteCount).toBe(2);
  });

  it('learns from a workspace with .knowledge/', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-'));
    const knowledgeDir = path.join(workspacePath, '.knowledge');
    await fs.mkdir(knowledgeDir, { recursive: true });
    await fs.writeFile(path.join(knowledgeDir, 'skill.yaml'), [
      'id: learned-entry',
      'title: Learned Entry',
      'description: Auto-learned from task',
      'tags:',
      '  - auto',
    ].join('\n'));
    await fs.writeFile(path.join(knowledgeDir, 'prompt.md'), '# Learned prompt');

    const result = await service.learnFromWorkspace(workspacePath, 'task-123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('learned-entry');
    expect(result!.source).toBe('auto');

    // Verify it's in the store
    const stored = service.getById('learned-entry');
    expect(stored).not.toBeNull();
    expect(stored!.originTaskId).toBe('task-123');

    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('syncs filesystem to SQLite index', async () => {
    // Create entry directly on filesystem (bypassing service)
    await manager.createEntry({
      id: 'fs-only', title: 'FS Only', description: 'Only on disk', tags: ['disk'], source: 'manual',
      promptTemplate: 'prompt',
    });

    const synced = await service.syncFromFilesystem();
    expect(synced.added).toBe(1);

    const entry = service.getById('fs-only');
    expect(entry).not.toBeNull();
    expect(entry!.title).toBe('FS Only');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/knowledge.service.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement KnowledgeService**

Create `src/services/knowledge.service.ts`:

```typescript
import { KnowledgeStore } from '../storage/knowledge.store';
import { KnowledgeManager } from '../workspace/knowledge-manager';
import type { KnowledgeEntry } from '../shared/types';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

interface KnowledgeServiceDeps {
  store: KnowledgeStore;
  manager: KnowledgeManager;
  maxContext: number;
}

interface CreateInput {
  title: string;
  description: string;
  tags?: string[];
  category?: string;
  promptTemplate: string;
  code?: Record<string, string>;
}

export class KnowledgeService {
  private deps: KnowledgeServiceDeps;

  constructor(deps: KnowledgeServiceDeps) {
    this.deps = deps;
  }

  async create(input: CreateInput): Promise<KnowledgeEntry> {
    const id = slugify(input.title);

    await this.deps.manager.createEntry({
      id,
      title: input.title,
      description: input.description,
      tags: input.tags || [],
      category: input.category,
      source: 'manual',
      promptTemplate: input.promptTemplate,
      code: input.code,
    });

    this.deps.store.create({
      id,
      title: input.title,
      description: input.description,
      tags: input.tags || [],
      category: input.category,
      source: 'manual',
      folderPath: this.deps.manager.getEntryPath(id),
    });

    return this.deps.store.getById(id)!;
  }

  getById(id: string): KnowledgeEntry | null {
    return this.deps.store.getById(id);
  }

  list(filter?: { status?: string; category?: string; tag?: string; sort?: 'rating' | 'date' | 'title' }): KnowledgeEntry[] {
    return this.deps.store.list(filter);
  }

  async buildContext(prompt: string): Promise<string> {
    const entries = this.deps.store.list({
      status: 'active',
      sort: 'rating',
      limit: this.deps.maxContext,
    });

    if (entries.length === 0) return '';

    const lines = ['Available knowledge entries (use if relevant):'];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const stars = e.avgRating > 0 ? ` (★${e.avgRating.toFixed(1)})` : '';
      lines.push(`${i + 1}. [${e.id}]${stars} - ${e.description}`);
      lines.push(`   Folder: ${e.folderPath}`);
    }
    return lines.join('\n');
  }

  async rate(id: string, score: number): Promise<{ average: number; count: number }> {
    const entry = this.deps.store.getById(id);
    if (!entry) throw new Error(`Knowledge entry not found: ${id}`);

    const newCount = entry.voteCount + 1;
    const newAvg = ((entry.avgRating * entry.voteCount) + score) / newCount;
    const roundedAvg = Math.round(newAvg * 10) / 10;

    this.deps.store.updateRating(id, roundedAvg, newCount);

    // Also update the yaml file
    await this.deps.manager.updateSkillYaml(id, {
      rating: {
        average: roundedAvg,
        count: newCount,
        votes: [], // We don't track individual votes in the index for simplicity
      },
    });

    return { average: roundedAvg, count: newCount };
  }

  async learnFromWorkspace(workspacePath: string, originTaskId: string): Promise<KnowledgeEntry | null> {
    const scanned = await this.deps.manager.extractFromWorkspace(workspacePath);
    if (!scanned) return null;

    this.deps.store.upsert({
      id: scanned.id,
      title: scanned.title,
      description: scanned.description,
      tags: scanned.tags,
      category: scanned.category,
      source: 'auto',
      originTaskId,
      folderPath: scanned.folderPath,
    });

    return this.deps.store.getById(scanned.id);
  }

  async syncFromFilesystem(): Promise<{ synced: number; added: number; removed: number }> {
    const onDisk = await this.deps.manager.scanEntries();
    const inDb = this.deps.store.list();

    const diskIds = new Set(onDisk.map((e) => e.id));
    const dbIds = new Set(inDb.map((e) => e.id));

    let added = 0;
    let removed = 0;

    // Add entries that are on disk but not in DB
    for (const entry of onDisk) {
      if (!dbIds.has(entry.id)) {
        this.deps.store.create({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          tags: entry.tags,
          category: entry.category,
          source: entry.source,
          originTaskId: entry.originTaskId,
          folderPath: entry.folderPath,
        });
        added++;
      }
    }

    // Remove entries that are in DB but not on disk
    for (const entry of inDb) {
      if (!diskIds.has(entry.id)) {
        this.deps.store.delete(entry.id);
        removed++;
      }
    }

    return { synced: onDisk.length, added, removed };
  }

  async update(id: string, updates: { title?: string; description?: string; tags?: string[]; category?: string; status?: string }): Promise<KnowledgeEntry | null> {
    const entry = this.deps.store.getById(id);
    if (!entry) return null;

    if (updates.status) {
      this.deps.store.updateStatus(id, updates.status as KnowledgeEntry['status']);
    }

    // For other fields, we'd need a store.update method — for now, upsert with merged data
    const merged = {
      id,
      title: updates.title || entry.title,
      description: updates.description || entry.description,
      tags: updates.tags || entry.tags,
      category: updates.category || entry.category,
      source: entry.source,
      originTaskId: entry.originTaskId,
      folderPath: entry.folderPath,
    };
    this.deps.store.upsert(merged);

    // Update yaml file too
    await this.deps.manager.updateSkillYaml(id, {
      title: merged.title,
      description: merged.description,
      tags: merged.tags,
      category: merged.category,
    });

    return this.deps.store.getById(id);
  }

  async deleteEntry(id: string): Promise<void> {
    this.deps.store.delete(id);
    await this.deps.manager.deleteEntry(id);
  }

  async listArtifacts(id: string): Promise<{ name: string; path: string; size: number }[]> {
    return this.deps.manager.listArtifacts(id);
  }
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/services/knowledge.service.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/services/knowledge.service.ts tests/unit/services/knowledge.service.test.ts
git commit -m "feat: add KnowledgeService with context building, rating, and auto-learning"
```

---

### Task 5: Add Zod schemas and API routes for knowledge

**Files:**
- Create: `src/api/schemas/knowledge.schema.ts`
- Create: `src/api/routes/knowledge.ts`
- Test: `tests/unit/api/knowledge-schemas.test.ts`

**Step 1: Write the failing test for schemas**

Create `tests/unit/api/knowledge-schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CreateKnowledgeSchema, RateKnowledgeSchema, UpdateKnowledgeSchema } from '../../../src/api/schemas/knowledge.schema';

describe('Knowledge Schemas', () => {
  describe('CreateKnowledgeSchema', () => {
    it('validates a valid creation request', () => {
      const result = CreateKnowledgeSchema.safeParse({
        title: 'Excel Generator',
        description: 'Generates Excel from CSV',
        tags: ['excel'],
        category: 'document-generation',
        promptTemplate: '# Create excel from data',
      });
      expect(result.success).toBe(true);
    });

    it('requires title and description', () => {
      const result = CreateKnowledgeSchema.safeParse({ promptTemplate: 'x' });
      expect(result.success).toBe(false);
    });

    it('requires promptTemplate', () => {
      const result = CreateKnowledgeSchema.safeParse({ title: 'T', description: 'D' });
      expect(result.success).toBe(false);
    });
  });

  describe('RateKnowledgeSchema', () => {
    it('validates score 1-5', () => {
      expect(RateKnowledgeSchema.safeParse({ score: 3 }).success).toBe(true);
      expect(RateKnowledgeSchema.safeParse({ score: 0 }).success).toBe(false);
      expect(RateKnowledgeSchema.safeParse({ score: 6 }).success).toBe(false);
    });
  });

  describe('UpdateKnowledgeSchema', () => {
    it('allows partial updates', () => {
      const result = UpdateKnowledgeSchema.safeParse({ title: 'New title' });
      expect(result.success).toBe(true);
    });

    it('validates status values', () => {
      expect(UpdateKnowledgeSchema.safeParse({ status: 'active' }).success).toBe(true);
      expect(UpdateKnowledgeSchema.safeParse({ status: 'invalid' }).success).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api/knowledge-schemas.test.ts`
Expected: FAIL

**Step 3: Create schemas**

Create `src/api/schemas/knowledge.schema.ts`:

```typescript
import { z } from 'zod';

export const CreateKnowledgeSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
  promptTemplate: z.string().min(1),
  code: z.record(z.string(), z.string()).optional(),
});

export type CreateKnowledgeInput = z.infer<typeof CreateKnowledgeSchema>;

export const UpdateKnowledgeSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  status: z.enum(['active', 'draft', 'deprecated']).optional(),
});

export type UpdateKnowledgeInput = z.infer<typeof UpdateKnowledgeSchema>;

export const RateKnowledgeSchema = z.object({
  score: z.number().int().min(1).max(5),
});

export type RateKnowledgeInput = z.infer<typeof RateKnowledgeSchema>;
```

**Step 4: Run schema tests**

Run: `npx vitest run tests/unit/api/knowledge-schemas.test.ts`
Expected: PASS

**Step 5: Create API routes**

Create `src/api/routes/knowledge.ts`:

```typescript
import * as path from 'path';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { KnowledgeService } from '../../services/knowledge.service';
import { CreateKnowledgeSchema, UpdateKnowledgeSchema, RateKnowledgeSchema } from '../schemas/knowledge.schema';

export function knowledgeRoutes(knowledgeService: KnowledgeService) {
  const router = new Hono();

  // List knowledge entries
  router.get('/', (c) => {
    const status = c.req.query('status');
    const category = c.req.query('category');
    const tag = c.req.query('tag');
    const sort = c.req.query('sort') as 'rating' | 'date' | 'title' | undefined;

    const entries = knowledgeService.list({ status, category, tag, sort });
    return c.json({ data: entries, total: entries.length });
  });

  // Get single entry
  router.get('/:id', async (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    return c.json(entry);
  });

  // Create entry
  router.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const entry = await knowledgeService.create(parsed.data);
    return c.json(entry, 201);
  });

  // Update entry
  router.put('/:id', async (c) => {
    const body = await c.req.json();
    const parsed = UpdateKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const entry = await knowledgeService.update(c.req.param('id'), parsed.data);
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    return c.json(entry);
  });

  // Delete entry
  router.delete('/:id', async (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    await knowledgeService.deleteEntry(c.req.param('id'));
    return c.json({ ok: true });
  });

  // Rate entry
  router.post('/:id/rate', async (c) => {
    const body = await c.req.json();
    const parsed = RateKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    try {
      const result = await knowledgeService.rate(c.req.param('id'), parsed.data.score);
      return c.json(result);
    } catch (err) {
      return c.json({ error: { code: 'NOT_FOUND', message: (err as Error).message } }, 404);
    }
  });

  // List artifacts
  router.get('/:id/artifacts', async (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    const artifacts = await knowledgeService.listArtifacts(c.req.param('id'));
    return c.json(artifacts);
  });

  // Download artifact
  router.get('/:id/artifacts/*', async (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }

    const artifactPath = c.req.path.split('/artifacts/').slice(1).join('/artifacts/');
    if (!artifactPath) {
      return c.json({ error: { code: 'MISSING_PATH', message: 'Artifact path required' } }, 400);
    }

    const fullPath = path.resolve(entry.folderPath, 'artifacts', artifactPath);
    if (!fullPath.startsWith(path.resolve(entry.folderPath))) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Path traversal not allowed' } }, 403);
    }

    try {
      const s = await stat(fullPath);
      if (!s.isFile()) {
        return c.json({ error: { code: 'NOT_FILE', message: 'Not a file' } }, 400);
      }
      const fileName = path.basename(fullPath);
      c.header('Content-Type', 'application/octet-stream');
      c.header('Content-Disposition', `attachment; filename="${fileName}"`);
      c.header('Content-Length', s.size.toString());

      return stream(c, async (str) => {
        const readable = createReadStream(fullPath);
        for await (const chunk of readable) {
          await str.write(chunk as Uint8Array);
        }
      });
    } catch {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Artifact not found' } }, 404);
    }
  });

  // Sync filesystem to DB
  router.post('/sync', async (c) => {
    const result = await knowledgeService.syncFromFilesystem();
    return c.json(result);
  });

  return router;
}
```

**Step 6: Commit**

```bash
git add src/api/schemas/knowledge.schema.ts src/api/routes/knowledge.ts tests/unit/api/knowledge-schemas.test.ts
git commit -m "feat: add knowledge API routes with Zod schemas"
```

---

### Task 6: Wire knowledge into server and config

**Files:**
- Modify: `src/config.ts`
- Modify: `src/server.ts`
- Modify: `tests/integration/api.test.ts`

**Step 1: Add config fields**

In `src/config.ts`, add to the `SwarmConfig` interface:

```typescript
knowledgeDir: string;
knowledgeMaxContext: number;
knowledgeAutoLearn: boolean;
```

And in `getConfig()` return:

```typescript
knowledgeDir: process.env.KNOWLEDGE_DIR || path.join(dataDir, 'knowledge'),
knowledgeMaxContext: parseInt(process.env.KNOWLEDGE_MAX_CONTEXT || '20', 10),
knowledgeAutoLearn: process.env.KNOWLEDGE_AUTO_LEARN !== 'false',
```

**Step 2: Wire into server.ts**

In `src/server.ts`:

1. Add imports for `KnowledgeStore`, `KnowledgeManager`, `KnowledgeService`, `knowledgeRoutes`
2. Add `knowledgeDir: string` and `knowledgeMaxContext: number` to `AppOptions`
3. Instantiate the new classes and register the route

```typescript
// After existing service instantiation:
const knowledgeStore = new KnowledgeStore(opts.db);
const knowledgeManager = new KnowledgeManager(opts.knowledgeDir);
const knowledgeService = new KnowledgeService({
  store: knowledgeStore,
  manager: knowledgeManager,
  maxContext: opts.knowledgeMaxContext,
});

// Add to the TaskService deps:
// Pass knowledgeService to TaskService (see Task 7)

// Register route:
api.route('/knowledge', knowledgeRoutes(knowledgeService));
```

**Step 3: Add integration test**

Add to `tests/integration/api.test.ts`:

```typescript
describe('Knowledge API', () => {
  it('POST /knowledge creates an entry', async () => {
    const res = await app.request('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Knowledge',
        description: 'A test entry',
        tags: ['test'],
        promptTemplate: '# Test prompt',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Test Knowledge');
    expect(body.source).toBe('manual');
  });

  it('GET /knowledge lists entries', async () => {
    await app.request('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'K1', description: 'K1', promptTemplate: 'x' }),
    });
    const res = await app.request('/api/knowledge');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /knowledge/:id/rate rates an entry', async () => {
    const createRes = await app.request('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ratable', description: 'R', promptTemplate: 'x' }),
    });
    const created = await createRes.json();

    const rateRes = await app.request(`/api/knowledge/${created.id}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 4 }),
    });
    expect(rateRes.status).toBe(200);
    const result = await rateRes.json();
    expect(result.average).toBe(4);
    expect(result.count).toBe(1);
  });

  it('DELETE /knowledge/:id deletes an entry', async () => {
    const createRes = await app.request('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Deletable', description: 'D', promptTemplate: 'x' }),
    });
    const created = await createRes.json();

    const delRes = await app.request(`/api/knowledge/${created.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    const getRes = await app.request(`/api/knowledge/${created.id}`);
    expect(getRes.status).toBe(404);
  });
});
```

Update the `createApp` call in the `beforeEach` to include the new options:

```typescript
app = createApp({
  db,
  workspacesDir: baseDir,
  knowledgeDir: path.join(baseDir, 'knowledge'),
  knowledgeMaxContext: 20,
  maxConcurrency: 2,
  defaultMode: 'process',
  defaultTimeout: 300000,
  logLevel: 'silent',
});
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/config.ts src/server.ts tests/integration/api.test.ts
git commit -m "feat: wire knowledge service into server, config, and integration tests"
```

---

### Task 7: Integrate knowledge lookup and learning into task execution

**Files:**
- Modify: `src/services/task.service.ts`
- Modify: `src/server.ts`
- Test: `tests/unit/services/task.service.test.ts` (add tests)

**Step 1: Write the failing test**

Add to `tests/unit/services/task.service.test.ts` (new describe block):

```typescript
describe('Knowledge integration', () => {
  it('injects knowledge context into the prompt', async () => {
    // This test requires verifying that the prompt passed to the executor
    // contains the knowledge context. We check this via the scheduler enqueue.
    // Setup: create a knowledge entry, then create a task and verify
    // the wrapped prompt includes knowledge context.
    // Implementation: spy on scheduler.enqueue and check params.prompt
  });

  it('learns from workspace after successful task', async () => {
    // After a task completes successfully and workspace has .knowledge/,
    // verify the knowledge service creates an entry.
    // Implementation: mock knowledgeService.learnFromWorkspace and verify it's called.
  });
});
```

Note: The actual test implementation depends on the existing `task.service.test.ts` mocking pattern. Read it to match.

**Step 2: Modify TaskService**

In `src/services/task.service.ts`:

1. Add `KnowledgeService` to `TaskServiceDeps`:

```typescript
interface TaskServiceDeps {
  taskStore: TaskStore;
  scheduler: Scheduler;
  workspaceManager: WorkspaceManager;
  mcpProfileStore?: McpProfileStore;
  knowledgeService?: KnowledgeService;
  knowledgeAutoLearn?: boolean;
  defaultMode: ExecutionMode;
  defaultTimeout: number;
}
```

2. In `createTask()`, before enqueueing, build the knowledge context:

```typescript
// Build knowledge context
let knowledgeContext = '';
if (this.deps.knowledgeService) {
  knowledgeContext = await this.deps.knowledgeService.buildContext(input.prompt);
}
```

3. Modify the wrapped prompt in the executor params to include:
- Knowledge context (if any)
- Learning instructions (if autoLearn is on)

```typescript
const knowledgeLearningInstructions = this.deps.knowledgeAutoLearn ? `

AFTER completing the task above, create a knowledge entry by saving these files in a .knowledge/ directory:
- .knowledge/skill.yaml with fields: id (slug), title, description, tags (array), category
- .knowledge/prompt.md with a reusable prompt template for this type of task
- .knowledge/README.md with a human-readable guide
Copy any reusable scripts to .knowledge/code/` : '';

const wrappedPrompt = `IMPORTANT: Your working directory is the task workspace. Save output files in the current directory.

${knowledgeContext ? knowledgeContext + '\n\n---\n' : ''}${input.prompt}${knowledgeLearningInstructions}`;
```

4. In the `onComplete` callback, after storing the result, call `learnFromWorkspace`:

```typescript
onComplete: async (taskId, result) => {
  if (result.success) {
    this.deps.taskStore.complete(taskId, { data: result.data, valid: result.valid ?? true }, result.duration);
    // Auto-learn from workspace
    if (this.deps.knowledgeService && this.deps.knowledgeAutoLearn) {
      try {
        await this.deps.knowledgeService.learnFromWorkspace(workspace.path, taskId);
      } catch (err) {
        // Don't fail the task if learning fails
      }
    }
  } else {
    this.deps.taskStore.fail(taskId, result.error || { code: 'UNKNOWN', message: 'Unknown error' }, result.duration);
  }
},
```

**Step 3: Update server.ts to pass knowledgeService to TaskService**

```typescript
const taskService = new TaskService({
  taskStore, scheduler, workspaceManager, mcpProfileStore,
  knowledgeService,
  knowledgeAutoLearn: opts.knowledgeAutoLearn ?? true,
  defaultMode: opts.defaultMode, defaultTimeout: opts.defaultTimeout,
});
```

Add `knowledgeAutoLearn?: boolean` to `AppOptions`.

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/services/task.service.ts src/server.ts tests/unit/services/task.service.test.ts
git commit -m "feat: integrate knowledge lookup and auto-learning into task execution"
```

---

### Task 8: Add knowledge to the web frontend API client

**Files:**
- Modify: `web/src/lib/api-client.ts`
- Create: `web/src/hooks/useKnowledge.ts`

**Step 1: Add KnowledgeEntry type and API methods to `web/src/lib/api-client.ts`**

Add the type:

```typescript
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
```

Add to the `api` object:

```typescript
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
  create: (data: { title: string; description: string; tags?: string[]; category?: string; promptTemplate: string; code?: Record<string, string> }) =>
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
```

**Step 2: Create `web/src/hooks/useKnowledge.ts`**

```typescript
import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useKnowledge(filter?: { status?: string; sort?: string }) {
  const fetcher = useCallback(() => api.knowledge.list(filter), [filter]);
  return usePolling(fetcher, 5000);
}

export function useKnowledgeEntry(id: string) {
  const fetcher = useCallback(() => api.knowledge.get(id), [id]);
  return usePolling(fetcher, 5000);
}

export function useKnowledgeArtifacts(id: string) {
  const fetcher = useCallback(() => api.knowledge.artifacts(id), [id]);
  return usePolling(fetcher, 10000);
}
```

**Step 3: Commit**

```bash
git add web/src/lib/api-client.ts web/src/hooks/useKnowledge.ts
git commit -m "feat: add knowledge API client and hooks for web frontend"
```

---

### Task 9: Build KnowledgePage and components

**Files:**
- Create: `web/src/pages/KnowledgePage.tsx`
- Create: `web/src/components/knowledge/KnowledgeTable.tsx`
- Create: `web/src/components/knowledge/RatingStars.tsx`
- Modify: `web/src/App.tsx` (add route)
- Modify: `web/src/components/layout/Sidebar.tsx` (add nav link)

**Step 1: Create RatingStars component**

Create `web/src/components/knowledge/RatingStars.tsx`:

```tsx
interface RatingStarsProps {
  rating: number;
  count: number;
  interactive?: boolean;
  onRate?: (score: number) => void;
}

export function RatingStars({ rating, count, interactive, onRate }: RatingStarsProps) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex items-center gap-1">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onRate?.(star)}
          className={`text-sm ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} ${
            star <= Math.round(rating) ? 'text-yellow-400' : 'text-gray-300'
          }`}
        >
          ★
        </button>
      ))}
      {count > 0 && (
        <span className="text-xs text-gray-400 ml-1">({rating.toFixed(1)}, {count})</span>
      )}
    </div>
  );
}
```

**Step 2: Create KnowledgeTable component**

Create `web/src/components/knowledge/KnowledgeTable.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { KnowledgeEntry } from '@/lib/api-client';
import { RatingStars } from './RatingStars';

interface KnowledgeTableProps {
  entries: KnowledgeEntry[];
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  deprecated: 'bg-gray-100 text-gray-500',
};

export function KnowledgeTable({ entries }: KnowledgeTableProps) {
  if (entries.length === 0) {
    return <div className="text-sm text-gray-500 py-8 text-center">No knowledge entries yet.</div>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link to={`/app/knowledge/${entry.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  {entry.title}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{entry.description}</p>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{entry.category || '-'}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">
                      {tag}
                    </span>
                  ))}
                  {entry.tags.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{entry.tags.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <RatingStars rating={entry.avgRating} count={entry.voteCount} />
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">{entry.source}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${statusColors[entry.status] || ''}`}>
                  {entry.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 3: Create KnowledgePage**

Create `web/src/pages/KnowledgePage.tsx`:

```tsx
import { useState } from 'react';
import { useKnowledge } from '@/hooks/useKnowledge';
import { KnowledgeTable } from '@/components/knowledge/KnowledgeTable';

const STATUSES = ['all', 'active', 'draft', 'deprecated'] as const;
const SORTS = [
  { value: 'rating', label: 'Rating' },
  { value: 'date', label: 'Newest' },
  { value: 'title', label: 'Title' },
] as const;

export function KnowledgePage() {
  const [status, setStatus] = useState<string>('all');
  const [sort, setSort] = useState<string>('rating');
  const filter = {
    status: status === 'all' ? undefined : status,
    sort,
  };
  const { data, loading, error } = useKnowledge(filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Knowledge</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  status === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
      {loading && !data ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <KnowledgeTable entries={data?.data || []} />
      )}
    </div>
  );
}
```

**Step 4: Add route and sidebar link**

In `web/src/App.tsx`, add import and route:

```tsx
import { KnowledgePage } from './pages/KnowledgePage';
import { KnowledgeDetailPage } from './pages/KnowledgeDetailPage';

// In Routes:
<Route path="/app/knowledge" element={<KnowledgePage />} />
<Route path="/app/knowledge/:id" element={<KnowledgeDetailPage />} />
```

In `web/src/components/layout/Sidebar.tsx`, add to `links` array:

```typescript
{ to: '/app/knowledge', label: 'Knowledge', icon: '*' },
```

**Step 5: Commit**

```bash
git add web/src/components/knowledge/ web/src/pages/KnowledgePage.tsx web/src/App.tsx web/src/components/layout/Sidebar.tsx
git commit -m "feat: add Knowledge list page with table, rating stars, and navigation"
```

---

### Task 10: Build KnowledgeDetailPage

**Files:**
- Create: `web/src/pages/KnowledgeDetailPage.tsx`

**Step 1: Create the detail page**

Create `web/src/pages/KnowledgeDetailPage.tsx`:

```tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useKnowledgeEntry, useKnowledgeArtifacts } from '@/hooks/useKnowledge';
import { api } from '@/lib/api-client';
import { RatingStars } from '@/components/knowledge/RatingStars';

const TABS = ['info', 'prompt', 'artifacts'] as const;
type Tab = typeof TABS[number];

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  deprecated: 'bg-gray-100 text-gray-500',
};

export function KnowledgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: entry, loading, error, refresh } = useKnowledgeEntry(id!);
  const { data: artifacts } = useKnowledgeArtifacts(id!);
  const [tab, setTab] = useState<Tab>('info');

  const handleRate = async (score: number) => {
    await api.knowledge.rate(id!, score);
    refresh();
  };

  if (loading && !entry) return <div className="text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!entry) return <div className="text-sm text-gray-500">Entry not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/app/knowledge" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</Link>
        <h2 className="text-xl font-semibold text-gray-900">{entry.title}</h2>
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${statusColors[entry.status] || ''}`}>
          {entry.status}
        </span>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">Rate this entry:</span>
        <RatingStars rating={entry.avgRating} count={entry.voteCount} interactive onRate={handleRate} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'info' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="font-mono text-gray-900">{entry.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Description</dt>
              <dd className="text-gray-900 max-w-md text-right">{entry.description}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Category</dt>
              <dd className="text-gray-900">{entry.category || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Source</dt>
              <dd className="text-gray-900">{entry.source}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Tags</dt>
              <dd className="flex gap-1 flex-wrap justify-end">
                {entry.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded">{tag}</span>
                ))}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">{new Date(entry.createdAt).toLocaleString()}</dd>
            </div>
            {entry.originTaskId && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Origin Task</dt>
                <dd>
                  <Link to={`/app/tasks/${entry.originTaskId}`} className="text-blue-600 hover:text-blue-800 text-sm">
                    {entry.originTaskId.slice(0, 8)}...
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {tab === 'prompt' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded p-4 max-h-[500px] overflow-auto">
            {/* Prompt content would be fetched from API - for now show folder path */}
            Knowledge entry folder: {entry.folderPath}
          </pre>
        </div>
      )}

      {tab === 'artifacts' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">
            Artifacts {artifacts ? `(${artifacts.length})` : ''}
          </h3>
          {artifacts && artifacts.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {artifacts.map((a) => (
                <li key={a.path} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-900">{a.name}</span>
                  <a
                    href={api.knowledge.artifactUrl(entry.id, a.path)}
                    download
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No artifacts.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify the import is already in App.tsx**

Already added in Task 9.

**Step 3: Commit**

```bash
git add web/src/pages/KnowledgeDetailPage.tsx
git commit -m "feat: add KnowledgeDetailPage with tabs for info, prompt, and artifacts"
```

---

### Task 11: Update SDK and CLI with knowledge methods

**Files:**
- Modify: `sdk/client.ts`
- Modify: `cli/index.ts` (or create `cli/commands/knowledge.ts`)

**Step 1: Add knowledge methods to SDK**

In `sdk/client.ts`, add to `ClaudeOps`:

```typescript
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

async createKnowledge(input: { title: string; description: string; tags?: string[]; promptTemplate: string }): Promise<KnowledgeEntry> {
  return this.post('/api/knowledge', input);
}

async rateKnowledge(id: string, score: number): Promise<{ average: number; count: number }> {
  return this.post(`/api/knowledge/${id}/rate`, { score });
}

async deleteKnowledge(id: string): Promise<void> {
  await this.delete(`/api/knowledge/${id}`);
}
```

Add `KnowledgeEntry` import from shared types (or re-define in SDK).

**Step 2: Add CLI knowledge commands**

Create `cli/commands/knowledge.ts` following the pattern from `cli/commands/list.ts`. Commands:
- `claude-ops knowledge list` - lists entries
- `claude-ops knowledge show <id>` - shows entry detail

**Step 3: Commit**

```bash
git add sdk/client.ts cli/commands/knowledge.ts cli/index.ts
git commit -m "feat: add knowledge methods to SDK and CLI"
```

---

### Task 12: Run full test suite and verify

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (including new knowledge tests)

**Step 2: Build TypeScript**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Build web frontend**

Run: `cd web && npm run build`
Expected: Build succeeds

**Step 4: Manual smoke test**

Run: `npx tsx src/index.ts` (start server)
Then: `curl http://localhost:3000/api/knowledge` → should return `{"data":[],"total":0}`
Then: `curl -X POST http://localhost:3000/api/knowledge -H 'Content-Type: application/json' -d '{"title":"Test","description":"Test entry","promptTemplate":"# Test"}'` → should return 201

**Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address test/build issues from knowledge DB integration"
```

---

## Summary of all tasks

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Add js-yaml dependency | package.json | - |
| 2 | Knowledge SQLite schema + KnowledgeStore | schema.ts, database.ts, types.ts, knowledge.store.ts | 8 unit tests |
| 3 | KnowledgeManager (filesystem ops) | knowledge-manager.ts | 6 unit tests |
| 4 | KnowledgeService (business logic) | knowledge.service.ts | 6 unit tests |
| 5 | Zod schemas + API routes | knowledge.schema.ts, knowledge.ts routes | 6 schema tests |
| 6 | Wire into server + config | config.ts, server.ts | 4 integration tests |
| 7 | Task execution integration | task.service.ts | 2 integration tests |
| 8 | Frontend API client + hooks | api-client.ts, useKnowledge.ts | - |
| 9 | KnowledgePage + components | KnowledgePage, KnowledgeTable, RatingStars, Sidebar | - |
| 10 | KnowledgeDetailPage | KnowledgeDetailPage.tsx | - |
| 11 | SDK + CLI methods | sdk/client.ts, cli/commands/knowledge.ts | - |
| 12 | Full test suite + build verify | - | All tests |
