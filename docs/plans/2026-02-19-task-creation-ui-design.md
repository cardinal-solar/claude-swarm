# Task Creation UI Design

**Date**: 2026-02-19
**Status**: Approved

## Goal

Add the ability to create new tasks directly from the dashboard, eliminating the need for API calls.

## Design

### Location & Access

Inline collapsible form on TasksPage (`/app`). A "+ New Task" button in the header toggles the form open/closed. Matches the existing pattern used in ProfilesPage for creating MCP profiles.

### Form Fields

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Prompt | textarea | yes | — | Multi-line, placeholder text |
| API Key | input (password) | yes | — | Masked input |
| Mode | select | yes | "process" | Options: process, container, sdk |

Advanced fields (timeout, model, permissionMode, files, mcpServers, tags) are intentionally excluded. Power users can use the API directly.

### UX Flow

1. User clicks "+ New Task" button
2. Form panel slides open above the task table
3. User fills prompt, pastes API key, optionally changes mode
4. Clicks "Create Task"
5. Button shows loading state, disabled during submission
6. On success: navigate to `/app/tasks/:id` (live log streaming)
7. On error: show error message inline, form stays open

### Files Changed

1. **`web/src/lib/api-client.ts`** — Add `CreateTaskInput` interface and `tasks.create()` method
2. **`web/src/pages/TasksPage.tsx`** — Add inline collapsible form with "+ New Task" button

No new files needed.
