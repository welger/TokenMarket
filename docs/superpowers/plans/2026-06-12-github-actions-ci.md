# GitHub Actions 完整 CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 TokenMarket 配置自动执行 lint、单元测试、构建和完整端到端测试的 GitHub Actions 工作流。

**Architecture:** 使用单个 CI 工作流承载并行的 `Quality` 和 `E2E` 任务。两个任务各自启动一次性 PostgreSQL 16 与 Redis 7 service containers，使用固定的无权限测试环境变量，并在运行测试前部署 Prisma migration。E2E 任务内的全部 suites 共享该任务的一套一次性数据库，因此完整 E2E 使用 `--runInBand` 串行运行，避免并发修改共享数据。`NODE_ENV` 仅在测试和构建步骤中按用途设置，避免测试环境污染 Vite 生产构建。

**Tech Stack:** GitHub Actions、Node.js 22、pnpm 10、PostgreSQL 16、Redis 7、Prisma 7、Jest、Vitest

---

### Task 1：创建完整 CI 工作流

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1：创建工作流目录和文件**

新增 `.github/workflows/ci.yml`，内容如下：

```yaml
name: CI

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

env:
  DATABASE_URL: postgresql://gateway:gateway_ci@127.0.0.1:5432/gateway
  REDIS_URL: redis://127.0.0.1:6379
  JWT_ACCESS_SECRET: ci-jwt-secret-not-for-production-123456
  API_KEY_PEPPER: ci-api-key-pepper-not-for-production-123
  AUDIT_IP_HASH_SECRET: ci-audit-ip-secret-not-for-production-123
  ADMIN_LOGIN_THROTTLE_SECRET: ci-login-throttle-secret-not-for-production
  TRUST_PROXY_CIDRS: ""
  UPSTREAM_BASE_URL: http://127.0.0.1:4010/v1
  UPSTREAM_DEFAULT_MODEL: test-model
  PAYMENT_DRIVER: test

jobs:
  quality:
    name: Quality
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: gateway
          POSTGRES_PASSWORD: gateway_ci
          POSTGRES_DB: gateway
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U gateway -d gateway"
          --health-interval=5s
          --health-timeout=3s
          --health-retries=10
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=5s
          --health-timeout=3s
          --health-retries=10
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Set up pnpm
        uses: pnpm/action-setup@v6
        with:
          version: 10.34.2
      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Apply database migrations
        run: pnpm --filter api-server prisma migrate deploy
      - name: Lint
        run: pnpm lint
      - name: Test
        env:
          NODE_ENV: test
        run: |
          pnpm --filter api-server test --runInBand
          pnpm --filter @gateway/contracts test
          pnpm --filter @gateway/admin-web test
          pnpm --filter miniapp test
      - name: Build
        run: pnpm build
        env:
          NODE_ENV: production

  e2e:
    name: E2E
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: gateway
          POSTGRES_PASSWORD: gateway_ci
          POSTGRES_DB: gateway
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U gateway -d gateway"
          --health-interval=5s
          --health-timeout=3s
          --health-retries=10
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=5s
          --health-timeout=3s
          --health-retries=10
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Set up pnpm
        uses: pnpm/action-setup@v6
        with:
          version: 10.34.2
      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Apply database migrations
        run: pnpm --filter api-server prisma migrate deploy
      - name: Run E2E tests
        run: pnpm --filter api-server test:e2e --runInBand
        env:
          NODE_ENV: test
          WECHAT_AUTH_E2E_DATABASE_URL: postgresql://gateway:gateway_ci@127.0.0.1:5432/gateway
          WECHAT_AUTH_E2E_REDIS_URL: redis://127.0.0.1:6379/15
```

成功标志：文件只包含测试凭据，不引用 GitHub Secrets，不使用 `pull_request_target`，任务名称固定为 `Quality` 和 `E2E`。CI 的 `TRUST_PROXY_CIDRS` 保持为空，不信任任何代理。WeChat 认证 E2E 的专用连接变量只指向 `localhost` 或 `127.0.0.1`，测试应用单独使用 `loopback`。

- [ ] **Step 2：检查 YAML 和敏感字段**

运行：

```bash
git diff --check
rg -n "pull_request_target|secrets\\.|UPSTREAM_API_KEY|APP_SECRET|PRIVATE_KEY" .github/workflows/ci.yml
```

预期：

- `git diff --check` 退出码为 `0`。
- `rg` 不输出任何匹配项并以退出码 `1` 结束，表示未发现禁用字段。

### Task 2：执行本地等价验证

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `apps/api-server/prisma/migrations/*`

- [ ] **Step 1：确认本地测试服务运行**

运行：

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

风险：命令占用本机 `127.0.0.1:5432` 和 `127.0.0.1:6379`，并启动本地开发容器。

预期：`postgres` 和 `redis` 均显示 `healthy`。

- [ ] **Step 2：执行 migration 和质量任务**

加载本地 `.env` 后运行：

```bash
pnpm --filter api-server prisma migrate deploy
pnpm lint
NODE_ENV=test pnpm --filter api-server test --runInBand
NODE_ENV=test pnpm --filter @gateway/contracts test
NODE_ENV=test pnpm --filter @gateway/admin-web test
NODE_ENV=test pnpm --filter miniapp test
NODE_ENV=production pnpm build
```

风险：migration 会修改 `DATABASE_URL` 指向的数据库；执行前必须确认它是本地开发库。

预期：所有命令退出码均为 `0`。

- [ ] **Step 3：执行完整 E2E**

运行：

```bash
WECHAT_AUTH_E2E_DATABASE_URL=postgresql://gateway:gateway_local@127.0.0.1:5432/gateway_wechat_auth_e2e \
WECHAT_AUTH_E2E_REDIS_URL=redis://127.0.0.1:6379/15 \
NODE_ENV=test pnpm --filter api-server test:e2e --runInBand
```

风险：命令会连接本机专用 E2E 数据库和 Redis 逻辑库；运行前必须先创建并迁移 `gateway_wechat_auth_e2e`，不得把变量指向共享或生产资源。

预期：WeChat 认证 E2E 在启动前校验连接主机名，全部端到端测试串行通过，命令退出码为 `0`。

### Task 3：提交并发布 Pull Request

**Files:**
- Add: `.github/workflows/ci.yml`
- Add: `docs/superpowers/specs/2026-06-12-github-actions-ci-design.md`
- Add: `docs/superpowers/plans/2026-06-12-github-actions-ci.md`

- [ ] **Step 1：提交工作流和文档**

运行：

```bash
git add .github/workflows/ci.yml docs/superpowers/specs/2026-06-12-github-actions-ci-design.md docs/superpowers/plans/2026-06-12-github-actions-ci.md
git commit -m "ci: add full pull request validation"
```

预期：提交成功，`.pnpm-store/` 不在提交内容中。

- [ ] **Step 2：推送功能分支**

运行：

```bash
git push -u origin ci/full-validation
```

风险：该命令会修改 GitHub 远程仓库并触发远程 Actions。

预期：GitHub 创建远程 `ci/full-validation` 分支。

- [ ] **Step 3：创建 Pull Request**

运行：

```bash
gh pr create \
  --repo welger/TokenMarket \
  --base main \
  --head ci/full-validation \
  --title "[codex] add full GitHub Actions CI" \
  --body "Adds parallel Quality and E2E checks with isolated PostgreSQL and Redis services."
```

预期：命令返回新的 Pull Request URL。

### Task 4：验证 GitHub Actions

**Files:**
- Verify: `.github/workflows/ci.yml`

- [ ] **Step 1：等待检查完成**

运行：

```bash
gh pr checks --repo welger/TokenMarket --watch
```

预期：`Quality` 和 `E2E` 均显示 `pass`。

- [ ] **Step 2：检查失败日志并修复**

若任一任务失败，运行：

```bash
gh run list --repo welger/TokenMarket --branch ci/full-validation --limit 5
failed_run_id="$(gh run list \
  --repo welger/TokenMarket \
  --branch ci/full-validation \
  --status failure \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')"
gh run view "$failed_run_id" --repo welger/TokenMarket --log-failed
```

根据实际错误做最小修复，重新执行本地相关命令后提交并推送。

预期：不通过重跑掩盖错误，最终两个任务都通过。

### Task 5：合并并启用分支状态检查

**Files:**
- No repository file changes.

- [ ] **Step 1：通过 Pull Request 合并**

在两个检查通过后运行：

```bash
pr_number="$(gh pr view \
  --repo welger/TokenMarket \
  --json number \
  --jq '.number')"
gh pr merge "$pr_number" --repo welger/TokenMarket --merge
```

风险：该命令会修改受保护的远程 `main`。执行前再次确认 PR 编号、检查结果和合并状态。

预期：Pull Request 状态变为 `MERGED`。

- [ ] **Step 2：同步本地 main**

运行：

```bash
git switch main
git pull --ff-only origin main
```

预期：本地 `main` 指向 GitHub 合并提交，`.pnpm-store/` 仍未被跟踪。

- [ ] **Step 3：将 CI 检查加入 MainRules**

在 GitHub 的 `Settings → Rules → Rulesets → MainRules` 中启用 `Require status checks to pass`，添加：

- `Quality`
- `E2E`

风险：该设置会阻止未通过 CI 的 Pull Request 合并。只有在两个检查已真实出现并成功运行后才能启用。

预期：后续 Pull Request 必须同时通过 `Quality` 和 `E2E` 才能合并到 `main`。
