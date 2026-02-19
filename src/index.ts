import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { createApp } from './server';
import { getConfig } from './config';
import { initializeDatabase } from './storage/database';
import { createLogger } from './api/middleware/logger';

const config = getConfig();
const logger = createLogger(config.logLevel);

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.workspacesDir, { recursive: true });

const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
initializeDatabase(sqlite);
const db = drizzle(sqlite);

const app = createApp({
  db,
  workspacesDir: config.workspacesDir,
  maxConcurrency: config.maxConcurrency,
  defaultMode: config.defaultMode,
  defaultTimeout: config.defaultTimeout,
  logLevel: config.logLevel,
  webDistDir: (() => {
    const webDistPath = path.join(__dirname, '..', '..', 'web', 'dist');
    return fs.existsSync(webDistPath) ? webDistPath : undefined;
  })(),
});

serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
}, (info) => {
  logger.info(`claude-ops listening on http://${config.host}:${info.port}`);
});
