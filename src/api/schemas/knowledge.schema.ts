import { z } from 'zod';

export const CreateKnowledgeSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
  promptTemplate: z.string().min(1),
  code: z.record(z.string(), z.string()).optional(),
});
export type CreateKnowledgeInput = z.infer<typeof CreateKnowledgeSchema>;

export const UpdateKnowledgeSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  status: z.enum(['active', 'draft', 'deprecated']).optional(),
});
export type UpdateKnowledgeInput = z.infer<typeof UpdateKnowledgeSchema>;

export const RateKnowledgeSchema = z.object({
  score: z.number().int().min(1).max(5),
});
export type RateKnowledgeInput = z.infer<typeof RateKnowledgeSchema>;
