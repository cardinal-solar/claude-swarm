import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import yaml from 'js-yaml';
import { KnowledgeManager, type ScannedEntry } from '../../../src/workspace/knowledge-manager';

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
      id: 'my-skill',
      title: 'My Skill',
      description: 'A test skill',
      tags: ['test', 'example'],
      category: 'testing',
      source: 'manual',
      promptTemplate: '# Prompt\nDo the thing.\n',
      code: {
        'helper.py': 'print("hello")',
      },
    });

    const entryDir = path.join(baseDir, 'my-skill');
    const skillYamlPath = path.join(entryDir, 'skill.yaml');
    const promptPath = path.join(entryDir, 'prompt.md');
    const codePath = path.join(entryDir, 'code', 'helper.py');

    // Verify skill.yaml exists and has correct content
    const skillContent = yaml.load(await fs.readFile(skillYamlPath, 'utf-8')) as Record<string, unknown>;
    expect(skillContent.id).toBe('my-skill');
    expect(skillContent.title).toBe('My Skill');
    expect(skillContent.description).toBe('A test skill');
    expect(skillContent.tags).toEqual(['test', 'example']);
    expect(skillContent.category).toBe('testing');
    expect(skillContent.source).toBe('manual');
    expect(skillContent.created_at).toBeDefined();
    expect(skillContent.updated_at).toBeDefined();

    // Verify prompt.md exists and has correct content
    const promptContent = await fs.readFile(promptPath, 'utf-8');
    expect(promptContent).toBe('# Prompt\nDo the thing.\n');

    // Verify code file exists
    const codeContent = await fs.readFile(codePath, 'utf-8');
    expect(codeContent).toBe('print("hello")');
  });

  it('extracts knowledge from a workspace .knowledge/ directory', async () => {
    // Create a workspace with .knowledge/ directory
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));
    try {
      const knowledgeDir = path.join(workspaceDir, '.knowledge');
      await fs.mkdir(knowledgeDir, { recursive: true });
      await fs.mkdir(path.join(knowledgeDir, 'code'), { recursive: true });

      const skillYaml = {
        id: 'extracted-skill',
        title: 'Extracted Skill',
        description: 'Skill from workspace',
        tags: ['auto'],
        source: 'task',
        created_at: '2026-02-19T00:00:00.000Z',
        updated_at: '2026-02-19T00:00:00.000Z',
      };
      await fs.writeFile(path.join(knowledgeDir, 'skill.yaml'), yaml.dump(skillYaml));
      await fs.writeFile(path.join(knowledgeDir, 'prompt.md'), '# Extracted prompt');
      await fs.writeFile(path.join(knowledgeDir, 'code', 'script.py'), 'print("extracted")');

      // Extract from workspace
      const entry = await manager.extractFromWorkspace(workspaceDir);

      expect(entry).not.toBeNull();
      expect(entry!.id).toBe('extracted-skill');
      expect(entry!.title).toBe('Extracted Skill');
      expect(entry!.description).toBe('Skill from workspace');
      expect(entry!.tags).toEqual(['auto']);
      expect(entry!.source).toBe('task');

      // Verify files were copied to knowledge store
      const storedSkillYaml = path.join(baseDir, 'extracted-skill', 'skill.yaml');
      const storedPrompt = path.join(baseDir, 'extracted-skill', 'prompt.md');
      const storedCode = path.join(baseDir, 'extracted-skill', 'code', 'script.py');

      const stat = await fs.stat(storedSkillYaml);
      expect(stat.isFile()).toBe(true);

      const promptContent = await fs.readFile(storedPrompt, 'utf-8');
      expect(promptContent).toBe('# Extracted prompt');

      const codeContent = await fs.readFile(storedCode, 'utf-8');
      expect(codeContent).toBe('print("extracted")');
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it('returns null when workspace has no .knowledge/ directory', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-empty-'));
    try {
      const entry = await manager.extractFromWorkspace(workspaceDir);
      expect(entry).toBeNull();
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it('lists all entries on disk', async () => {
    await manager.createEntry({
      id: 'skill-a',
      title: 'Skill A',
      description: 'First skill',
      tags: ['a'],
      source: 'manual',
      promptTemplate: 'Prompt A',
    });

    await manager.createEntry({
      id: 'skill-b',
      title: 'Skill B',
      description: 'Second skill',
      tags: ['b'],
      source: 'manual',
      promptTemplate: 'Prompt B',
    });

    const entries = await manager.scanEntries();
    expect(entries).toHaveLength(2);

    const ids = entries.map((e: ScannedEntry) => e.id);
    expect(ids).toContain('skill-a');
    expect(ids).toContain('skill-b');

    const entryA = entries.find((e: ScannedEntry) => e.id === 'skill-a')!;
    expect(entryA.title).toBe('Skill A');
    expect(entryA.description).toBe('First skill');
    expect(entryA.folderPath).toBe(path.join(baseDir, 'skill-a'));
  });

  it('deletes an entry folder', async () => {
    await manager.createEntry({
      id: 'to-delete',
      title: 'Delete Me',
      description: 'Will be deleted',
      tags: [],
      source: 'manual',
      promptTemplate: 'Bye',
    });

    let entries = await manager.scanEntries();
    expect(entries).toHaveLength(1);

    await manager.deleteEntry('to-delete');

    entries = await manager.scanEntries();
    expect(entries).toHaveLength(0);
  });

  it('lists artifacts for an entry', async () => {
    await manager.createEntry({
      id: 'with-artifacts',
      title: 'Artifacts Entry',
      description: 'Has artifacts',
      tags: [],
      source: 'manual',
      promptTemplate: 'Artifacts prompt',
    });

    // Manually create an artifacts directory with files
    const artifactsDir = path.join(baseDir, 'with-artifacts', 'artifacts');
    await fs.mkdir(artifactsDir, { recursive: true });
    await fs.writeFile(path.join(artifactsDir, 'template.hbs'), '<h1>{{title}}</h1>');
    await fs.writeFile(path.join(artifactsDir, 'config.json'), '{}');

    const artifacts = await manager.listArtifacts('with-artifacts');
    expect(artifacts).toHaveLength(2);
    expect(artifacts).toContain('template.hbs');
    expect(artifacts).toContain('config.json');
  });
});
