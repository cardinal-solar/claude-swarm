import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import yaml from 'js-yaml';
import { KnowledgeService } from '../../../src/services/knowledge.service';
import { KnowledgeStore } from '../../../src/storage/knowledge.store';
import { KnowledgeManager } from '../../../src/workspace/knowledge-manager';
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
      title: 'Drizzle ORM Patterns',
      description: 'Best practices for Drizzle with SQLite',
      tags: ['drizzle', 'sqlite'],
      category: 'databases',
      promptTemplate: '# Drizzle ORM\nUse these patterns when working with Drizzle.',
    });

    expect(entry).toBeDefined();
    expect(entry.id).toBe('drizzle-orm-patterns');
    expect(entry.title).toBe('Drizzle ORM Patterns');
    expect(entry.description).toBe('Best practices for Drizzle with SQLite');
    expect(entry.tags).toEqual(['drizzle', 'sqlite']);
    expect(entry.category).toBe('databases');
    expect(entry.source).toBe('manual');
    expect(entry.status).toBe('active');

    // Verify filesystem has skill.yaml
    const skillYamlPath = path.join(baseDir, 'drizzle-orm-patterns', 'skill.yaml');
    const content = yaml.load(await fs.readFile(skillYamlPath, 'utf-8')) as Record<string, unknown>;
    expect(content.id).toBe('drizzle-orm-patterns');
    expect(content.title).toBe('Drizzle ORM Patterns');
  });

  it('builds knowledge context for prompt injection', async () => {
    await service.create({
      title: 'TypeScript Tips',
      description: 'Useful TypeScript patterns',
      tags: ['typescript'],
      promptTemplate: '# TS Tips',
    });

    await service.create({
      title: 'Testing Guide',
      description: 'How to write good tests',
      tags: ['testing'],
      promptTemplate: '# Testing',
    });

    const context = await service.buildContext('Write some code');

    expect(context).toContain('# Available Knowledge');
    expect(context).toContain('TypeScript Tips');
    expect(context).toContain('Testing Guide');
    expect(context).toContain('Useful TypeScript patterns');
    expect(context).toContain('How to write good tests');
    // Should inline prompt.md content
    expect(context).toContain('# TS Tips');
    expect(context).toContain('# Testing');
  });

  it('returns empty context when no entries exist', async () => {
    const context = await service.buildContext('Write some code');
    expect(context).toBe('');
  });

  it('rates a knowledge entry', async () => {
    const entry = await service.create({
      title: 'Rated Skill',
      description: 'A skill to be rated',
      tags: [],
      promptTemplate: '# Rated',
    });

    const result1 = await service.rate(entry.id, 5);
    expect(result1.average).toBe(5);
    expect(result1.count).toBe(1);

    const result2 = await service.rate(entry.id, 3);
    expect(result2.average).toBe(4);
    expect(result2.count).toBe(2);
  });

  it('learns from a workspace with .knowledge/', async () => {
    // Create a temp workspace with .knowledge/ directory
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-learn-'));
    try {
      const knowledgeDir = path.join(workspaceDir, '.knowledge');
      await fs.mkdir(knowledgeDir, { recursive: true });

      const skillYaml = {
        id: 'auto-learned',
        title: 'Auto Learned Skill',
        description: 'Skill discovered from task output',
        tags: ['auto'],
        source: 'auto',
        created_at: '2026-02-19T00:00:00.000Z',
        updated_at: '2026-02-19T00:00:00.000Z',
      };
      await fs.writeFile(path.join(knowledgeDir, 'skill.yaml'), yaml.dump(skillYaml));
      await fs.writeFile(path.join(knowledgeDir, 'prompt.md'), '# Auto learned prompt');

      const result = await service.learnFromWorkspace(workspaceDir, 'task-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('auto-learned');
      expect(result!.title).toBe('Auto Learned Skill');
      expect(result!.source).toBe('auto');
      expect(result!.originTaskId).toBe('task-123');

      // Verify it's in the store
      const stored = store.getById('auto-learned');
      expect(stored).not.toBeNull();
      expect(stored!.source).toBe('auto');
      expect(stored!.originTaskId).toBe('task-123');
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it('syncs filesystem to SQLite index', async () => {
    // Create entry directly on filesystem via manager (bypassing service)
    await manager.createEntry({
      id: 'fs-only-skill',
      title: 'Filesystem Only',
      description: 'Created on disk but not in SQLite',
      tags: ['sync'],
      source: 'manual',
      promptTemplate: '# FS Only',
    });

    // Verify it's NOT in the store yet
    expect(store.getById('fs-only-skill')).toBeNull();

    const result = await service.syncFromFilesystem();

    expect(result.added).toBeGreaterThanOrEqual(1);

    // Verify it's now in the store
    const stored = store.getById('fs-only-skill');
    expect(stored).not.toBeNull();
    expect(stored!.title).toBe('Filesystem Only');
    expect(stored!.description).toBe('Created on disk but not in SQLite');
  });
});
