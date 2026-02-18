# Claude Swarm Web UI - Design Document

**Date:** 2026-02-19
**Status:** Approved

## Vision

Ops dashboard for monitoring and managing a claude-swarm instance. React + Vite + shadcn/ui served by Hono.

## Decisions

| Decision | Choice |
|---|---|
| Purpose | Ops dashboard (monitoring/management) |
| Framework | React + Vite |
| Component library | shadcn/ui (Tailwind CSS) |
| Deployment | Built to static, served by Hono at /app |
| Real-time | Polling (5s tasks, 10s health) |
| API prefix | Move existing routes under /api |

## Pages

| Page | Route | Purpose |
|---|---|---|
| Tasks | /app | Data table with status badges, filtering, sorting |
| Task Detail | /app/tasks/:id | Full info: prompt, result, error, logs, artifacts |
| MCP Profiles | /app/profiles | CRUD list with inline create/delete |
| Health | /app/health | KPI cards: running, queued, capacity, uptime |

## Key Components

- **TaskTable**: Sortable columns (status, created, duration, prompt). Status badges (queued=gray, running=blue, completed=green, failed=red, cancelled=yellow).
- **TaskDetail**: Full prompt, JSON result (syntax highlighted), error, artifacts.
- **HealthCards**: KPI cards for scheduler status.
- **ProfileList**: Table with create dialog and delete button.
- **Layout**: Sidebar navigation (Tasks, Profiles, Health).

## Project Structure

```
web/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── ui/           # shadcn/ui
│   │   ├── layout/       # Sidebar, Header
│   │   ├── tasks/        # TaskTable, TaskDetail, StatusBadge
│   │   ├── profiles/     # ProfileList, ProfileForm
│   │   └── health/       # HealthCards
│   ├── pages/
│   │   ├── TasksPage.tsx
│   │   ├── TaskDetailPage.tsx
│   │   ├── ProfilesPage.tsx
│   │   └── HealthPage.tsx
│   ├── hooks/
│   │   ├── useApi.ts
│   │   ├── useTasks.ts
│   │   ├── useProfiles.ts
│   │   └── useHealth.ts
│   └── lib/
│       └── api-client.ts
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

## Backend Changes

1. Move routes: `/tasks` -> `/api/tasks`, `/mcp-profiles` -> `/api/mcp-profiles`, `/health` -> `/api/health`
2. Add Hono static file middleware for `web/dist/` at `/app`
3. Add redirect: `GET /` -> `/app`
4. Vite dev proxy: `/api` -> `http://localhost:3000`

## Data Flow

```
Browser -> GET /app/* -> Hono serves React SPA
React -> GET /api/tasks (poll 5s) -> JSON
React -> GET /api/health (poll 10s) -> JSON
```
