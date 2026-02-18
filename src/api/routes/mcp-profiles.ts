import { Hono } from 'hono';
import { McpProfileService } from '../../services/mcp-profile.service';
import { CreateMcpProfileSchema } from '../schemas/mcp-profile.schema';

export function mcpProfileRoutes(mcpProfileService: McpProfileService) {
  const router = new Hono();

  router.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateMcpProfileSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const profile = mcpProfileService.create(parsed.data);
    return c.json(profile, 201);
  });

  router.get('/', (c) => {
    return c.json(mcpProfileService.list());
  });

  router.get('/:id', (c) => {
    const profile = mcpProfileService.getById(c.req.param('id'));
    if (!profile) return c.json({ error: { code: 'NOT_FOUND', message: 'Profile not found' } }, 404);
    return c.json(profile);
  });

  router.delete('/:id', (c) => {
    mcpProfileService.delete(c.req.param('id'));
    return c.json({ ok: true });
  });

  return router;
}
