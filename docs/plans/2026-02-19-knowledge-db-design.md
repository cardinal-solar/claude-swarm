# Knowledge Database Design

**Date:** 2026-02-19
**Status:** Approved
**Author:** Federico + Claude

## Overview

Add an experience/knowledge database to claude-swarm that stores reusable task patterns (prompt templates, code, artifacts). When a new task arrives, Claude checks this knowledge base first to reuse proven solutions. After completing a task, Claude automatically transcribes the experience for future use. Users can view, rate, and contribute knowledge entries through the existing web dashboard.

## Architecture Decision

**Approach B: SQLite index + filesystem**

- Each knowledge entry lives as a folder on the filesystem (git-friendly, editable)
- SQLite table serves as a fast queryable index for the dashboard and matching
- Server syncs filesystem → SQLite on startup
- Mutations from API update both SQLite and filesystem

## Data Model

### Filesystem Structure

```
data/knowledge/
  <slug>/
    skill.yaml          # structured metadata
    prompt.md           # reusable prompt template
    README.md           # human-readable description and usage guide
    code/               # source scripts
      <filename>
    artifacts/          # template/example files (Excel, Word, etc.)
      <filename>
```

### skill.yaml Schema

```yaml
id: "excel-report-generator"
title: "Excel Report Generator"
description: "Generates Excel reports from CSV data with formatting, charts, and pivot tables"
tags: ["excel", "report", "data", "python"]
category: "document-generation"
status: "active"                   # active | draft | deprecated
rating:
  average: 4.2
  count: 5
  votes:
    - { score: 5, timestamp: "2026-02-19T10:00:00Z" }
    - { score: 4, timestamp: "2026-02-19T11:00:00Z" }
source: "auto"                     # auto | manual
origin_task_id: "abc-123"          # link to generating task (if auto)
created_at: "2026-02-19T10:00:00Z"
updated_at: "2026-02-19T12:00:00Z"
```

### SQLite Index Table

```sql
CREATE TABLE knowledge_entries (
  id              TEXT PRIMARY KEY,     -- folder slug
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  tags_json       TEXT,                 -- JSON array of strings
  category        TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  avg_rating      REAL NOT NULL DEFAULT 0,
  vote_count      INTEGER NOT NULL DEFAULT 0,
  source          TEXT NOT NULL DEFAULT 'auto',
  origin_task_id  TEXT,
  folder_path     TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

## Task Execution Flow

Three-phase pipeline integrated into the existing task flow:

```
POST /api/tasks (prompt)
        │
        ▼
┌─────────────────────┐
│ 1. KNOWLEDGE LOOKUP │  Server reads top-N active entries from SQLite
│    (pre-execution)   │  (sorted by rating), builds a context summary,
│                      │  injects it into the wrapped prompt.
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. CLAUDE EXECUTION │  Claude receives: system instructions +
│    (unchanged)       │  knowledge context + user prompt. It decides
│                      │  whether to use an existing entry or solve
│                      │  from scratch. Same claude call also writes
│                      │  the knowledge entry for learning.
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. KNOWLEDGE LEARN  │  Server checks workspace for .knowledge/
│    (post-execution)  │  directory. If present, copies content to
│                      │  data/knowledge/<slug>/ and updates index.
└─────────────────────┘
```

### Phase 1: Knowledge Lookup

`KnowledgeService.buildContext(prompt)` queries SQLite for active entries sorted by avg_rating DESC, limit KNOWLEDGE_MAX_CONTEXT (default 20). Returns a formatted string:

```
Available knowledge entries (use if relevant):
1. [excel-report-generator] (★4.2) - Generates Excel reports from CSV...
   Files: code/generate_report.py, artifacts/template.xlsx
2. [word-invoice] (★3.8) - Creates Word invoices from template...
   Files: code/create_invoice.py, artifacts/invoice_template.docx
```

This string is prepended to the user prompt in the existing `wrappedPrompt` construction in `TaskService.createTask()`.

### Phase 2: Execution (same Claude instance)

The wrapped prompt includes instructions for Claude to also generate knowledge:

```
AFTER completing the task, create a knowledge entry by saving these files
in a .knowledge/ directory in the workspace:
- .knowledge/skill.yaml  (id, title, description, tags, category)
- .knowledge/prompt.md    (reusable prompt template for this type of task)
- .knowledge/README.md    (human-readable guide on how to replicate)
Copy any reusable code to .knowledge/code/
```

This is the same Claude instance that executed the task - it knows exactly what it did and produces higher quality knowledge entries. No second API call needed.

### Phase 3: Knowledge Learning (server-side, post-execution)

In `scheduler.onComplete`, after a successful task:

1. Check if `<workspacePath>/.knowledge/` exists
2. If yes, read `skill.yaml` to get the slug/id
3. Copy `.knowledge/*` to `data/knowledge/<slug>/`
4. Upsert the SQLite index entry
5. Link `origin_task_id` to the completed task

## API Endpoints

### Knowledge CRUD

```
GET    /api/knowledge
       ?status=active&category=document-generation&tag=excel&sort=rating&page=1&limit=20
       Response: { data: KnowledgeEntry[], total: number, page: number }

GET    /api/knowledge/:id
       Response: KnowledgeEntry (with prompt.md content inlined)

POST   /api/knowledge
       Body: { title, description, tags, category, promptTemplate, code? }
       Response: KnowledgeEntry (201)

PUT    /api/knowledge/:id
       Body: { title?, description?, tags?, category?, status? }
       Response: KnowledgeEntry

DELETE /api/knowledge/:id
       Response: { ok: true }
```

### Rating

```
POST   /api/knowledge/:id/rate
       Body: { score: 1-5 }
       Response: { average: number, count: number }
```

### Artifacts

```
GET    /api/knowledge/:id/artifacts
       Response: [{ name, path, size }]

GET    /api/knowledge/:id/artifacts/*
       Response: file download (streamed)
```

### Sync

```
POST   /api/knowledge/sync
       Response: { synced: number, added: number, removed: number }
```

## Backend Modules

### New files

| File | Purpose |
|------|---------|
| `src/storage/knowledge.store.ts` | SQLite CRUD for knowledge_entries index |
| `src/services/knowledge.service.ts` | Business logic: buildContext(), learnFromTask(), syncFromFilesystem(), rate() |
| `src/api/routes/knowledge.ts` | REST endpoint handlers |
| `src/api/schemas/knowledge.schema.ts` | Zod validation schemas |
| `src/workspace/knowledge-manager.ts` | Filesystem operations: extractFromWorkspace(), createEntry(), deleteEntry() |

### Modified files

| File | Change |
|------|--------|
| `src/storage/schema.ts` | Add `knowledge_entries` table |
| `src/services/task.service.ts` | Inject KnowledgeService, add knowledge lookup to prompt wrapping, add learning in onComplete |
| `src/server.ts` | Register `/api/knowledge` routes |
| `src/config.ts` | Add KNOWLEDGE_DIR, KNOWLEDGE_MAX_CONTEXT, KNOWLEDGE_AUTO_LEARN |

## Frontend Changes

### New pages

| Component | Route | Purpose |
|-----------|-------|---------|
| `KnowledgePage.tsx` | `/app/knowledge` | List entries with filters, search, sorting |
| `KnowledgeDetailPage.tsx` | `/app/knowledge/:id` | Detail view with tabs: Prompt, Code, Artifacts, History |

### New components

| Component | Purpose |
|-----------|---------|
| `KnowledgeTable.tsx` | Table with columns: title, category, tags (badges), rating (stars), status, source, date |
| `RatingStars.tsx` | Clickable star rating component (1-5) |
| `KnowledgeForm.tsx` | Create/edit form with title, description, tags, category, prompt template textarea |
| `CodePreview.tsx` | Syntax-highlighted code viewer for the Code tab |

### Modified components

| Component | Change |
|-----------|--------|
| `App.tsx` | Add routes for `/app/knowledge` and `/app/knowledge/:id` |
| `Sidebar.tsx` | Add "Knowledge" nav link |
| `TaskDetailPage.tsx` | Add "Knowledge Generated" section with link to generated entry |

## Configuration

New environment variables in `src/config.ts`:

```typescript
KNOWLEDGE_DIR: string;          // default: ./data/knowledge
KNOWLEDGE_MAX_CONTEXT: number;  // default: 20 (max entries in prompt context)
KNOWLEDGE_AUTO_LEARN: boolean;  // default: true (auto-generate entries after task success)
```

## Rating System

- Users rate entries 1-5 stars via POST `/api/knowledge/:id/rate`
- Each vote is appended to `skill.yaml` votes array
- `avg_rating` and `vote_count` are recalculated and stored in both SQLite and yaml
- Higher-rated entries appear first in the knowledge context passed to Claude
- No auto-deprecation: entries with low ratings still appear, just lower priority

## Sync Mechanism

On server startup:
1. Scan `KNOWLEDGE_DIR/*/skill.yaml`
2. Parse each yaml
3. Upsert into SQLite `knowledge_entries` table
4. Remove SQLite entries whose folders no longer exist

Manual sync via `POST /api/knowledge/sync` triggers the same process.

## CLI/SDK Extensions

### CLI
- `claude-swarm knowledge list` - list entries
- `claude-swarm knowledge show <id>` - show entry detail
- `claude-swarm knowledge add` - create entry interactively

### SDK
- `client.listKnowledge(filter?)` - list entries
- `client.getKnowledge(id)` - get entry
- `client.createKnowledge(input)` - create entry
- `client.rateKnowledge(id, score)` - rate entry
