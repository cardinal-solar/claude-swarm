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
