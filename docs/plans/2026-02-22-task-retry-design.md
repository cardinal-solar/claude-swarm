# Task Retry on Timeout — Design

**Date:** 2026-02-22
**Status:** Approved

## Problem

Tasks that fail due to timeout leave a partially-completed workspace. There is currently no way to resume them — the user must create a brand new task from scratch, losing any partial work.

## Goals

- Allow retrying a timed-out task via API and dashboard
- Reuse the existing workspace so Claude can continue from partial work
- Keep the original task record intact (immutable history)
- Require no DB schema migration

## Non-Goals

- Automatic retry chains (manual only)
- Retry for non-timeout failures or cancelled tasks
- Storing the API key server-side

---

## Design

### Constraint: `status === 'failed' && error.code === 'TIMEOUT'`

Only tasks matching this condition can be retried. Any other status returns `409 Conflict`.

### Approach: New child task

The retry creates a **new task** with a new ID. The original task record is untouched. The new task:
- Reuses the original `workspacePath` (no new directory created)
- Gets `{ retryOf: <originalId> }` merged into its `tags`
- Has its prompt prepended with a resume instruction

This preserves full history and avoids in-place state mutations.

---

## API

### New endpoint

```
POST /api/tasks/:id/retry
Content-Type: application/json

{
  "apiKey": "sk-ant-...",    // required
  "timeout": 1800000         // optional, falls back to server default (30 min)
}
```

**Responses:**
- `202 Accepted` — `{ id: "<newTaskId>", ... }` (full TaskRecord of the new task)
- `404 Not Found` — original task not found
- `409 Conflict` — task is not retryable (wrong status or error code)
- `400 Bad Request` — validation error (missing apiKey)

---

## TaskService

New method added to `TaskService`:

```ts
async retryTask(
  id: string,
  apiKey: string,
  timeout?: number
): Promise<{ id: string }>
```

**Logic:**
1. Load original task — throw `TaskNotFoundError` if missing
2. Validate: `status === 'failed'` and `error.code === 'TIMEOUT'` — throw `409` otherwise
3. Build resume prompt:
   ```
   [RESUME] Previous run timed out after <Xs>. The workspace already
   contains partial work — continue from where it left off.

   <original prompt>
   ```
4. Merge tags: `{ ...originalTask.tags, retryOf: id }`
5. Skip `workspaceManager.create()` — pass `originalTask.workspacePath` directly
6. Run the rest of the normal `createTask` flow:
   - Knowledge context lookup
   - MCP server resolution (re-read from original `schemaJson` / inline config)
   - Scheduler enqueue with reused workspace
7. Return `{ id: newTaskId }`

**Note:** MCP servers and schema are re-read from the original task's stored `schemaJson`. Since `mcpServers` and `model`/`permissionMode` are not persisted today, the retry uses server defaults for those fields. This is acceptable for the current scope.

---

## Routes

`src/api/routes/tasks.ts` — add:

```ts
router.post('/:id/retry', async (c) => {
  const { apiKey, timeout } = await c.req.json();
  if (!apiKey) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'apiKey required' } }, 400);
  try {
    const { id: newId } = await taskService.retryTask(c.req.param('id'), apiKey, timeout);
    return c.json(taskService.getTask(newId), 202);
  } catch (err) {
    if (err instanceof TaskNotFoundError) return c.json(..., 404);
    if (err instanceof TaskNotRetryableError) return c.json(..., 409);
    throw err;
  }
});
```

New error class `TaskNotRetryableError` added to `src/shared/errors.ts`.

---

## Dashboard

### `api-client.ts`

```ts
retry: (id: string, data: { apiKey: string; timeout?: number }) =>
  fetchJson<TaskRecord>(`/tasks/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
```

### `TaskDetailPage.tsx`

When `task.status === 'failed' && task.error?.code === 'TIMEOUT'`:

- Render a "Retry Task" panel below the error card
- Panel contains: API key input field + "Retry" button
- On submit: calls `api.tasks.retry(id, { apiKey })`, then navigates to `/app/tasks/<newId>`
- Shows spinner + disables button while submitting
- Shows inline error if retry call fails

When `task.tags?.retryOf` is set:

- Render a small banner: "↩ Retry of task <retryOf slice(0,8)>..." with a link to the original

---

## Data

No DB migration required. `tags` is already a JSON blob (`tagsJson` column). The `retryOf` key is stored inside it transparently.

---

## Error Classes

```ts
// src/shared/errors.ts
export class TaskNotRetryableError extends Error {
  code = 'TASK_NOT_RETRYABLE';
  constructor(id: string, reason: string) {
    super(`Task ${id} is not retryable: ${reason}`);
  }
}
```

---

## Out of Scope

- Persisting `apiKey`, `model`, `permissionMode`, `mcpServers` on the task record
- Retry depth limit (no infinite retry chains since this is manual)
- Retry button in `TaskTable` (detail page only, to keep table clean)
- Auto-retry on timeout
