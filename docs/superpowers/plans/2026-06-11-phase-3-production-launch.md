# 阶段三：支付、部署与上线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在资质齐全后接入微信支付，完成独立服务器部署、监控、备份、安全加固和生产发布门槛检查。

**Architecture:** 保持应用层接口不变，用真实 `WechatPayDriver` 替换测试驱动。Docker 镜像运行 API 和管理后台，Nginx 终止 TLS；PostgreSQL、Redis、备份和监控使用独立持久化配置。生产切换由自动检查和管理员二次确认共同控制。

**Tech Stack:** 微信支付 API v3、Docker、Nginx、PostgreSQL、Redis、Prometheus 指标、结构化日志、对象存储备份。

---

## Task 1：实现微信支付驱动

**Files:**
- Create: `apps/api-server/src/payments/wechat-pay.client.ts`
- Create: `apps/api-server/src/payments/wechat-pay.driver.ts`
- Create: `apps/api-server/src/payments/wechat-pay.controller.ts`
- Create: `apps/api-server/src/payments/wechat-signature.service.ts`
- Test: `apps/api-server/src/payments/wechat-signature.service.spec.ts`
- Test: `apps/api-server/test/wechat-payment.e2e-spec.ts`

- [ ] **Step 1: 写验签和金额测试**

```ts
it('rejects a callback with an invalid signature', async () => {
  await request(server)
    .post('/payments/wechat/notify')
    .set(invalidWechatHeaders)
    .send(encryptedNotification)
    .expect(401);
});

it('rejects a paid amount different from the order amount', async () => {
  await expect(service.applyPayment(orderId, 1)).rejects.toThrow('PAYMENT_AMOUNT_MISMATCH');
});
```

- [ ] **Step 2: 实现 API v3 签名和回调解密**

证书、私钥、API v3 Key 和商户号只从密钥文件挂载或环境变量读取；不得写入仓库或日志。

- [ ] **Step 3: 实现 JSAPI 下单**

服务端根据登录用户 openid 和订单金额创建预支付单，返回小程序支付参数；客户端不得提交可信金额。

- [ ] **Step 4: 实现幂等回调**

先验签和解密，再核对商户号、订单号、币种和金额；事务内更新订单并发放套餐；重复通知返回成功但不重复发放。

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter api-server test:e2e -- wechat-payment.e2e-spec.ts`

Expected: 验签失败、金额不符、成功和重复回调测试 PASS。

```bash
git add apps/api-server/src/payments apps/api-server/test/wechat-payment.e2e-spec.ts
git commit -m "feat: integrate WeChat Pay v3"
```

## Task 2：接入小程序支付与退款

**Files:**
- Modify: `apps/miniapp/miniprogram/pages/order-detail/*`
- Create: `apps/miniapp/miniprogram/services/payment.ts`
- Create: `apps/api-server/src/refunds/wechat-refund.service.ts`
- Test: `apps/api-server/test/wechat-refund.e2e-spec.ts`

- [ ] **Step 1: 实现小程序支付**

仅使用服务端返回参数调用 `wx.requestPayment`；取消支付保持订单 `PENDING_PAYMENT`，页面允许重新支付。

- [ ] **Step 2: 实现退款申请和真实退款**

管理员审核通过后调用微信退款接口；回调验签后更新 `REFUNDED`；失败保持可追踪状态并触发告警。

- [ ] **Step 3: 运行支付测试**

Run:

```bash
pnpm --filter api-server test:e2e -- wechat-payment.e2e-spec.ts
pnpm --filter api-server test:e2e -- wechat-refund.e2e-spec.ts
pnpm --filter miniapp test
```

Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/miniapp/miniprogram/services/payment.ts apps/miniapp/miniprogram/pages/order-detail apps/api-server/src/refunds
git commit -m "feat: complete payment and refund flow"
```

## Task 3：容器化和 HTTPS 部署

**Files:**
- Create: `apps/api-server/Dockerfile`
- Create: `apps/admin-web/Dockerfile`
- Create: `infra/production/docker-compose.yml`
- Create: `infra/nginx/nginx.conf`
- Create: `infra/nginx/conf.d/platform.conf`
- Create: `docs/runbooks/deployment.md`

- [ ] **Step 1: 构建非 root 镜像**

API 镜像使用多阶段构建，运行用户不为 root；管理后台构建产物由 Nginx 提供。

- [ ] **Step 2: 配置域名路由**

```nginx
location /v1/ {
  proxy_pass http://api-server:3000;
  proxy_read_timeout 300s;
  proxy_buffering off;
  client_max_body_size 2m;
}

location /api/ {
  proxy_pass http://api-server:3000;
  client_max_body_size 2m;
}
```

TLS 只允许现代协议；管理后台域名与公开 API 域名分离。

- [ ] **Step 3: 配置健康检查和迁移**

部署顺序为数据库备份、Prisma migration、API 健康检查、管理后台切换；migration 失败立即停止发布。

- [ ] **Step 4: 本地构建验证**

Run:

```bash
docker build -f apps/api-server/Dockerfile .
docker build -f apps/admin-web/Dockerfile .
docker compose -f infra/production/docker-compose.yml config
```

Expected: 镜像构建成功，Compose 配置校验通过。

- [ ] **Step 5: 提交**

```bash
git add apps/*/Dockerfile infra/production infra/nginx docs/runbooks/deployment.md
git commit -m "ops: add production deployment stack"
```

## Task 4：监控、告警和备份

**Files:**
- Create: `apps/api-server/src/observability/metrics.controller.ts`
- Create: `apps/api-server/src/observability/redacting-logger.ts`
- Create: `infra/monitoring/prometheus.yml`
- Create: `infra/backup/backup-postgres.sh`
- Create: `infra/backup/verify-restore.sh`
- Create: `docs/runbooks/incident-response.md`

- [ ] **Step 1: 写日志脱敏测试**

```ts
it('redacts credentials and prompt bodies', () => {
  expect(redact({
    authorization: 'Bearer secret',
    apiKey: 'sk-gw-secret',
    messages: [{ content: 'private prompt' }],
  })).toEqual({
    authorization: '[REDACTED]',
    apiKey: '[REDACTED]',
    messages: '[OMITTED]',
  });
});
```

- [ ] **Step 2: 暴露受保护指标**

指标包括 API 可用率、上游错误率、P95 延迟、计费补偿队列长度、支付回调失败、余额不足和内容拦截次数；指标端点只允许监控网络访问。

- [ ] **Step 3: 实现备份和恢复验证**

每日加密备份 PostgreSQL 到对象存储，保留周期由合规配置决定；每月至少执行一次恢复验证，失败触发告警。

- [ ] **Step 4: 验证并提交**

Run:

```bash
pnpm --filter api-server test -- redacting-logger
shellcheck infra/backup/backup-postgres.sh infra/backup/verify-restore.sh
```

Expected: 测试和脚本检查 PASS。

```bash
git add apps/api-server/src/observability infra/monitoring infra/backup docs/runbooks/incident-response.md
git commit -m "ops: add monitoring logging and backups"
```

## Task 5：生产门槛和安全验收

**Files:**
- Create: `apps/api-server/src/auth/admin-mfa.service.ts`
- Create: `apps/api-server/src/auth/admin-mfa.controller.ts`
- Create: `apps/api-server/src/auth/admin-mfa.service.spec.ts`
- Modify: `apps/api-server/src/auth/admin-auth.service.ts`
- Create: `apps/api-server/src/compliance/production-readiness.service.ts`
- Create: `apps/api-server/src/compliance/production-readiness.controller.ts`
- Create: `apps/api-server/src/compliance/production-readiness.service.spec.ts`
- Create: `docs/checklists/production-launch.md`

- [ ] **Step 1: 写管理员多因素认证测试**

```ts
it('requires a valid TOTP code for owner login in production', async () => {
  await expect(auth.login(ownerCredentials, '000000')).rejects.toThrow('MFA_INVALID');
});
```

使用 TOTP；密钥加密后保存，恢复码只显示一次并保存哈希。生产环境的 `OWNER` 和 `OPERATOR` 必须启用 MFA。

- [ ] **Step 2: 写门槛测试**

```ts
it.each([
  'businessEntity',
  'supportPhone',
  'serverRegion',
  'retentionDays',
  'deletionMethod',
  'providerDisclosures',
  'wechatPayVerified',
  'backupRestoreVerified',
])('blocks production when %s is missing', async (field) => {
  await expect(service.assertReady(profileWithout(field))).rejects.toThrow(field);
});
```

- [ ] **Step 3: 实现只读检查接口**

返回每项 `PASS` 或 `FAIL` 及公开修复说明，不返回证书内容、密钥路径或凭据。

- [ ] **Step 4: 执行安全验收**

验证越权、Key 暴力尝试、并发超扣、重复支付回调、日志泄露、请求体限制、管理员多因素认证和数据库最小权限。

- [ ] **Step 5: 执行生产全流程**

使用真实的小额测试订单跑通：

```text
微信登录
-> 创建订单
-> 微信支付
-> 回调验签
-> 套餐发放
-> 创建 API Key
-> 调用真实兼容模型
-> 用量扣减
-> 退款申请和退款
```

不得使用真实客户资料作为测试数据。

- [ ] **Step 6: 最终验证**

Run:

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter api-server test:e2e
```

Expected: 全部退出码为 0，生产门槛接口全部为 `PASS`。

- [ ] **Step 7: 提交**

```bash
git add apps/api-server/src/auth apps/api-server/src/compliance docs/checklists/production-launch.md
git commit -m "ops: enforce production launch readiness"
```
