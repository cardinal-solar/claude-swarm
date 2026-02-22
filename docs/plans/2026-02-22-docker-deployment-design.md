# Docker Deployment Design

**Date**: 2026-02-22
**Status**: Approved

## Overview

Prepare claude-swarm for deployment on EC2 (Amazon Linux 2) using Docker and docker-compose, with images pushed to a private Docker Hub registry. Cloudflare Zero Trust handles SSL and authentication upstream.

## Architecture

Single container running the Hono server + embedded React dashboard. SQLite database persisted via Docker volume. No reverse proxy needed (Cloudflare Zero Trust handles SSL/auth).

## Dockerfile — Multi-stage Build

### Stage 1: builder (node:20-slim)
- Install all dependencies (dev + prod)
- Compile TypeScript (`tsc`)
- Build web dashboard (`vite build`)

### Stage 2: production (node:20-slim)
- Copy compiled `dist/` and `web/dist/` from builder
- Install only production dependencies (for native bindings like better-sqlite3)
- Run as non-root user
- Expose port 3030 (default)
- Health check on `/api/health`

**Why node:20-slim (not alpine)**: better-sqlite3 requires native compilation. Slim uses glibc which avoids musl compatibility issues and doesn't require extra build tools.

## docker-compose.yml

- Single service: `claude-swarm`
- Volume: `./data:/app/data` for SQLite persistence
- Env file: `.env` (not committed to git)
- Restart policy: `unless-stopped`
- Health check: `curl -f http://localhost:3030/api/health`

## Files Created/Modified

1. `Dockerfile` — multi-stage optimized build
2. `.dockerignore` — exclude node_modules, .git, data, tests
3. `docker-compose.yml` — production config with env file
4. `.env.example` — template for environment variables
5. `package.json` — add `docker:build` and `docker:push` scripts

## Registry

Docker Hub (private). Image tagged as:
- `<username>/claude-swarm:latest`
- `<username>/claude-swarm:<version>`

## EC2 Deployment Flow

1. SSH into EC2 (Amazon Linux 2)
2. Install Docker + docker-compose
3. `docker login` to Docker Hub
4. Pull image + run with docker-compose
5. Cloudflare Zero Trust tunnel points to EC2:3030
