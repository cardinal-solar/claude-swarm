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

export const knowledgeEntries = sqliteTable('knowledge_entries', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  tagsJson: text('tags_json'),
  category: text('category'),
  status: text('status').notNull().default('active'),
  avgRating: integer('avg_rating').notNull().default(0),
  voteCount: integer('vote_count').notNull().default(0),
  source: text('source').notNull().default('auto'),
  originTaskId: text('origin_task_id'),
  folderPath: text('folder_path').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
