# 微信支付 API v3 驱动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入微信支付 API v3 的 JSAPI 下单和支付通知入账基础能力，不提交真实密钥或证书。

**Architecture:** 新增 `payments` 模块承载微信支付签名、客户端和回调控制器；订单模块继续负责订单创建、状态流转和套餐发放。真实支付由微信通知驱动入账，测试支付仍保留用于本地开发。

**Tech Stack:** NestJS、Node.js crypto、Prisma、Jest、Supertest、微信支付 API v3。

---

## Task 1：微信支付签名和解密基础

**Files:**
- Create: `apps/api-server/src/payments/wechat-signature.service.ts`
- Create: `apps/api-server/src/payments/wechat-signature.service.spec.ts`
- Modify: `apps/api-server/src/common/config/env.schema.ts`
- Modify: `apps/api-server/src/common/config/env.schema.spec.ts`
- Modify: `.env.example`

- [x] Step 1: 写失败测试，覆盖请求签名、通知验签成功/失败、AES-256-GCM 解密成功/失败。
- [x] Step 2: 实现签名串、RSA-SHA256 签名和验签。
- [x] Step 3: 实现 API v3 resource 解密。
- [x] Step 4: 补充 `WECHAT_PAY_PLATFORM_CERT_PATH` 占位配置。
- [x] Step 5: 运行 `pnpm --filter api-server test -- wechat-signature.service.spec.ts env.schema.spec.ts`。

## Task 2：微信 JSAPI 下单客户端

**Files:**
- Create: `apps/api-server/src/payments/wechat-pay.client.ts`
- Create: `apps/api-server/src/payments/wechat-pay.client.spec.ts`

- [x] Step 1: 写失败测试，验证下单请求体只使用服务端订单金额和用户 openid。
- [x] Step 2: 实现 `/v3/pay/transactions/jsapi` 请求构造和签名头。
- [x] Step 3: 实现返回小程序 `wx.requestPayment` 参数。
- [x] Step 4: 运行 `pnpm --filter api-server test -- wechat-pay.client.spec.ts`。

## Task 3：订单服务支持微信支付入账

**Files:**
- Modify: `apps/api-server/src/orders/orders.service.ts`
- Modify: `apps/api-server/src/orders/orders.service.spec.ts`
- Modify: `apps/api-server/src/orders/test-payment.driver.ts`
- Modify: `apps/api-server/src/orders/orders.module.ts`

- [x] Step 1: 写失败测试，验证 `PAYMENT_DRIVER=wechat` 时新订单写入 `WECHAT`。
- [x] Step 2: 写失败测试，验证测试支付不能处理 `WECHAT` 订单。
- [x] Step 3: 写失败测试，验证微信通知金额不符时报错。
- [x] Step 4: 实现订单创建驱动选择、测试支付保护和微信通知幂等发放。
- [x] Step 5: 运行 `pnpm --filter api-server test -- orders.service.spec.ts test-payment.driver.spec.ts`。

## Task 4：微信支付控制器和模块

**Files:**
- Create: `apps/api-server/src/payments/payments.module.ts`
- Create: `apps/api-server/src/payments/wechat-pay.service.ts`
- Create: `apps/api-server/src/payments/wechat-pay.controller.ts`
- Modify: `apps/api-server/src/app.module.ts`
- Create: `apps/api-server/test/wechat-payment.e2e-spec.ts`

- [x] Step 1: 写 E2E 失败测试，无效通知签名返回 401。
- [x] Step 2: 写 E2E 失败测试，金额不符通知不发放套餐。
- [x] Step 3: 写 E2E 失败测试，成功通知发放套餐。
- [x] Step 4: 写 E2E 失败测试，重复成功通知不重复发放套餐。
- [x] Step 5: 实现用户发起 JSAPI 支付接口和微信通知入口。
- [x] Step 6: 运行 `pnpm --filter api-server test:e2e -- wechat-payment.e2e-spec.ts`。

## Task 5：验证和提交

- [x] Step 1: 运行 `pnpm --filter api-server test -- wechat-signature.service.spec.ts wechat-pay.client.spec.ts orders.service.spec.ts test-payment.driver.spec.ts env.schema.spec.ts`。
- [x] Step 2: 运行 `pnpm --filter api-server test:e2e -- wechat-payment.e2e-spec.ts`。
- [x] Step 3: 运行 `pnpm --filter api-server typecheck`。
- [x] Step 4: 扫描 diff，确认没有真实密钥、证书、Cookie 或 Bearer Token。
- [x] Step 5: 提交 `feat: integrate WeChat Pay driver`。
