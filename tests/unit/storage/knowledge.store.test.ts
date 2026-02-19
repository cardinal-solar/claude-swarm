import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { KnowledgeStore } from '../../../src/storage/knowledge.store';
import { initializeDatabase } from '../../../src/storage/database';

describe('KnowledgeStore', () => {
  let store: KnowledgeStore;

  beforeEach(() => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    initializeDatabase(sqlite);
    store = new KnowledgeStore(db);
  });

  it('creates and retrieves a knowledge entry', () => {
    const id = store.create({
      title: 'Drizzle ORM patterns',
      description: 'Best practices for using Drizzle with SQLite',
      tags: ['drizzle', 'sqlite', 'orm'],
      category: 'databases',
      source: 'manual',
      folderPath: '/knowledge/drizzle-patterns',
    });

    const entry = store.getById(id);
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Drizzle ORM patterns');
    expect(entry!.description).toBe('Best practices for using Drizzle with SQLite');
    expect(entry!.tags).toEqual(['drizzle', 'sqlite', 'orm']);
    expect(entry!.category).toBe('databases');
    expect(entry!.status).toBe('active');
    expect(entry!.avgRating).toBe(0);
    expect(entry!.voteCount).toBe(0);
    expect(entry!.source).toBe('manual');
    expect(entry!.folderPath).toBe('/knowledge/drizzle-patterns');
    expect(entry!.createdAt).toBeDefined();
    expect(entry!.updatedAt).toBeDefined();
  });

  it('lists entries sorted by rating', () => {
    const id1 = store.create({
      title: 'Low rated',
      description: 'desc',
      tags: [],
      folderPath: '/knowledge/low',
    });
    const id2 = store.create({
      title: 'High rated',
      description: 'desc',
      tags: [],
      folderPath: '/knowledge/high',
    });

    store.updateRating(id1, 2, 5);
    store.updateRating(id2, 5, 10);

    const entries = store.list({ sortBy: 'rating' });
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe('High rated');
    expect(entries[1].title).toBe('Low rated');
  });

  it('filters by status', () => {
    store.create({
      title: 'Active entry',
      description: 'desc',
      tags: [],
      folderPath: '/knowledge/active',
    });
    const draftId = store.create({
      title: 'Draft entry',
      description: 'desc',
      tags: [],
      folderPath: '/knowledge/draft',
    });
    store.updateStatus(draftId, 'draft');

    const activeEntries = store.list({ status: 'active' });
    expect(activeEntries).toHaveLength(1);
    expect(activeEntries[0].title).toBe('Active entry');

    const draftEntries = store.list({ status: 'draft' });
    expect(draftEntries).toHaveLength(1);
    expect(draftEntries[0].title).toBe('Draft entry');
  });

  it('filters by tag', () => {
    store.create({
      title: 'TypeScript guide',
      description: 'desc',
      tags: ['typescript', 'guide'],
      folderPath: '/knowledge/ts',
    });
    store.create({
      title: 'Python guide',
      description: 'desc',
      tags: ['python', 'guide'],
      folderPath: '/knowledge/py',
    });

    const tsEntries = store.list({ tag: 'typescript' });
    expect(tsEntries).toHaveLength(1);
    expect(tsEntries[0].title).toBe('TypeScript guide');

    const guideEntries = store.list({ tag: 'guide' });
    expect(guideEntries).toHaveLength(2);
  });

  it('updates rating', () => {
    const id = store.create({
      title: 'Rated entry',
      description: 'desc',
      tags: [],
      folderPath: '/knowledge/rated',
    });

    store.updateRating(id, 4, 10);

    const entry = store.getById(id);
    expect(entry!.avgRating).toBe(4);
    expect(entry!.voteCount).toBe(10);
  });

  it('deletes an entry', () => {
    const id = store.create({
      title: 'To delete',
      description: 'desc',
      tags: [],
      folderPath: '/knowledge/delete-me',
    });

    expect(store.getById(id)).toBeDefined();
    store.delete(id);
    expect(store.getById(id)).toBeNull();
  });

  it('returns null for non-existent entry', () => {
    expect(store.getById('nonexistent')).toBeNull();
  });

  it('upserts an entry (create then update)', () => {
    // First upsert creates
    const id = store.upsert({
      title: 'Original title',
      description: 'Original desc',
      tags: ['tag1'],
      folderPath: '/knowledge/upsert-test',
    });

    const created = store.getById(id);
    expect(created!.title).toBe('Original title');
    expect(created!.description).toBe('Original desc');

    // Second upsert updates (same id)
    store.upsert({
      id,
      title: 'Updated title',
      description: 'Updated desc',
      tags: ['tag1', 'tag2'],
      folderPath: '/knowledge/upsert-test',
    });

    const updated = store.getById(id);
    expect(updated!.title).toBe('Updated title');
    expect(updated!.description).toBe('Updated desc');
    expect(updated!.tags).toEqual(['tag1', 'tag2']);
  });
});
