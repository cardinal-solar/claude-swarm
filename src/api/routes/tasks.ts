import { Hono } from 'hono';
import { TaskService } from '../../services/task.service';
import { CreateTaskSchema } from '../schemas/task.schema';
import { TaskNotFoundError } from '../../shared/errors';

export function taskRoutes(taskService: TaskService) {
  const router = new Hono();

  router.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.issues } }, 400);
    }
    const { id } = await taskService.createTask(parsed.data);
    const task = taskService.getTask(id);
    return c.json(task, 202);
  });

  router.get('/', (c) => {
    const status = c.req.query('status') as any;
    return c.json(taskService.listTasks(status ? { status } : undefined));
  });

  router.get('/:id', (c) => {
    try {
      const task = taskService.getTask(c.req.param('id'));
      return c.json(task);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return c.json({ error: { code: err.code, message: err.message } }, 404);
      }
      throw err;
    }
  });

  router.delete('/:id', async (c) => {
    try {
      await taskService.cancelTask(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return c.json({ error: { code: err.code, message: err.message } }, 404);
      }
      throw err;
    }
  });

  return router;
}
