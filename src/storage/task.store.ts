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
