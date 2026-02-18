import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { McpProfileStore } from '../../../src/storage/mcp-profile.store';
import { initializeDatabase } from '../../../src/storage/database';

describe('McpProfileStore', () => {
  let store: McpProfileStore;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    store = new McpProfileStore(db);
  });

  it('creates and retrieves a profile', () => {
    const id = store.create({
      name: 'my-postgres',
      servers: [{ name: 'pg', command: 'npx', args: ['-y', 'pg-mcp'] }],
    });
    const profile = store.getById(id);
    expect(profile).toBeDefined();
    expect(profile!.name).toBe('my-postgres');
    expect(profile!.servers).toHaveLength(1);
    expect(profile!.servers[0].command).toBe('npx');
  });

  it('lists all profiles', () => {
    store.create({ name: 'p1', servers: [] });
    store.create({ name: 'p2', servers: [] });
    const all = store.list();
    expect(all).toHaveLength(2);
  });

  it('deletes a profile', () => {
    const id = store.create({ name: 'deleteme', servers: [] });
    store.delete(id);
    expect(store.getById(id)).toBeNull();
  });

  it('rejects duplicate names', () => {
    store.create({ name: 'unique', servers: [] });
    expect(() => store.create({ name: 'unique', servers: [] })).toThrow();
  });
});
