import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { KnowledgeService } from '../../services/knowledge.service';
import { CreateKnowledgeSchema, UpdateKnowledgeSchema, RateKnowledgeSchema } from '../schemas/knowledge.schema';

const MIME_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.ts': 'text/plain',
  '.js': 'text/plain',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
};

export function knowledgeRoutes(knowledgeService: KnowledgeService) {
  const router = new Hono();

  // POST /sync - Force sync filesystem -> SQLite
  // IMPORTANT: Must be registered BEFORE /:id routes so "sync" isn't matched as an :id
  router.post('/sync', async (c) => {
    const result = await knowledgeService.syncFromFilesystem();
    return c.json(result);
  });

  // GET / - List entries
  router.get('/', (c) => {
    const status = c.req.query('status') as any;
    const category = c.req.query('category');
    const tag = c.req.query('tag');
    const sort = c.req.query('sort') as 'rating' | 'date' | 'title' | undefined;

    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (tag) filter.tag = tag;
    if (sort) filter.sortBy = sort;

    const entries = knowledgeService.list(Object.keys(filter).length > 0 ? filter : undefined);
    return c.json({ data: entries, total: entries.length });
  });

  // GET /:id - Get single entry
  router.get('/:id', (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    return c.json(entry);
  });

  // POST / - Create entry
  router.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const entry = await knowledgeService.create(parsed.data);
    return c.json(entry, 201);
  });

  // PUT /:id - Update entry
  router.put('/:id', async (c) => {
    const body = await c.req.json();
    const parsed = UpdateKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const entry = await knowledgeService.update(c.req.param('id'), parsed.data);
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    return c.json(entry);
  });

  // DELETE /:id - Delete entry
  router.delete('/:id', async (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    await knowledgeService.deleteEntry(c.req.param('id'));
    return c.json({ ok: true });
  });

  // POST /:id/rate - Rate entry
  router.post('/:id/rate', async (c) => {
    const body = await c.req.json();
    const parsed = RateKnowledgeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }

    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }

    const result = await knowledgeService.rate(c.req.param('id'), parsed.data.score);
    return c.json(result);
  });

  // GET /:id/artifacts - List artifacts
  router.get('/:id/artifacts', async (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }
    const artifacts = await knowledgeService.listArtifacts(c.req.param('id'));
    return c.json(artifacts);
  });

  // GET /:id/artifacts/* - Download artifact
  router.get('/:id/artifacts/*', async (c) => {
    const entry = knowledgeService.getById(c.req.param('id'));
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Knowledge entry not found' } }, 404);
    }

    const artifactPath = c.req.path.split('/artifacts/').slice(1).join('/artifacts/');
    if (!artifactPath) {
      return c.json({ error: { code: 'MISSING_PATH', message: 'Artifact path required' } }, 400);
    }

    const artifactsDir = path.join(entry.folderPath, 'artifacts');
    const fullPath = path.resolve(artifactsDir, artifactPath);

    // Prevent directory traversal
    if (!fullPath.startsWith(path.resolve(artifactsDir))) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Path traversal not allowed' } }, 403);
    }

    try {
      const fileStat = await fs.stat(fullPath);
      if (!fileStat.isFile()) {
        return c.json({ error: { code: 'NOT_FILE', message: 'Path is not a file' } }, 400);
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileName = path.basename(fullPath);

      c.header('Content-Type', contentType);
      c.header('Content-Disposition', `attachment; filename="${fileName}"`);
      c.header('Content-Length', fileStat.size.toString());

      return stream(c, async (s) => {
        const readable = createReadStream(fullPath);
        for await (const chunk of readable) {
          await s.write(chunk as Uint8Array);
        }
      });
    } catch {
      return c.json({ error: { code: 'NOT_FOUND', message: `Artifact not found: ${artifactPath}` } }, 404);
    }
  });

  return router;
}
