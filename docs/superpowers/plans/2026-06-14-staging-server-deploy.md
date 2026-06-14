# Staging Server Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Docker-based staging deployment files so the API can run behind aaPanel/nginx at `api-staging.yourtoken.work`.

**Architecture:** Build only the Nest API into a production image, run API/PostgreSQL/Redis through Docker Compose, and expose the API only on `127.0.0.1:3000` for nginx reverse proxy. Keep all secrets in `/opt/tokenmarket/secrets/api-server.env`.

**Tech Stack:** Docker, Docker Compose, Node.js 22, pnpm, NestJS, Prisma, PostgreSQL 16, Redis 7, aaPanel/nginx.

---

## Task 1: API Docker Image

**Files:**
- Create: `apps/api-server/Dockerfile`
- Create: `.dockerignore`

- [x] Step 1: Add multi-stage Dockerfile for API build and runtime.
- [x] Step 2: Include Prisma generated client, migrations, seed build output, and runtime app files.
- [x] Step 3: Exclude local-only files from the Docker build context.

## Task 2: Staging Compose

**Files:**
- Create: `infra/docker-compose.staging.yml`
- Create: `infra/staging.env.example`

- [x] Step 1: Add API, PostgreSQL, and Redis services.
- [x] Step 2: Bind API to `127.0.0.1:3000` only.
- [x] Step 3: Keep secrets in `/opt/tokenmarket/secrets/api-server.env`.

## Task 3: Deployment Runbook

**Files:**
- Create: `docs/runbooks/staging-server-deploy.md`

- [x] Step 1: Document aaPanel/nginx assumptions.
- [x] Step 2: Document server env preparation, compose startup, migration, seed, and HTTPS verification.
- [x] Step 3: Include troubleshooting for 502 and login failures.
