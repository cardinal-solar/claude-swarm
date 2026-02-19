import { eq, desc, like, asc } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeEntries } from './schema';
import type { KnowledgeEntry, KnowledgeStatus, KnowledgeSource } from '../shared/types';

interface CreateKnowledgeParams {
  title: string;
  description: string;
  tags: string[];
  category?: string;
  source?: KnowledgeSource;
  originTaskId?: string;
  folderPath: string;
}

interface UpsertKnowledgeParams extends CreateKnowledgeParams {
  id?: string;
}

interface ListKnowledgeFilter {
  status?: KnowledgeStatus;
  category?: string;
  tag?: string;
  sortBy?: 'rating' | 'date' | 'title';
}

export class KnowledgeStore {
  constructor(private db: BetterSQLite3Database) {}

  create(params: CreateKnowledgeParams): string {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.insert(knowledgeEntries).values({
      id,
      title: params.title,
      description: params.description,
      tagsJson: JSON.stringify(params.tags),
      category: params.category ?? null,
      source: params.source ?? 'auto',
      originTaskId: params.originTaskId ?? null,
      folderPath: params.folderPath,
      createdAt: now,
      updatedAt: now,
    }).run();
    return id;
  }

  upsert(params: UpsertKnowledgeParams): string {
    if (params.id) {
      const existing = this.getById(params.id);
      if (existing) {
        const now = new Date().toISOString();
        this.db.update(knowledgeEntries).set({
          title: params.title,
          description: params.description,
          tagsJson: JSON.stringify(params.tags),
          category: params.category ?? null,
          source: params.source ?? existing.source,
          originTaskId: params.originTaskId ?? existing.originTaskId ?? null,
          folderPath: params.folderPath,
          updatedAt: now,
        }).where(eq(knowledgeEntries.id, params.id)).run();
        return params.id;
      }
    }
    // No id or entry doesn't exist -- create new
    const id = params.id ?? uuidv4();
    const now = new Date().toISOString();
    this.db.insert(knowledgeEntries).values({
      id,
      title: params.title,
      description: params.description,
      tagsJson: JSON.stringify(params.tags),
      category: params.category ?? null,
      source: params.source ?? 'auto',
      originTaskId: params.originTaskId ?? null,
      folderPath: params.folderPath,
      createdAt: now,
      updatedAt: now,
    }).run();
    return id;
  }

  getById(id: string): KnowledgeEntry | null {
    const rows = this.db.select().from(knowledgeEntries).where(eq(knowledgeEntries.id, id)).all();
    if (rows.length === 0) return null;
    return this.toKnowledgeEntry(rows[0]);
  }

  list(filter: ListKnowledgeFilter = {}): KnowledgeEntry[] {
    let query = this.db.select().from(knowledgeEntries);

    if (filter.status) {
      query = query.where(eq(knowledgeEntries.status, filter.status)) as typeof query;
    }
    if (filter.category) {
      query = query.where(eq(knowledgeEntries.category, filter.category)) as typeof query;
    }
    if (filter.tag) {
      query = query.where(like(knowledgeEntries.tagsJson, `%"${filter.tag}"%`)) as typeof query;
    }

    let orderedQuery;
    switch (filter.sortBy) {
      case 'rating':
        orderedQuery = query.orderBy(desc(knowledgeEntries.avgRating));
        break;
      case 'title':
        orderedQuery = query.orderBy(asc(knowledgeEntries.title));
        break;
      case 'date':
        orderedQuery = query.orderBy(desc(knowledgeEntries.createdAt));
        break;
      default:
        orderedQuery = query;
    }

    return orderedQuery.all().map((row) => this.toKnowledgeEntry(row));
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

  private toKnowledgeEntry(row: typeof knowledgeEntries.$inferSelect): KnowledgeEntry {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      tags: row.tagsJson ? JSON.parse(row.tagsJson) : [],
      category: row.category ?? undefined,
      status: row.status as KnowledgeStatus,
      avgRating: row.avgRating,
      voteCount: row.voteCount,
      source: row.source as KnowledgeSource,
      originTaskId: row.originTaskId ?? undefined,
      folderPath: row.folderPath,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
