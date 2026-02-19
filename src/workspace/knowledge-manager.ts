import * as fs from 'fs/promises';
import * as path from 'path';
import yaml from 'js-yaml';

export interface SkillYaml {
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

export interface CreateEntryInput {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category?: string;
  source: string;
  originTaskId?: string;
  promptTemplate: string;
  code?: Record<string, string>; // filename -> content
}

export class KnowledgeManager {
  constructor(private baseDir: string) {}

  async createEntry(input: CreateEntryInput): Promise<void> {
    const entryDir = path.join(this.baseDir, input.id);
    await fs.mkdir(entryDir, { recursive: true });

    const now = new Date().toISOString();
    const skillYaml: SkillYaml = {
      id: input.id,
      title: input.title,
      description: input.description,
      tags: input.tags,
      category: input.category,
      source: input.source,
      origin_task_id: input.originTaskId,
      created_at: now,
      updated_at: now,
    };

    await fs.writeFile(
      path.join(entryDir, 'skill.yaml'),
      yaml.dump(skillYaml, { lineWidth: -1 }),
    );

    await fs.writeFile(
      path.join(entryDir, 'prompt.md'),
      input.promptTemplate,
    );

    if (input.code) {
      const codeDir = path.join(entryDir, 'code');
      await fs.mkdir(codeDir, { recursive: true });
      for (const [filename, content] of Object.entries(input.code)) {
        await fs.writeFile(path.join(codeDir, filename), content);
      }
    }
  }

  async extractFromWorkspace(workspacePath: string): Promise<ScannedEntry | null> {
    const knowledgeDir = path.join(workspacePath, '.knowledge');
    const skillYamlPath = path.join(knowledgeDir, 'skill.yaml');

    try {
      await fs.stat(knowledgeDir);
    } catch {
      return null;
    }

    try {
      const skillContent = await fs.readFile(skillYamlPath, 'utf-8');
      const skillData = yaml.load(skillContent) as SkillYaml;

      if (!skillData || !skillData.id) {
        return null;
      }

      const destDir = path.join(this.baseDir, skillData.id);
      await this.copyDir(knowledgeDir, destDir);

      return this.skillYamlToScannedEntry(skillData, destDir);
    } catch {
      return null;
    }
  }

  async scanEntries(): Promise<ScannedEntry[]> {
    const entries: ScannedEntry[] = [];

    try {
      const dirs = await fs.readdir(this.baseDir, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;

        const skillYamlPath = path.join(this.baseDir, dir.name, 'skill.yaml');
        try {
          const content = await fs.readFile(skillYamlPath, 'utf-8');
          const skillData = yaml.load(content) as SkillYaml;
          if (skillData && skillData.id) {
            const folderPath = path.join(this.baseDir, dir.name);
            entries.push(this.skillYamlToScannedEntry(skillData, folderPath));
          }
        } catch {
          // Skip entries without valid skill.yaml
        }
      }
    } catch {
      // baseDir doesn't exist; return empty array
    }

    return entries;
  }

  async deleteEntry(id: string): Promise<void> {
    const entryDir = path.join(this.baseDir, id);
    try {
      await fs.rm(entryDir, { recursive: true, force: true });
    } catch {
      // Entry may not exist; ignore
    }
  }

  async listArtifacts(id: string): Promise<string[]> {
    const artifactsDir = path.join(this.baseDir, id, 'artifacts');
    try {
      const entries = await fs.readdir(artifactsDir);
      return entries;
    } catch {
      return [];
    }
  }

  async readPrompt(id: string): Promise<string | null> {
    const promptPath = path.join(this.baseDir, id, 'prompt.md');
    try {
      return await fs.readFile(promptPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async updateSkillYaml(id: string, updates: Partial<SkillYaml>): Promise<void> {
    const skillYamlPath = path.join(this.baseDir, id, 'skill.yaml');
    const content = await fs.readFile(skillYamlPath, 'utf-8');
    const existing = yaml.load(content) as SkillYaml;

    const merged = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await fs.writeFile(skillYamlPath, yaml.dump(merged, { lineWidth: -1 }));
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

  private skillYamlToScannedEntry(skillData: SkillYaml, folderPath: string): ScannedEntry {
    return {
      id: skillData.id,
      title: skillData.title,
      description: skillData.description,
      tags: skillData.tags ?? [],
      category: skillData.category,
      source: skillData.source ?? 'unknown',
      originTaskId: skillData.origin_task_id,
      avgRating: skillData.rating?.average ?? 0,
      voteCount: skillData.rating?.count ?? 0,
      folderPath,
      createdAt: skillData.created_at ?? new Date().toISOString(),
      updatedAt: skillData.updated_at ?? new Date().toISOString(),
    };
  }
}
