# 小程序微信支付接入与上线准备 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小程序订单中心可以拉起微信 JSAPI 支付，并提供微信支付生产配置上线手册。

**Architecture:** 复用现有小程序 `billing` 服务层和订单页。服务层负责后端接口调用、支付参数校验和 `wx.requestPayment` 封装；页面只负责按钮状态、成功刷新和失败提示。上线手册独立放在 `docs/runbooks`，避免真实密钥进入代码仓库。

**Tech Stack:** 微信小程序 TypeScript、Jest、NestJS 已有支付接口、Markdown runbook。

---

## Task 1: 小程序支付服务

**Files:**
- Modify: `apps/miniapp/miniprogram/services/billing.ts`
- Modify: `apps/miniapp/test/billing.spec.ts`

- [x] Step 1: 写失败测试，验证微信待支付订单映射为可支付，付款文案为“微信支付”。
- [x] Step 2: 写失败测试，验证 `payWechatOrder('order_1')` POST 到 `/me/orders/order_1/pay-wechat` 并调用 `wx.requestPayment`。
- [x] Step 3: 写失败测试，验证后端返回缺少支付参数时抛出“微信支付参数无效，请稍后重试”。
- [x] Step 4: 写失败测试，验证 `wx.requestPayment` 失败时抛出“微信支付未完成，请稍后重试或联系客服”。
- [x] Step 5: 实现 `OrderRow.canPayWechat` 和 `payWechatOrder()`。
- [x] Step 6: 运行 `pnpm --filter miniapp test -- billing.spec.ts`。

## Task 2: 订单页支付按钮

**Files:**
- Modify: `apps/miniapp/miniprogram/pages/orders/index.ts`
- Modify: `apps/miniapp/miniprogram/pages/orders/index.wxml`
- Modify: `apps/miniapp/miniprogram/pages/orders/index.wxss`
- Create: `apps/miniapp/test/orders-page.spec.ts`

- [x] Step 1: 写失败测试，验证点击微信支付按钮会调用服务层支付方法。
- [x] Step 2: 写失败测试，验证支付成功后刷新订单列表。
- [x] Step 3: 写失败测试，验证支付失败后调用 `wx.showModal` 展示错误。
- [x] Step 4: 实现页面 `payWechat()`、`payingOrderId` 状态和按钮。
- [x] Step 5: 运行 `pnpm --filter miniapp test -- orders-page.spec.ts billing.spec.ts`。

## Task 3: 微信支付生产上线手册

**Files:**
- Create: `docs/runbooks/wechat-pay-production.md`
- Modify: `docs/runbooks/production-launch-checklist.md`

- [x] Step 1: 新增手册，写明配置变量、证书文件、微信后台配置、验收步骤和排查路径。
- [x] Step 2: 在生产上线清单的微信支付准备部分链接新手册。
- [x] Step 3: 扫描手册，确认没有真实密钥、AppSecret、证书正文、Cookie 或银行卡信息。

## Task 4: 验证和提交

- [x] Step 1: 运行 `pnpm --filter miniapp test`。
- [x] Step 2: 运行 `pnpm --filter miniapp typecheck`。
- [x] Step 3: 扫描 diff，确认没有真实密钥、证书、Cookie 或 Bearer Token。
- [x] Step 4: 提交 `feat: connect miniapp WeChat payment`。
