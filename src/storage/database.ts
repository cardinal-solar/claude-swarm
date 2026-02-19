import Database from 'better-sqlite3';

export function initializeDatabase(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      prompt TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'process',
      schema_json TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      result_json TEXT,
      error_json TEXT,
      duration INTEGER,
      tags_json TEXT,
      workspace_path TEXT
    );

    CREATE TABLE IF NOT EXISTS mcp_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      servers_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

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
  `);
}

export function createDatabase(dbPath: string): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  initializeDatabase(sqlite);
  return sqlite;
}
