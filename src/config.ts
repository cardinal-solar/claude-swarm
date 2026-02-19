import * as path from 'path';
import type { ExecutionMode } from './shared/types';

export interface SwarmConfig {
  port: number;
  host: string;
  maxConcurrency: number;
  defaultTimeout: number;
  defaultMode: ExecutionMode;
  dataDir: string;
  dbPath: string;
  workspacesDir: string;
  logLevel: string;
}

export function getConfig(): SwarmConfig {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '3', 10),
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '600000', 10),
    defaultMode: (process.env.DEFAULT_MODE as ExecutionMode) || 'process',
    dataDir,
    dbPath: process.env.DB_PATH || path.join(dataDir, 'swarm.db'),
    workspacesDir: process.env.WORKSPACES_DIR || path.join(dataDir, 'workspaces'),
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}
