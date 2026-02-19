import { KnowledgeStore } from '../storage/knowledge.store';
import { KnowledgeManager } from '../workspace/knowledge-manager';
import type { KnowledgeEntry, KnowledgeStatus } from '../shared/types';

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

interface UpdateInput {
  title?: string;
  description?: string;
  tags?: string[];
  category?: string;
  status?: KnowledgeStatus;
}

export class KnowledgeService {
  private deps: KnowledgeServiceDeps;

  constructor(deps: KnowledgeServiceDeps) {
    this.deps = deps;
  }

  /**
   * Creates a knowledge entry on both filesystem and SQLite.
   * Generates a slug from the title (lowercase, non-alphanum replaced with hyphens, truncated to 60 chars).
   * Source is always 'manual'.
   */
  async create(input: CreateInput): Promise<KnowledgeEntry> {
    const slug = this.generateSlug(input.title);
    const tags = input.tags ?? [];

    // Create on filesystem
    await this.deps.manager.createEntry({
      id: slug,
      title: input.title,
      description: input.description,
      tags,
      category: input.category,
      source: 'manual',
      promptTemplate: input.promptTemplate,
      code: input.code,
    });

    // Create in SQLite using upsert so we control the ID (slug)
    const folderPath = this.deps.manager.getEntryPath(slug);
    this.deps.store.upsert({
      id: slug,
      title: input.title,
      description: input.description,
      tags,
      category: input.category,
      source: 'manual',
      folderPath,
    });

    const entry = this.deps.store.getById(slug);
    if (!entry) {
      throw new Error(`Failed to create knowledge entry: ${slug}`);
    }
    return entry;
  }

  /**
   * Retrieves a knowledge entry by ID.
   */
  getById(id: string): KnowledgeEntry | null {
    return this.deps.store.getById(id);
  }

  /**
   * Lists knowledge entries with optional filtering.
   */
  list(filter?: { status?: KnowledgeStatus; category?: string; tag?: string; sortBy?: 'rating' | 'date' | 'title' }): KnowledgeEntry[] {
    return this.deps.store.list(filter);
  }

  /**
   * Builds context string for prompt injection from active knowledge entries.
   * Entries sorted by rating desc, limited to maxContext.
   * Returns empty string if no entries exist.
   */
  async buildContext(prompt: string): Promise<string> {
    const entries = this.deps.store.list({ status: 'active', sortBy: 'rating' });
    const limited = entries.slice(0, this.deps.maxContext);

    if (limited.length === 0) {
      return '';
    }

    const lines: string[] = ['Available knowledge entries (use if relevant):'];
    for (let i = 0; i < limited.length; i++) {
      const entry = limited[i];
      const ratingStr = entry.avgRating > 0 ? ` (★${entry.avgRating})` : '';
      lines.push(`${i + 1}. [${entry.id}]${ratingStr} - ${entry.description}`);
      lines.push(`   Folder: ${entry.folderPath}`);
    }

    return lines.join('\n');
  }

  /**
   * Rates a knowledge entry.
   * Calculates running average: newAvg = ((oldAvg * oldCount) + score) / (oldCount + 1)
   * Rounds to 1 decimal place.
   * Updates both SQLite store and skill.yaml on filesystem.
   */
  async rate(id: string, score: number): Promise<{ average: number; count: number }> {
    const entry = this.deps.store.getById(id);
    if (!entry) {
      throw new Error(`Knowledge entry not found: ${id}`);
    }

    const oldAvg = entry.avgRating;
    const oldCount = entry.voteCount;
    const newCount = oldCount + 1;
    const newAvg = Math.round(((oldAvg * oldCount + score) / newCount) * 10) / 10;

    // Update SQLite
    this.deps.store.updateRating(id, newAvg, newCount);

    // Update skill.yaml
    try {
      await this.deps.manager.updateSkillYaml(id, {
        rating: {
          average: newAvg,
          count: newCount,
          votes: [], // We don't track individual votes in the yaml for simplicity
        },
      });
    } catch {
      // Filesystem update is best-effort; SQLite is source of truth
    }

    return { average: newAvg, count: newCount };
  }

  /**
   * Learns knowledge from a task workspace.
   * Extracts .knowledge/ from workspace, upserts into store with source='auto'.
   */
  async learnFromWorkspace(workspacePath: string, originTaskId: string): Promise<KnowledgeEntry | null> {
    const scanned = await this.deps.manager.extractFromWorkspace(workspacePath);
    if (!scanned) {
      return null;
    }

    // Upsert into store
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

  /**
   * Syncs filesystem entries to SQLite.
   * Scans disk entries, compares with store, adds missing, removes orphaned DB entries.
   */
  async syncFromFilesystem(): Promise<{ synced: number; added: number; removed: number }> {
    const diskEntries = await this.deps.manager.scanEntries();
    const dbEntries = this.deps.store.list();

    const diskIds = new Set(diskEntries.map((e) => e.id));
    const dbIds = new Set(dbEntries.map((e) => e.id));

    let added = 0;
    let removed = 0;

    // Add entries that exist on disk but not in DB
    for (const diskEntry of diskEntries) {
      if (!dbIds.has(diskEntry.id)) {
        this.deps.store.upsert({
          id: diskEntry.id,
          title: diskEntry.title,
          description: diskEntry.description,
          tags: diskEntry.tags,
          category: diskEntry.category,
          source: diskEntry.source as 'auto' | 'manual',
          originTaskId: diskEntry.originTaskId,
          folderPath: diskEntry.folderPath,
        });
        added++;
      }
    }

    // Remove DB entries whose folders no longer exist on disk
    for (const dbEntry of dbEntries) {
      if (!diskIds.has(dbEntry.id)) {
        this.deps.store.delete(dbEntry.id);
        removed++;
      }
    }

    return {
      synced: diskEntries.length,
      added,
      removed,
    };
  }

  /**
   * Updates a knowledge entry in both store and filesystem.
   */
  async update(id: string, updates: UpdateInput): Promise<KnowledgeEntry | null> {
    const existing = this.deps.store.getById(id);
    if (!existing) {
      return null;
    }

    // Update status if provided
    if (updates.status) {
      this.deps.store.updateStatus(id, updates.status);
    }

    // For other fields, use upsert to update
    if (updates.title || updates.description || updates.tags || updates.category !== undefined) {
      this.deps.store.upsert({
        id,
        title: updates.title ?? existing.title,
        description: updates.description ?? existing.description,
        tags: updates.tags ?? existing.tags,
        category: updates.category ?? existing.category,
        source: existing.source,
        originTaskId: existing.originTaskId,
        folderPath: existing.folderPath,
      });
    }

    // Update skill.yaml on filesystem
    try {
      const yamlUpdates: Record<string, unknown> = {};
      if (updates.title) yamlUpdates.title = updates.title;
      if (updates.description) yamlUpdates.description = updates.description;
      if (updates.tags) yamlUpdates.tags = updates.tags;
      if (updates.category !== undefined) yamlUpdates.category = updates.category;
      if (updates.status) yamlUpdates.status = updates.status;

      if (Object.keys(yamlUpdates).length > 0) {
        await this.deps.manager.updateSkillYaml(id, yamlUpdates as any);
      }
    } catch {
      // Filesystem update is best-effort
    }

    return this.deps.store.getById(id);
  }

  /**
   * Deletes a knowledge entry from both store and filesystem.
   */
  async deleteEntry(id: string): Promise<void> {
    this.deps.store.delete(id);
    await this.deps.manager.deleteEntry(id);
  }

  /**
   * Lists artifacts for a knowledge entry (all files except skill.yaml).
   */
  async listArtifacts(id: string): Promise<{ name: string; path: string; size: number }[]> {
    return this.deps.manager.listArtifacts(id);
  }

  /**
   * Generates a URL-safe slug from a title.
   * Lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens,
   * trim leading/trailing hyphens, truncate to 60 chars.
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }
}
