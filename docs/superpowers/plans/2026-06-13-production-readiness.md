# 生产就绪检查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for implementation changes. Keep this plan updated as steps complete.

**Goal:** 在不接入真实密钥和外部账号的前提下，新增生产就绪检查接口、后台展示和上线清单，让微信认证等待期内可提前发现上线阻塞项。

**Architecture:** 后端在合规模块新增只读 `ProductionReadinessService`，聚合合规资料、供应商、模型、内容安全规则和环境配置状态，返回不含秘密值的检查结果。管理后台复用合规配置页展示检查列表。文档补充人工上线清单。

**Tech Stack:** NestJS、Prisma、Joi env schema、React、Ant Design、Vitest/Jest。

---

## Task 1：后端生产就绪服务

**Files:**
- Create: `apps/api-server/src/compliance/production-readiness.service.ts`
- Create: `apps/api-server/src/compliance/production-readiness.service.spec.ts`
- Modify: `apps/api-server/src/compliance/compliance.module.ts`

- [x] Step 1: 写失败测试，覆盖缺少经营主体、缺少供应商披露、生产环境仍使用测试配置。
- [x] Step 2: 实现检查结果、汇总和整体状态。
- [x] Step 3: 运行后端目标测试。

## Task 2：后端只读接口

**Files:**
- Modify: `apps/api-server/src/compliance/compliance.controller.ts`

- [x] Step 1: 增加 `GET /admin/compliance/production-readiness`。
- [x] Step 2: 确保 `OWNER`、`OPERATOR`、`SUPPORT`、`AUDITOR` 可读，响应不包含秘密值。

## Task 3：管理后台展示

**Files:**
- Modify: `apps/admin-web/src/api/client.ts`
- Modify: `apps/admin-web/src/pages/CompliancePage.tsx`

- [x] Step 1: 增加客户端类型和 API 方法。
- [x] Step 2: 在合规配置页展示上线检查汇总和检查列表。
- [x] Step 3: 运行后台页面测试。

## Task 4：上线清单文档

**Files:**
- Create: `docs/runbooks/production-launch-checklist.md`
- Modify: `.env.example`

- [x] Step 1: 增加人工上线清单，覆盖微信认证、微信支付、域名 HTTPS、备份、监控、退款与客服。
- [x] Step 2: 补充微信支付占位环境变量，明确真实值不得提交。

## Task 5：验证

- [x] Step 1: `pnpm --filter api-server test -- production-readiness.service.spec.ts compliance.service.spec.ts env.schema.spec.ts`
- [x] Step 2: `pnpm --filter api-server typecheck`
- [x] Step 3: `pnpm --filter @gateway/admin-web typecheck`
- [x] Step 4: 检查 Git diff，确认没有秘密值。
