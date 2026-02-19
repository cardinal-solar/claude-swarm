import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { TaskService } from '../../services/task.service';
import { CreateTaskSchema } from '../schemas/task.schema';
import { TaskNotFoundError } from '../../shared/errors';

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
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
};

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

  // List artifacts in workspace
  router.get('/:id/artifacts', async (c) => {
    try {
      const task = taskService.getTask(c.req.param('id'));
      if (!task.workspacePath) {
        return c.json([]);
      }
      const artifacts = await taskService.listArtifacts(task.id);
      return c.json(artifacts);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return c.json({ error: { code: err.code, message: err.message } }, 404);
      }
      throw err;
    }
  });

  // Download a specific artifact
  router.get('/:id/artifacts/*', async (c) => {
    try {
      const task = taskService.getTask(c.req.param('id'));
      if (!task.workspacePath) {
        return c.json({ error: { code: 'NO_WORKSPACE', message: 'Task has no workspace' } }, 404);
      }

      const artifactPath = c.req.path.split('/artifacts/').slice(1).join('/artifacts/');
      if (!artifactPath) {
        return c.json({ error: { code: 'MISSING_PATH', message: 'Artifact path required' } }, 400);
      }

      const fullPath = path.resolve(task.workspacePath, artifactPath);
      // Prevent directory traversal
      if (!fullPath.startsWith(path.resolve(task.workspacePath))) {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Path traversal not allowed' } }, 403);
      }

      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isFile()) {
          return c.json({ error: { code: 'NOT_FILE', message: 'Path is not a file' } }, 400);
        }

        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const fileName = path.basename(fullPath);

        c.header('Content-Type', contentType);
        c.header('Content-Disposition', `attachment; filename="${fileName}"`);
        c.header('Content-Length', stat.size.toString());

        return stream(c, async (s) => {
          const readable = createReadStream(fullPath);
          for await (const chunk of readable) {
            await s.write(chunk as Uint8Array);
          }
        });
      } catch {
        return c.json({ error: { code: 'NOT_FOUND', message: `Artifact not found: ${artifactPath}` } }, 404);
      }
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return c.json({ error: { code: err.code, message: err.message } }, 404);
      }
      throw err;
    }
  });

  // Get task logs - supports SSE streaming for running tasks
  router.get('/:id/logs', async (c) => {
    try {
      const task = taskService.getTask(c.req.param('id'));
      const accept = c.req.header('accept') || '';

      // SSE streaming mode: stream live logs for running tasks
      if (accept.includes('text/event-stream') && (task.status === 'running' || task.status === 'queued')) {
        return stream(c, async (s) => {
          c.header('Content-Type', 'text/event-stream');
          c.header('Cache-Control', 'no-cache');
          c.header('Connection', 'keep-alive');

          // Send existing logs first
          const existing = taskService.getTaskLogs(task.id);
          if (existing) {
            await s.write(`data: ${JSON.stringify({ type: 'log', content: existing })}\n\n`);
          }

          // Stream new chunks
          const unsubscribe = taskService.subscribeTaskLogs(task.id, async (chunk) => {
            try {
              await s.write(`data: ${JSON.stringify({ type: 'log', content: chunk })}\n\n`);
            } catch {
              unsubscribe();
            }
          });

          // Poll for task completion to close the stream
          const pollInterval = setInterval(async () => {
            try {
              const current = taskService.getTask(task.id);
              if (current.status !== 'running' && current.status !== 'queued') {
                await s.write(`data: ${JSON.stringify({ type: 'done', status: current.status })}\n\n`);
                unsubscribe();
                clearInterval(pollInterval);
                await s.close();
              }
            } catch {
              unsubscribe();
              clearInterval(pollInterval);
            }
          }, 2000);

          // Cleanup on client disconnect
          s.onAbort(() => {
            unsubscribe();
            clearInterval(pollInterval);
          });
        });
      }

      // One-shot mode: return all accumulated logs
      const logs = taskService.getTaskLogs(task.id);
      return c.json({ taskId: task.id, status: task.status, logs });
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
