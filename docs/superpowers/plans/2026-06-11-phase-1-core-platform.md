# 阶段一：核心平台与运营后台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成可本地运行的 NestJS API、PostgreSQL/Redis 基础设施和 React 运营后台，并跑通测试套餐、API Key、兼容模型调用、字符计费、日志和订单。

**Architecture:** 使用 pnpm workspace 管理应用和共享契约。NestJS 采用模块化单体，Prisma 管理 PostgreSQL，BullMQ/Redis 处理补偿任务；管理后台只调用 `/admin/*` 接口。上游模型通过 `ProviderClient` 接口隔离，首版提供 OpenAI 兼容实现和内存测试实现。

**Tech Stack:** Node.js 22+、pnpm、TypeScript、NestJS、Prisma、PostgreSQL、Redis、BullMQ、React、Vite、Ant Design、Jest、Supertest、Vitest、Docker Compose。

---

## 文件结构

```text
payment/
  apps/
    api-server/
      prisma/schema.prisma
      src/
        app.module.ts
        common/
        auth/
        users/
        providers/
        models/
        plans/
        api-keys/
        gateway/
        metering/
        orders/
        compliance/
        risk/
        audit/
      test/
    admin-web/
      src/
        api/
        auth/
        layouts/
        pages/
  packages/
    contracts/src/
  infra/
    docker-compose.yml
  package.json
  pnpm-workspace.yaml
```

## Task 1：初始化单仓库和本地基础设施

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `infra/docker-compose.yml`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: 写工作区配置**

```json
{
  "name": "multi-model-api-platform",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "dev": "pnpm --parallel --filter ./apps/* dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "engines": { "node": ">=22" }
}
```

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 2: 写 Docker Compose**

`infra/docker-compose.yml` 只开放本机端口：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: gateway
      POSTGRES_PASSWORD: gateway_local
      POSTGRES_DB: gateway
    ports: ["127.0.0.1:5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gateway"]
      interval: 5s
      timeout: 3s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["127.0.0.1:6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
```

- [ ] **Step 3: 写无秘密的环境变量样例**

```dotenv
DATABASE_URL=postgresql://gateway:gateway_local@127.0.0.1:5432/gateway
REDIS_URL=redis://127.0.0.1:6379
JWT_ACCESS_SECRET=replace-with-at-least-32-random-characters
API_KEY_PEPPER=replace-with-a-separate-random-secret
UPSTREAM_BASE_URL=http://127.0.0.1:4010/v1
UPSTREAM_API_KEY=configure-only-in-local-env
UPSTREAM_DEFAULT_MODEL=test-model
PAYMENT_DRIVER=test
```

- [ ] **Step 4: 安装依赖并初始化 Git**

Run:

```bash
git init
corepack enable
pnpm install
docker compose -f infra/docker-compose.yml up -d
```

Expected: `git status` 可用，PostgreSQL 和 Redis healthcheck 为 healthy。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json infra .env.example .gitignore
git commit -m "chore: bootstrap platform workspace"
```

## Task 2：建立共享契约和统一错误格式

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/errors.ts`
- Create: `packages/contracts/src/models.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/errors.test.ts`

- [ ] **Step 1: 先写错误码测试**

```ts
import { errorResponse, ErrorCode } from './errors';

it('returns a stable public error shape', () => {
  expect(errorResponse(ErrorCode.API_KEY_DISABLED, 'req_1')).toEqual({
    error: {
      code: 'API_KEY_DISABLED',
      message: 'API Key 已停用',
      requestId: 'req_1',
    },
  });
});
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm --filter @gateway/contracts test`

Expected: FAIL，提示 `errors` 模块不存在。

- [ ] **Step 3: 实现固定错误契约**

```ts
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  API_KEY_DISABLED = 'API_KEY_DISABLED',
  QUOTA_EXHAUSTED = 'QUOTA_EXHAUSTED',
  MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  CONTENT_REJECTED = 'CONTENT_REJECTED',
  UPSTREAM_TIMEOUT = 'UPSTREAM_TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

const messages: Record<ErrorCode, string> = {
  UNAUTHORIZED: '未授权访问',
  API_KEY_DISABLED: 'API Key 已停用',
  QUOTA_EXHAUSTED: '套餐额度不足',
  MODEL_UNAVAILABLE: '模型暂不可用',
  RATE_LIMITED: '请求过于频繁',
  CONTENT_REJECTED: '请求违反内容安全规则',
  UPSTREAM_TIMEOUT: '上游模型响应超时',
  INTERNAL_ERROR: '服务暂时不可用',
};

export function errorResponse(code: ErrorCode, requestId: string) {
  return { error: { code, message: messages[code], requestId } };
}
```

- [ ] **Step 4: 添加模型、套餐、用量和订单 DTO 并导出**

公开 DTO 不包含 `passwordHash`、Key 哈希、上游密钥或完整提示词。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter @gateway/contracts test`

Expected: PASS。

```bash
git add packages/contracts
git commit -m "feat: add shared API contracts"
```

## Task 3：创建 NestJS 应用、配置校验和数据库模型

**Files:**
- Create: `apps/api-server/package.json`
- Create: `apps/api-server/src/main.ts`
- Create: `apps/api-server/src/app.module.ts`
- Create: `apps/api-server/src/common/config/env.schema.ts`
- Create: `apps/api-server/src/common/prisma/prisma.service.ts`
- Create: `apps/api-server/prisma/schema.prisma`
- Create: `apps/api-server/src/common/config/env.schema.spec.ts`

- [ ] **Step 1: 写配置校验失败测试**

```ts
it('rejects short secrets', () => {
  expect(() => validateEnv({
    DATABASE_URL: 'postgresql://x',
    REDIS_URL: 'redis://x',
    JWT_ACCESS_SECRET: 'short',
    API_KEY_PEPPER: 'short',
  })).toThrow();
});
```

- [ ] **Step 2: 实现 Joi 配置校验**

要求 `JWT_ACCESS_SECRET` 和 `API_KEY_PEPPER` 至少 32 字符；生产环境禁止 `PAYMENT_DRIVER=test`。

- [ ] **Step 3: 定义 Prisma 核心模型**

`schema.prisma` 至少包含：

```prisma
enum UserStatus { ACTIVE SUSPENDED DELETED }
enum ApiKeyStatus { ACTIVE DISABLED }
enum OrderStatus {
  PENDING_PAYMENT PAID FULFILLED CANCELLED
  REFUND_PENDING REFUNDED REFUND_REJECTED
}

model User {
  id          String       @id @default(cuid())
  wechatOpenId String?      @unique
  status      UserStatus   @default(ACTIVE)
  apiKeys     ApiKey[]
  entitlements UserPlan[]
  orders      Order[]
  createdAt   DateTime     @default(now())
}

model ApiKey {
  id         String       @id @default(cuid())
  userId     String
  name       String
  prefix     String
  lastFour   String
  secretHash String       @unique
  status     ApiKeyStatus @default(ACTIVE)
  user       User         @relation(fields: [userId], references: [id])
  createdAt  DateTime     @default(now())
  disabledAt DateTime?
}
```

同时定义 `AdminUser`、`Provider`、`Model`、`Plan`、`UserPlan`、`UsageLedger`、`ApiCall`、`Order`、`ComplianceProfile`、`AuditLog`，并为用户、时间和状态查询建立索引。

- [ ] **Step 4: 迁移数据库**

Run:

```bash
pnpm --filter api-server prisma generate
pnpm --filter api-server prisma migrate dev --name init
pnpm --filter api-server test
```

Expected: migration 成功，配置测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api-server
git commit -m "feat: add API server foundation and schema"
```

## Task 4：实现管理员认证、RBAC 和审计

**Files:**
- Create: `apps/api-server/src/auth/admin-auth.service.ts`
- Create: `apps/api-server/src/auth/admin-auth.controller.ts`
- Create: `apps/api-server/src/auth/roles.guard.ts`
- Create: `apps/api-server/src/audit/audit.service.ts`
- Create: `apps/api-server/src/auth/admin-auth.e2e-spec.ts`

- [ ] **Step 1: 写未授权和角色测试**

```ts
it('blocks anonymous admin requests', () =>
  request(app.getHttpServer()).get('/admin/models').expect(401));

it('blocks support role from changing prices', async () => {
  const token = await loginAs('SUPPORT');
  await request(app.getHttpServer())
    .post('/admin/plans')
    .set('Authorization', `Bearer ${token}`)
    .send(validPlan)
    .expect(403);
});
```

- [ ] **Step 2: 实现管理员登录**

使用 Argon2id 保存密码哈希，JWT 访问令牌有效期 15 分钟；角色为 `OWNER`、`OPERATOR`、`SUPPORT`、`AUDITOR`。

- [ ] **Step 3: 实现审计拦截器**

退款、封禁、改价、模型上下架、生产模式切换必须写入操作者、动作、对象、前后摘要和时间，不记录密码或密钥。

- [x] **Step 4: 验证并提交**

Run: `pnpm --filter api-server test:e2e -- admin-auth.e2e-spec.ts`

Expected: PASS。

```bash
git add apps/api-server/src/auth apps/api-server/src/audit
git commit -m "feat: secure admin access and audit actions"
```

## Task 5：实现模型、供应商和合规配置

**Files:**
- Create: `apps/api-server/src/providers/provider-client.ts`
- Create: `apps/api-server/src/providers/openai-compatible.client.ts`
- Create: `apps/api-server/src/providers/test-provider.client.ts`
- Create: `apps/api-server/src/models/models.service.ts`
- Create: `apps/api-server/src/compliance/compliance.service.ts`
- Create: `apps/api-server/src/compliance/content-policy.service.ts`
- Test: `apps/api-server/src/compliance/compliance.service.spec.ts`
- Test: `apps/api-server/src/compliance/content-policy.service.spec.ts`

- [ ] **Step 1: 写生产门槛测试**

```ts
it('rejects production mode when required disclosure is missing', async () => {
  await expect(service.enableProduction()).rejects.toMatchObject({
    code: 'COMPLIANCE_PROFILE_INCOMPLETE',
  });
});
```

- [ ] **Step 2: 定义供应商边界**

```ts
export interface ProviderClient {
  chat(request: ProviderChatRequest): Promise<ProviderChatResponse>;
  chatStream(request: ProviderChatRequest): AsyncIterable<ProviderChunk>;
  health(): Promise<'UP' | 'DOWN'>;
}
```

OpenAI 兼容实现从环境变量读取 base URL 和 Key；数据库只保存供应商名称、地区、披露文本和路由状态。

- [ ] **Step 3: 实现模型与合规管理接口**

提供 `/admin/models`、`/admin/providers`、`/admin/compliance` 和公开只读 `/public/models`、`/public/compliance`。

- [ ] **Step 4: 实现内容安全规则**

规则按 `enabled`、`category`、`pattern`、`action` 管理；首版支持关键词和正则拦截，命中后只记录规则 ID、分类和请求 ID，不保存命中的完整正文。

```ts
it('returns the matched rule without echoing private input', async () => {
  const result = await service.inspect('包含测试禁词的私人正文');
  expect(result).toMatchObject({ allowed: false, category: 'FRAUD' });
  expect(JSON.stringify(result)).not.toContain('私人正文');
});
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter api-server test -- compliance`

Expected: PASS。

```bash
git add apps/api-server/src/providers apps/api-server/src/models apps/api-server/src/compliance
git commit -m "feat: manage providers models and compliance"
```

## Task 6：实现套餐、订单和测试支付驱动

**Files:**
- Create: `apps/api-server/src/plans/plan-selection.service.ts`
- Create: `apps/api-server/src/orders/order-state-machine.ts`
- Create: `apps/api-server/src/orders/orders.service.ts`
- Create: `apps/api-server/src/orders/payment-driver.ts`
- Create: `apps/api-server/src/orders/test-payment.driver.ts`
- Create: `apps/api-server/src/refunds/refunds.service.ts`
- Create: `apps/api-server/src/invoices/invoices.service.ts`
- Test: `apps/api-server/src/plans/plan-selection.service.spec.ts`
- Test: `apps/api-server/src/orders/order-state-machine.spec.ts`
- Test: `apps/api-server/src/refunds/refunds.service.spec.ts`
- Test: `apps/api-server/src/invoices/invoices.service.spec.ts`

- [x] **Step 1: 写套餐优先级测试**

```ts
it('uses the earliest expiring applicable plan', () => {
  expect(selectPlan([
    plan('later', '2026-08-01'),
    plan('earlier', '2026-07-01'),
  ], 'test-model').id).toBe('earlier');
});
```

- [x] **Step 2: 写订单状态机测试**

```ts
expect(transition('PENDING_PAYMENT', 'PAY')).toBe('PAID');
expect(() => transition('FULFILLED', 'PAY')).toThrow('INVALID_ORDER_TRANSITION');
```

- [x] **Step 3: 实现测试支付驱动**

测试驱动只接受管理员或测试环境调用，支付结果带 `driver: "test"`，接口和页面必须显示“测试支付”，不得生成真实交易号。

- [x] **Step 4: 实现幂等套餐发放**

订单支付和发放在事务内执行；以 `orderId + fulfillmentType` 唯一约束阻止重复发放。

- [x] **Step 5: 实现退款和发票状态流**

退款申请必须引用已支付订单；测试支付只允许测试退款。发票状态固定为 `SUBMITTED -> APPROVED -> ISSUED`，也允许 `SUBMITTED -> REJECTED`；未配置真实开票驱动时禁止进入 `ISSUED`。

```ts
it('does not issue an invoice without a real invoice driver', async () => {
  await expect(invoiceService.issue(invoiceId)).rejects.toThrow('INVOICE_DRIVER_UNAVAILABLE');
});
```

提供用户接口 `/me/orders`、`/me/refunds`、`/me/invoices` 和管理员审核接口。

- [x] **Step 6: 验证并提交**

Run: `pnpm --filter api-server test -- plan-selection order-state-machine refunds invoices`

Expected: PASS。

```bash
git add apps/api-server/src/plans apps/api-server/src/orders apps/api-server/src/refunds apps/api-server/src/invoices
git commit -m "feat: add plans orders and test payments"
```

## Task 7：实现只显示一次的 API Key

**Files:**
- Create: `apps/api-server/src/api-keys/api-key.crypto.ts`
- Create: `apps/api-server/src/api-keys/api-keys.service.ts`
- Create: `apps/api-server/src/api-keys/api-keys.controller.ts`
- Test: `apps/api-server/src/api-keys/api-keys.service.spec.ts`

- [x] **Step 1: 写安全行为测试**

```ts
it('returns plaintext only when creating a key', async () => {
  const created = await service.create(userId, '开发环境');
  expect(created.plaintext).toMatch(/^sk-gw-/);
  const listed = await service.list(userId);
  expect(listed[0]).not.toHaveProperty('plaintext');
  expect(listed[0].masked).toMatch(/^sk-gw-\*{4}/);
});
```

- [x] **Step 2: 实现 Key 生成和哈希**

使用 `crypto.randomBytes(32)`，格式为 `sk-gw_<keyId>_<secret>`；哈希使用 `HMAC-SHA256(API_KEY_PEPPER, plaintext)`，使用恒定时间比较。

- [x] **Step 3: 实现创建、列表和停用接口**

限制每用户最多 10 个活动 Key；停用后缓存立即失效；完整值不写日志和数据库。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter api-server test -- api-keys.service.spec.ts`

Expected: PASS。

```bash
git add apps/api-server/src/api-keys
git commit -m "feat: add secure API key lifecycle"
```

## Task 8：实现网关、字符计量和原子扣减

**Files:**
- Create: `apps/api-server/src/metering/unicode-counter.ts`
- Create: `apps/api-server/src/metering/metering.service.ts`
- Create: `apps/api-server/src/gateway/gateway.controller.ts`
- Create: `apps/api-server/src/gateway/gateway.service.ts`
- Create: `apps/api-server/src/risk/rate-limit.service.ts`
- Test: `apps/api-server/src/metering/unicode-counter.spec.ts`
- Test: `apps/api-server/test/gateway.e2e-spec.ts`

- [ ] **Step 1: 写 Unicode 计量测试**

```ts
expect(countUnicodeCodePoints('A你😀')).toBe(3);
expect(countUnicodeCodePoints('a b\n')).toBe(4);
```

- [ ] **Step 2: 写失败不扣费测试**

```ts
it('does not charge when upstream fails before output', async () => {
  provider.failBeforeOutput();
  await request(server).post('/v1/chat/completions').set(keyHeader).send(body).expect(502);
  expect(await remainingQuota(userId)).toBe(initialQuota);
});
```

- [ ] **Step 3: 实现普通和流式转发**

支持 `/v1/chat/completions` 的普通响应及 SSE；平台模型名映射到上游模型名；所有响应包含 `x-request-id`。

- [ ] **Step 4: 实现事务扣减**

锁定选中的 `UserPlan` 行，验证余额，写入 `UsageLedger` 和 `ApiCall` 后扣减。流式中断按已发送文本计费；计费失败写入 Redis 补偿队列并触发告警。

- [ ] **Step 5: 实现限流和日志脱敏**

按 IP、用户和 Key 三个维度限流；只保存请求元数据、字符量、状态、耗时和脱敏错误。

- [ ] **Step 6: 实现用户用量查询接口**

提供 `/me/usage/summary`、`/me/api-calls` 和 `/me/plans`；所有查询强制使用认证用户 ID，分页最大 100 条，默认按创建时间倒序。

- [ ] **Step 7: 验证并提交**

Run:

```bash
pnpm --filter api-server test -- unicode-counter
pnpm --filter api-server test:e2e -- gateway.e2e-spec.ts
```

Expected: 普通、流式、失败不扣费、余额不足和并发扣减测试全部 PASS。

```bash
git add apps/api-server/src/gateway apps/api-server/src/metering apps/api-server/src/risk apps/api-server/test
git commit -m "feat: proxy model calls and meter usage"
```

## Task 9：实现运营后台

**Files:**
- Create: `apps/admin-web/package.json`
- Create: `apps/admin-web/src/main.tsx`
- Create: `apps/admin-web/src/api/client.ts`
- Create: `apps/admin-web/src/layouts/AdminLayout.tsx`
- Create: `apps/admin-web/src/pages/LoginPage.tsx`
- Create: `apps/admin-web/src/pages/ModelsPage.tsx`
- Create: `apps/admin-web/src/pages/PlansPage.tsx`
- Create: `apps/admin-web/src/pages/OrdersPage.tsx`
- Create: `apps/admin-web/src/pages/CompliancePage.tsx`
- Test: `apps/admin-web/src/pages/CompliancePage.test.tsx`

- [ ] **Step 1: 写生产门槛 UI 测试**

```tsx
it('shows missing required disclosures and disables production switch', async () => {
  render(<CompliancePage />);
  expect(await screen.findByText('经营主体未填写')).toBeVisible();
  expect(screen.getByRole('switch', { name: '生产模式' })).toBeDisabled();
});
```

- [ ] **Step 2: 建立认证布局和 API 客户端**

401 时清理管理员会话并跳转登录；错误页显示平台错误码和请求 ID，不显示后端堆栈。

- [ ] **Step 3: 实现模型、套餐、订单和合规页面**

改价、退款、封禁和生产切换使用确认弹窗；表格默认按更新时间倒序；不显示供应商密钥字段。

- [ ] **Step 4: 验证并提交**

Run:

```bash
pnpm --filter admin-web test
pnpm --filter admin-web build
```

Expected: 测试 PASS，Vite build 成功。

```bash
git add apps/admin-web
git commit -m "feat: add operations admin console"
```

## Task 10：阶段一端到端验收

**Files:**
- Create: `apps/api-server/prisma/seed.ts`
- Create: `apps/api-server/test/platform-flow.e2e-spec.ts`
- Create: `docs/runbooks/local-development.md`

- [ ] **Step 1: 写固定测试种子**

创建测试管理员、测试用户、测试模型、测试套餐和完整的合规资料；不得写入真实手机号、公司名或上游密钥。

- [ ] **Step 2: 写完整流程测试**

测试顺序：

```text
管理员登录
-> 创建并上架模型
-> 创建测试套餐
-> 给测试用户发放套餐
-> 用户创建 API Key
-> 调用测试供应商
-> 验证额度扣减
-> 验证调用日志
-> 验证订单和审计记录
```

- [ ] **Step 3: 运行完整验证**

Run:

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter api-server test:e2e -- platform-flow.e2e-spec.ts
```

Expected: 全部命令退出码为 0。

- [ ] **Step 4: 人工成功标志**

访问运营后台后，可以维护模型、套餐与合规资料；使用创建出的测试 Key 调用 `/v1/chat/completions` 后，额度和日志同步变化。

- [ ] **Step 5: 提交**

```bash
git add apps/api-server/prisma/seed.ts apps/api-server/test docs/runbooks
git commit -m "test: verify core platform flow"
```
