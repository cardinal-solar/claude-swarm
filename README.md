# claude-code-ops

Claude-Code-as-a-Service platform. Run Claude Code instances via REST API, TypeScript SDK, or CLI.

Submit prompts, get structured results, manage workspaces and artifacts — with a bounded worker pool handling concurrency.

## Quick Start

```bash
npm install
npm run build

# Start the server
npm start

# Or via CLI
npx claude-ops start --port 3000
```

### Docker

```bash
docker compose up
```

## Architecture

Monolithic [Hono](https://hono.dev) server with:

- **Bounded worker pool** — configurable max concurrency
- **SQLite persistence** — via Drizzle ORM + better-sqlite3
- **Strategy-pattern executors** — `process` (spawns `claude` CLI) or `container` (Docker via dockerode)
- **Per-task workspaces** — file isolation, artifact collection, MCP config injection

## API

All endpoints are prefixed with `/api`.

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tasks` | Create a task |
| `GET` | `/api/tasks` | List tasks (optional `?status=` filter) |
| `GET` | `/api/tasks/:id` | Get task by ID |
| `GET` | `/api/tasks/:id/artifacts` | List task artifacts |
| `GET` | `/api/tasks/:id/artifacts/*` | Download a specific artifact |
| `DELETE` | `/api/tasks/:id` | Cancel a task |

#### Create Task

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a hello world function in TypeScript",
    "apiKey": "sk-ant-...",
    "mode": "process",
    "model": "claude-sonnet-4-6",
    "timeout": 60000,
    "tags": { "project": "demo" }
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | `string` | yes | The prompt for Claude |
| `apiKey` | `string` | yes | Anthropic API key (BYO key) |
| `mode` | `"process" \| "container"` | no | Execution mode (default: `process`) |
| `model` | `string` | no | Model to use |
| `schema` | `object` | no | JSON Schema for structured output |
| `timeout` | `number` | no | Timeout in ms |
| `permissionMode` | `string` | no | Claude Code permission mode |
| `files` | `object` | no | Workspace files (`{ type: "zip" \| "git", gitUrl?, gitRef? }`) |
| `mcpServers` | `object` | no | MCP servers (`{ inline?, profiles? }`) |
| `tags` | `Record<string, string>` | no | Arbitrary metadata |

**Task statuses:** `queued` → `running` → `completed` | `failed` | `cancelled`

### MCP Profiles

Reusable MCP server configurations that can be attached to tasks.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/mcp-profiles` | Create a profile |
| `GET` | `/api/mcp-profiles` | List all profiles |
| `GET` | `/api/mcp-profiles/:id` | Get profile by ID |
| `DELETE` | `/api/mcp-profiles/:id` | Delete a profile |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health + scheduler status |

## CLI

```bash
npx claude-ops <command>
```

| Command | Description |
|---------|-------------|
| `start` | Start the server (`-p/--port`, `-H/--host`, `--max-concurrency`, `--data-dir`) |
| `run` | Submit a task (`-p/--prompt`, `-k/--api-key`, `-m/--mode`, `--wait`) |
| `status` | Check task status by ID |
| `list` | List tasks |

```bash
# Submit a task and wait for the result
npx claude-ops run \
  -p "Explain the Liskov Substitution Principle" \
  -k sk-ant-... \
  --wait
```

## SDK

```typescript
import { ClaudeOps } from 'claude-code-ops/sdk';

const client = new ClaudeOps({ baseUrl: 'http://localhost:3000' });

const task = await client.createTask({
  prompt: 'Write a quicksort implementation in Python',
  apiKey: 'sk-ant-...',
});

const result = await client.waitForCompletion(task.id);
console.log(result.result?.data);
```

**SDK methods:**

- `createTask(input)` — submit a task
- `getTask(id)` — get task details
- `listTasks(filter?)` — list tasks
- `cancelTask(id)` — cancel a running task
- `waitForCompletion(id, pollIntervalMs?)` — poll until done
- `createMcpProfile(input)` — create an MCP profile
- `listMcpProfiles()` — list all profiles
- `deleteMcpProfile(id)` — delete a profile

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `MAX_CONCURRENCY` | `3` | Max concurrent tasks |
| `DEFAULT_TIMEOUT` | `600000` | Default task timeout (ms) |
| `DEFAULT_MODE` | `process` | Default execution mode |
| `DATA_DIR` | `./data` | Data directory |
| `DB_PATH` | `<DATA_DIR>/swarm.db` | SQLite database path |
| `WORKSPACES_DIR` | `<DATA_DIR>/workspaces` | Task workspace directory |
| `LOG_LEVEL` | `info` | Log level (pino) |

## Development

```bash
npm run dev        # watch mode (tsx)
npm test           # vitest watch
npm run test:run   # vitest single run
npm run build      # tsc
```

## License

MIT
