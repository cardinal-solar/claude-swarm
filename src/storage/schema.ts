import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('queued'),
  prompt: text('prompt').notNull(),
  mode: text('mode').notNull().default('process'),
  schemaJson: text('schema_json'),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  resultJson: text('result_json'),
  errorJson: text('error_json'),
  duration: integer('duration'),
  tagsJson: text('tags_json'),
  workspacePath: text('workspace_path'),
});

export const mcpProfiles = sqliteTable('mcp_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  serversJson: text('servers_json').notNull(),
  createdAt: text('created_at').notNull(),
});
