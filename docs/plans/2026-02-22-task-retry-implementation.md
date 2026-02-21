# Task Retry on Timeout — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `POST /api/tasks/:id/retry` endpoint and a dashboard "Retry Task" panel for tasks that failed with `error.code === 'TIMEOUT'`.

**Architecture:** New child task approach — retry creates a new task record reusing the original workspace, with `retryOf` in tags. No DB migration. Three layers: error class → service method → route → dashboard.

**Tech Stack:** TypeScript, Hono, Drizzle ORM / better-sqlite3, Zod v4, React, Tailwind CSS, vitest

---

### Task 1: Add `TaskNotRetryableError`

**Files:**
- Modify: `src/shared/errors.ts`
- Test: `tests/unit/shared/errors.test.ts`

**Step 1: Read the existing errors file**

```bash
cat src/shared/errors.ts
```

**Step 2: Write the failing test**

In `tests/unit/shared/errors.test.ts`, add inside the existing describe block:

```ts
it('TaskNotRetryableError has correct code and message', () => {
  const err = new TaskNotRetryableError('abc-123', 'not a timeout failure');
  expect(err.code).toBe('TASK_NOT_RETRYABLE');
  expect(err.message).toContain('abc-123');
  expect(err.message).toContain('not a timeout failure');
  expect(err).toBeInstanceOf(Error);
});
```

**Step 3: Run test to verify it fails**

```bash
npx vitest run tests/unit/shared/errors.test.ts
```
Expected: FAIL — `TaskNotRetryableError is not defined`

**Step 4: Add the error class**

Append to `src/shared/errors.ts`:

```ts
export class TaskNotRetryableError extends Error {
  code = 'TASK_NOT_RETRYABLE';
  constructor(id: string, reason: string) {
    super(`Task ${id} is not retryable: ${reason}`);
    this.name = 'TaskNotRetryableError';
  }
}
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run tests/unit/shared/errors.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/errors.ts tests/unit/shared/errors.test.ts
git commit -m "feat: add TaskNotRetryableError"
```

---

### Task 2: Add `retryTask` to `TaskService`

**Files:**
- Modify: `src/services/task.service.ts`
- Test: `tests/unit/services/task.service.test.ts`

**Step 1: Read existing task service tests to understand mock setup**

```bash
cat tests/unit/services/task.service.test.ts
```

**Step 2: Write the failing tests**

Add to `tests/unit/services/task.service.test.ts`:

```ts
describe('retryTask', () => {
  it('throws TaskNotFoundError when task does not exist', async () => {
    mockTaskStore.getById.mockReturnValue(null);
    await expect(taskService.retryTask('missing-id', 'sk-key')).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it('throws TaskNotRetryableError when task is not failed', async () => {
    mockTaskStore.getById.mockReturnValue({
      id: 'task-1', status: 'completed', error: null,
      prompt: 'do something', mode: 'sdk', workspacePath: '/ws/task-1',
      createdAt: new Date().toISOString(),
    });
    await expect(taskService.retryTask('task-1', 'sk-key')).rejects.toBeInstanceOf(TaskNotRetryableError);
  });

  it('throws TaskNotRetryableError when error code is not TIMEOUT', async () => {
    mockTaskStore.getById.mockReturnValue({
      id: 'task-1', status: 'failed', error: { code: 'SDK_ERROR', message: 'oops' },
      prompt: 'do something', mode: 'sdk', workspacePath: '/ws/task-1',
      createdAt: new Date().toISOString(),
    });
    await expect(taskService.retryTask('task-1', 'sk-key')).rejects.toBeInstanceOf(TaskNotRetryableError);
  });

  it('creates a new task reusing workspace and sets retryOf tag', async () => {
    const originalTask = {
      id: 'orig-id', status: 'failed', error: { code: 'TIMEOUT', message: 'timed out after 1800s' },
      prompt: 'do something', mode: 'sdk' as const, workspacePath: '/ws/orig-id',
      createdAt: new Date().toISOString(), duration: 1800000,
    };
    mockTaskStore.getById.mockReturnValue(originalTask);
    mockTaskStore.create.mockReturnValue('new-id');

    const result = await taskService.retryTask('orig-id', 'sk-key');

    expect(result.id).toBe('new-id');
    // Should NOT create a new workspace
    expect(mockWorkspaceManager.create).not.toHaveBeenCalled();
    // New task prompt must contain RESUME header
    const createCall = mockTaskStore.create.mock.calls[0][0];
    expect(createCall.workspacePath).toBe('/ws/orig-id');
    // Tags must contain retryOf
    expect(mockScheduler.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          prompt: expect.stringContaining('[RESUME]'),
          apiKey: 'sk-key',
          workspacePath: '/ws/orig-id',
        }),
      })
    );
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/unit/services/task.service.test.ts
```
Expected: FAIL — `retryTask is not a function`

**Step 4: Implement `retryTask`**

Add to `src/services/task.service.ts` after the import block:

```ts
import { TaskNotFoundError, TaskNotRetryableError } from '../shared/errors';
```

(replace existing `TaskNotFoundError` import if needed)

Add method to `TaskService` class:

```ts
async retryTask(id: string, apiKey: string, timeout?: number): Promise<{ id: string }> {
  const original = this.deps.taskStore.getById(id);
  if (!original) throw new TaskNotFoundError(id);
  if (original.status !== 'failed' || original.error?.code !== 'TIMEOUT') {
    throw new TaskNotRetryableError(id, `status=${original.status}, error=${original.error?.code ?? 'none'}`);
  }

  const elapsedSec = original.duration ? Math.round(original.duration / 1000) : '?';
  const resumePrompt = `[RESUME] Previous run timed out after ${elapsedSec}s. The workspace already contains partial work — continue from where it left off.\n\n${original.prompt}`;

  const mergedTags = { ...(original.tags ?? {}), retryOf: id };

  // Build knowledge context
  let knowledgeContext = '';
  if (this.deps.knowledgeService) {
    knowledgeContext = await this.deps.knowledgeService.buildContext(original.prompt);
  }

  const wrappedPrompt = `${knowledgeContext ? knowledgeContext + '\n\n---\n\n' : ''}${resumePrompt}`;

  const mode = original.mode;
  const schemaJson = (original as any).schemaJson;
  const schema = schemaJson ? JSON.parse(schemaJson) : undefined;

  const newId = this.deps.taskStore.create({
    prompt: original.prompt,
    mode,
    schemaJson,
    tags: mergedTags,
    workspacePath: original.workspacePath,
  });

  const executor = mode === 'sdk'
    ? new SdkExecutor()
    : mode === 'container'
      ? new ContainerExecutor()
      : new ProcessExecutor();

  const effectiveTimeout = timeout ?? this.deps.defaultTimeout;

  this.deps.scheduler.enqueue({
    taskId: newId,
    params: {
      taskId: newId,
      prompt: wrappedPrompt,
      apiKey,
      workspacePath: original.workspacePath!,
      schema,
      timeout: effectiveTimeout,
      onOutput: (chunk) => {
        this.deps.taskLogStore.append(newId, chunk);
      },
    },
    executor,
    onComplete: async (taskId, result) => {
      if (result.success) {
        this.deps.taskStore.complete(taskId, { data: result.data, valid: result.valid ?? true }, result.duration);
      } else {
        this.deps.taskStore.fail(taskId, result.error || { code: 'UNKNOWN', message: 'Unknown error' }, result.duration);
      }
    },
  });

  this.deps.taskStore.updateStatus(newId, 'running');
  return { id: newId };
}
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/unit/services/task.service.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/services/task.service.ts src/shared/errors.ts tests/unit/services/task.service.test.ts
git commit -m "feat: add retryTask to TaskService"
```

---

### Task 3: Add retry route

**Files:**
- Modify: `src/api/routes/tasks.ts`
- Test: `tests/integration/api.test.ts`

**Step 1: Read the integration test file to understand test setup**

```bash
cat tests/integration/api.test.ts
```

**Step 2: Write failing integration test**

Add to `tests/integration/api.test.ts`:

```ts
describe('POST /api/tasks/:id/retry', () => {
  it('returns 400 when apiKey is missing', async () => {
    const res = await app.request('/api/tasks/some-id/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 when task does not exist', async () => {
    const res = await app.request('/api/tasks/nonexistent/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-key' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when task is not retryable', async () => {
    // Create a completed task first
    const createRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test', apiKey: 'sk-key', mode: 'sdk' }),
    });
    const { id } = await createRes.json();
    // Mark as completed (not retryable)
    // Use internal store to set status directly
    const retryRes = await app.request(`/api/tasks/${id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-key' }),
    });
    expect(retryRes.status).toBe(409);
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/integration/api.test.ts -t "retry"
```
Expected: FAIL — 404 (route not found)

**Step 4: Add the route**

In `src/api/routes/tasks.ts`, add after the imports:

```ts
import { TaskNotFoundError, TaskNotRetryableError } from '../../shared/errors';
```

Add the route before `return router;`:

```ts
router.post('/:id/retry', async (c) => {
  let body: { apiKey?: string; timeout?: number };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } }, 400);
  }

  if (!body.apiKey) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'apiKey is required' } }, 400);
  }

  try {
    const { id: newId } = await taskService.retryTask(
      c.req.param('id'),
      body.apiKey,
      body.timeout,
    );
    const newTask = taskService.getTask(newId);
    return c.json(newTask, 202);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return c.json({ error: { code: err.code, message: err.message } }, 404);
    }
    if (err instanceof TaskNotRetryableError) {
      return c.json({ error: { code: err.code, message: err.message } }, 409);
    }
    throw err;
  }
});
```

**Step 5: Run tests**

```bash
npx vitest run tests/integration/api.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/api/routes/tasks.ts tests/integration/api.test.ts
git commit -m "feat: add POST /api/tasks/:id/retry route"
```

---

### Task 4: Add `retry` to the web API client

**Files:**
- Modify: `web/src/lib/api-client.ts`

**Step 1: Add `retry` method to `api.tasks`**

In `web/src/lib/api-client.ts`, inside `api.tasks`, add after `create`:

```ts
retry: (id: string, data: { apiKey: string; timeout?: number }) =>
  fetchJson<TaskRecord>(`/tasks/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
```

**Step 2: Commit**

```bash
git add web/src/lib/api-client.ts
git commit -m "feat: add retry to api-client"
```

---

### Task 5: Add "Retry Task" panel to `TaskDetailPage`

**Files:**
- Modify: `web/src/pages/TaskDetailPage.tsx`

**Step 1: Read current TaskDetailPage**

```bash
cat web/src/pages/TaskDetailPage.tsx
```

**Step 2: Add `RetryPanel` component**

Add before `export function TaskDetailPage()`:

```tsx
function RetryPanel({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleRetry() {
    if (!apiKey.trim()) { setError('API key required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const newTask = await api.tasks.retry(taskId, { apiKey });
      navigate(`/app/tasks/${newTask.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-amber-50 rounded-lg border border-amber-200 p-5 space-y-3">
      <h3 className="text-sm font-medium text-amber-800 uppercase">Retry Task</h3>
      <p className="text-sm text-amber-700">
        This task timed out. Retry will resume in the same workspace, continuing partial work.
      </p>
      <div className="flex gap-3">
        <input
          type="password"
          placeholder="Anthropic API key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="flex-1 px-3 py-2 border border-amber-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
        />
        <button
          onClick={handleRetry}
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Retrying...' : 'Retry Task'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

**Step 3: Add `useNavigate` and `useState` imports**

At the top of the file, ensure imports include:

```tsx
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
```

**Step 4: Add "retryOf" banner and `RetryPanel` to `TaskDetailPage`**

Inside `TaskDetailPage`, after the `{/* Error */}` block, add:

```tsx
{/* Retry panel — shown only for timed-out tasks */}
{task.status === 'failed' && task.error?.code === 'TIMEOUT' && (
  <RetryPanel taskId={task.id} />
)}

{/* Retry-of banner */}
{task.tags?.retryOf && (
  <div className="text-sm text-gray-500 bg-gray-50 rounded-md px-4 py-2 border border-gray-200">
    ↩ Retry of{' '}
    <Link
      to={`/app/tasks/${task.tags.retryOf}`}
      className="font-mono text-blue-600 hover:underline"
    >
      {task.tags.retryOf.slice(0, 8)}...
    </Link>
  </div>
)}
```

**Step 5: Build web to verify no TypeScript errors**

```bash
cd web && npm run build 2>&1 | head -40
```
Expected: no errors

**Step 6: Commit**

```bash
git add web/src/pages/TaskDetailPage.tsx
git commit -m "feat: add RetryPanel to TaskDetailPage"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run all tests**

```bash
npx vitest run
```
Expected: all tests PASS

**Step 2: Build web**

```bash
cd web && npm run build
```
Expected: no errors

**Step 3: Final commit if any stragglers**

```bash
git status
# If anything unstaged:
git add -A && git commit -m "chore: cleanup after retry feature"
```
