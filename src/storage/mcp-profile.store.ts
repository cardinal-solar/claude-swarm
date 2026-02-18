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
    return this.db.select().from(mcpProfiles).all().map((row) => this.toProfile(row));
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
