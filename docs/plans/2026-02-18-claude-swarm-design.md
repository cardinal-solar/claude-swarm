# Claude Swarm - Design Document

**Date:** 2026-02-18
**Status:** Approved
**Author:** Federico Costa + Claude

## 1. Vision

Claude Swarm is a "Claude-Code-as-a-Service" platform that lets users submit tasks to managed Claude Code instances via a REST API, CLI, or TypeScript SDK. Each task runs in an isolated environment (subprocess or Docker container) with the user's API key, optional project files, and optional MCP server connections.

## 2. Core Concepts

| Concept | Description |
|---|---|
| **Task** | A unit of work: prompt + optional schema + optional files + optional MCP config. Lifecycle: `queued -> running -> completed / failed / cancelled` |
| **Execution Mode** | How the Claude instance runs: `process` (local subprocess via claude-code-manager) or `container` (Docker container with Claude CLI) |
| **Result** | Structured output validated against a Zod/JSON Schema, plus any artifacts (files created/modified by Claude) |
| **Worker Pool** | Bounded set of concurrent execution slots. Tasks queue up when all slots are occupied |
| **MCP Profile** | A named, reusable MCP server configuration (stored in SQLite) that tasks can reference by name |

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Monolithic server | Simplest for v1. Clean interfaces allow extraction to microservices later |
| API layer | REST API + CLI + TypeScript SDK | Maximum flexibility for different consumers |
| HTTP framework | Hono + @hono/node-server | Fast, lightweight, excellent TS/Zod integration |
| Containers | Docker first, K8s later | Docker SDK (dockerode) for v1, abstract executor interface supports K8s later |
| Auth/Keys | Per-request API key (BYK) | User passes Anthropic key per request. Server auth deferred to v2 |
| Persistence | SQLite (better-sqlite3) + disk | No external DB needed. Drizzle ORM for type-safe queries |
| Concurrency | Bounded parallel worker pool | Configurable max concurrent tasks (default: 3-5) |
| File input | Zip upload + git URL | Covers ad-hoc files and repo-based tasks |
| MCP config | Inline per-request + named profiles | Profiles for convenience, inline for flexibility |
| Reuse | claude-code-manager as dependency | Build orchestration on top, improvements flow back |

## 4. API Design

### Endpoints

```
POST   /tasks                  Create a new task
GET    /tasks                  List tasks (with filtering)
GET    /tasks/:id              Get task status and result
DELETE /tasks/:id              Cancel a running task
GET    /tasks/:id/artifacts    Download task artifacts as zip
GET    /tasks/:id/logs         Stream task logs (SSE)

POST   /mcp-profiles           Create an MCP profile
GET    /mcp-profiles           List MCP profiles
GET    /mcp-profiles/:id       Get MCP profile
DELETE /mcp-profiles/:id       Delete MCP profile

GET    /health                 Server health + worker pool status
```

### Task Creation Request

```typescript
{
  // Required
  prompt: string;
  apiKey: string;                  // User's Anthropic API key (BYK)

  // Optional: structured output
  schema?: JsonSchema;             // JSON Schema for result validation

  // Optional: execution config
  mode?: "process" | "container";  // Default: "process"
  timeout?: number;                // Max execution time in seconds
  model?: string;                  // Claude model to use
  permissionMode?: string;         // Claude permission mode

  // Optional: project files
  files?: {
    type: "zip" | "git";
    zipUpload?: File;              // Multipart upload
    gitUrl?: string;
    gitRef?: string;               // Branch, tag, or commit
  };

  // Optional: MCP servers
  mcpServers?: {
    inline?: McpServerConfig[];    // Inline MCP config
    profiles?: string[];           // Named profile IDs
  };

  // Optional: metadata
  tags?: Record<string, string>;   // User-defined tags for filtering
}
```

### Task Response

```typescript
{
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  result?: {
    data: unknown;                 // Structured output (matches schema)
    valid: boolean;                // Schema validation passed
  };
  error?: {
    code: string;
    message: string;
  };

  mode: "process" | "container";
  duration?: number;               // Execution time in ms
  tags?: Record<string, string>;
}
```

### Authentication (v1)

The `apiKey` field in each request is the user's Anthropic API key, passed to the Claude CLI as `ANTHROPIC_API_KEY` env var. The swarm server itself doesn't authenticate requests (assumes trusted network or gateway). User account auth is deferred to v2.

## 5. Architecture

```
+-------------------------------------------------------------+
|                      claude-swarm                            |
|                                                              |
|  +-------------------------------------------------------+  |
|  |                   API Layer (Hono)                     |  |
|  |  routes/tasks  routes/mcp-profiles  routes/health      |  |
|  |  middleware: validate(zod), error-handler, logger       |  |
|  +------------------------+------------------------------+  |
|                           |                                  |
|  +------------------------v------------------------------+  |
|  |                  Service Layer                         |  |
|  |  TaskService    McpProfileService    HealthService     |  |
|  +----------+--------------------------------------------+  |
|             |                                                |
|  +----------v----------+  +------------------------------+  |
|  |     Scheduler       |  |      Storage Layer           |  |
|  |  - task queue       |  |  TaskStore (SQLite)          |  |
|  |  - worker pool      |  |  McpProfileStore (SQLite)    |  |
|  |  - concurrency ctrl |  |  ArtifactStore (disk)        |  |
|  +----------+----------+  +------------------------------+  |
|             |                                                |
|  +----------v--------------------------------------------+  |
|  |              Executor Layer (strategy pattern)         |  |
|  |  ProcessExecutor          ContainerExecutor            |  |
|  |  (claude-code-manager)    (dockerode)                  |  |
|  +-------------------------------------------------------+  |
|                                                              |
|  +-------------------------------------------------------+  |
|  |              Workspace Manager                         |  |
|  |  - creates isolated work dirs per task                 |  |
|  |  - extracts zip uploads / clones git repos             |  |
|  |  - writes MCP config (.claude.json)                    |  |
|  |  - collects artifacts after execution                  |  |
|  |  - cleanup                                             |  |
|  +-------------------------------------------------------+  |
+--------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| **API Layer** | HTTP routing, Zod request validation, response serialization, SSE for log streaming |
| **TaskService** | Business logic: create task, validate inputs, enqueue, cancel, query results |
| **Scheduler** | Bounded async queue with in-memory priority queue backed by SQLite for crash recovery |
| **ProcessExecutor** | Wraps claude-code-manager. Sets ANTHROPIC_API_KEY env, calls ClaudeCodeManager.execute() |
| **ContainerExecutor** | Builds/pulls Docker image, mounts workspace volume, runs container, collects output |
| **WorkspaceManager** | Creates /data/workspaces/task-{id}/ dirs, handles zip/git, writes .claude.json, collects artifacts |
| **Storage** | SQLite via better-sqlite3 + drizzle-orm for task metadata and MCP profiles. Disk for artifacts |
| **CLI** | Thin REST client wrapper using commander. Reads config from ~/.claude-swarm/config.json |
| **SDK** | TypeScript client library: ClaudeSwarm class with typed methods |

## 6. Data Flow

### Process Mode (happy path)

1. Client -> POST /tasks { prompt, apiKey, schema, files: { type: "zip", zipUpload } }
2. API validates request with Zod
3. TaskService creates task record in SQLite (status: "queued")
4. WorkspaceManager creates /data/workspaces/task-{id}/, extracts zip, writes .claude.json
5. Scheduler enqueues task. Returns task ID to client (202 Accepted)
6. Worker slot available -> Scheduler dispatches to ProcessExecutor
7. ProcessExecutor sets ANTHROPIC_API_KEY env, calls claude-code-manager execute()
8. Claude CLI runs, produces structured output
9. ProcessExecutor validates result, collects artifacts, updates SQLite (status: "completed")
10. Client polls GET /tasks/:id -> gets result

### Container Mode

Steps 1-5 same, then:

6. ContainerExecutor ensures base image exists
7. Creates container with workspace bind mount and env vars
8. Container runs Claude CLI, writes result to /workspace/result.json
9. ContainerExecutor reads result, validates, updates SQLite
10. Container removed (cleanup)

### MCP Configuration

WorkspaceManager writes `.claude.json` in workspace root:

```json
{
  "mcpServers": {
    "my-postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."],
      "env": {}
    }
  }
}
```

Claude CLI auto-discovers this config when running in the workspace directory.

### Error Handling

| Error | Behavior |
|---|---|
| Task timeout | Kill process/container, mark `failed` with `TIMEOUT` code |
| Claude CLI crash | Capture stderr, mark `failed` with `PROCESS_ERROR` |
| Schema validation failure | Mark `failed` with `VALIDATION_ERROR`, include raw output |
| Docker unavailable | Reject container-mode tasks with 503 |
| Worker pool full | Task stays `queued`, client gets 202 with queue position |

## 7. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| HTTP server | Hono + @hono/node-server | Fast, lightweight, excellent TS/Zod integration |
| Validation | Zod + @hono/zod-openapi | Shared schemas for API, SDK, and Claude output |
| Database | better-sqlite3 + drizzle-orm | Synchronous SQLite, type-safe queries, zero config |
| Docker | dockerode | Well-maintained Docker SDK for Node.js |
| Zip handling | adm-zip | Simple zip extract, no native deps |
| Git cloning | simple-git | Lightweight git wrapper |
| CLI | commander | Standard CLI framework |
| Process execution | claude-code-manager (dependency) | Reuse existing Claude CLI wrapper |
| Logging | pino | Fast structured logging |
| Testing | vitest | Fast, native ESM support |

## 8. Project Structure

```
claude-swarm/
├── package.json
├── tsconfig.json
├── Dockerfile                    # Runner container image
├── docker-compose.yml            # Dev: server + test containers
├── src/
│   ├── index.ts                  # Entry point
│   ├── config.ts                 # Env-based config
│   ├── server.ts                 # Hono app setup
│   ├── api/
│   │   ├── routes/
│   │   │   ├── tasks.ts
│   │   │   ├── mcp-profiles.ts
│   │   │   └── health.ts
│   │   ├── middleware/
│   │   │   ├── error-handler.ts
│   │   │   └── logger.ts
│   │   └── schemas/
│   │       ├── task.schema.ts
│   │       └── mcp-profile.schema.ts
│   ├── services/
│   │   ├── task.service.ts
│   │   ├── mcp-profile.service.ts
│   │   └── health.service.ts
│   ├── scheduler/
│   │   ├── scheduler.ts
│   │   └── worker.ts
│   ├── executors/
│   │   ├── executor.interface.ts
│   │   ├── process.executor.ts
│   │   └── container.executor.ts
│   ├── workspace/
│   │   ├── workspace-manager.ts
│   │   └── artifact-collector.ts
│   ├── storage/
│   │   ├── database.ts
│   │   ├── task.store.ts
│   │   └── mcp-profile.store.ts
│   └── shared/
│       ├── types.ts
│       └── errors.ts
├── cli/
│   ├── index.ts
│   └── commands/
│       ├── run.ts
│       ├── status.ts
│       └── list.ts
├── sdk/
│   ├── index.ts
│   └── client.ts
├── docker/
│   └── runner/
│       ├── Dockerfile
│       └── entrypoint.sh
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── data/                         # Runtime (gitignored)
    ├── swarm.db
    └── workspaces/
```

## 9. Not in v1

- User accounts / server authentication
- Kubernetes execution mode
- Task iteration / conversation
- Web UI dashboard
- Rate limiting
- Billing / usage tracking
