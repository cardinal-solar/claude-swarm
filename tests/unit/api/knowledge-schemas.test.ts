import { describe, it, expect } from 'vitest';
import { CreateKnowledgeSchema, UpdateKnowledgeSchema, RateKnowledgeSchema } from '../../../src/api/schemas/knowledge.schema';

describe('CreateKnowledgeSchema', () => {
  it('validates a valid creation request', () => {
    const result = CreateKnowledgeSchema.safeParse({
      title: 'My Skill',
      description: 'A useful skill',
      tags: ['typescript', 'api'],
      category: 'development',
      promptTemplate: 'You are a helpful assistant that {{does_something}}',
      code: { 'index.ts': 'console.log("hello")' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My Skill');
      expect(result.data.tags).toEqual(['typescript', 'api']);
      expect(result.data.code).toEqual({ 'index.ts': 'console.log("hello")' });
    }
  });

  it('requires title and description', () => {
    const noTitle = CreateKnowledgeSchema.safeParse({
      description: 'A useful skill',
      promptTemplate: 'Do something',
    });
    expect(noTitle.success).toBe(false);

    const noDescription = CreateKnowledgeSchema.safeParse({
      title: 'My Skill',
      promptTemplate: 'Do something',
    });
    expect(noDescription.success).toBe(false);
  });

  it('requires promptTemplate', () => {
    const result = CreateKnowledgeSchema.safeParse({
      title: 'My Skill',
      description: 'A useful skill',
    });
    expect(result.success).toBe(false);
  });
});

describe('RateKnowledgeSchema', () => {
  it('validates score 1-5', () => {
    for (const score of [1, 2, 3, 4, 5]) {
      const result = RateKnowledgeSchema.safeParse({ score });
      expect(result.success).toBe(true);
    }

    const tooLow = RateKnowledgeSchema.safeParse({ score: 0 });
    expect(tooLow.success).toBe(false);

    const tooHigh = RateKnowledgeSchema.safeParse({ score: 6 });
    expect(tooHigh.success).toBe(false);

    const decimal = RateKnowledgeSchema.safeParse({ score: 3.5 });
    expect(decimal.success).toBe(false);
  });
});

describe('UpdateKnowledgeSchema', () => {
  it('allows partial updates', () => {
    const titleOnly = UpdateKnowledgeSchema.safeParse({ title: 'New Title' });
    expect(titleOnly.success).toBe(true);

    const tagsOnly = UpdateKnowledgeSchema.safeParse({ tags: ['new-tag'] });
    expect(tagsOnly.success).toBe(true);

    const empty = UpdateKnowledgeSchema.safeParse({});
    expect(empty.success).toBe(true);
  });

  it('validates status values', () => {
    const active = UpdateKnowledgeSchema.safeParse({ status: 'active' });
    expect(active.success).toBe(true);

    const draft = UpdateKnowledgeSchema.safeParse({ status: 'draft' });
    expect(draft.success).toBe(true);

    const deprecated = UpdateKnowledgeSchema.safeParse({ status: 'deprecated' });
    expect(deprecated.success).toBe(true);

    const invalid = UpdateKnowledgeSchema.safeParse({ status: 'invalid-status' });
    expect(invalid.success).toBe(false);
  });
});
