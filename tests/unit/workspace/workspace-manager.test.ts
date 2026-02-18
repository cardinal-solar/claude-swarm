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
