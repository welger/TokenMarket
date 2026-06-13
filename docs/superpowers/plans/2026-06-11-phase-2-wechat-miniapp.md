# 阶段二：微信小程序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成微信原生小程序，真实连接阶段一 API，完成登录、服务浏览、API Key、用量、日志、订单及合规信息查询。

**Architecture:** 小程序使用原生 WXML/WXSS/TypeScript 和自定义组件。所有网络请求经过统一客户端，微信登录码只发送给自有 API；业务页面不直接调用模型供应商。视觉以已批准的“微信服务台”首页为基准。

**Tech Stack:** 微信原生小程序、TypeScript、miniprogram-api-typings、Jest、微信开发者工具 CLI。

---

## Task 1：建立小程序工程与测试身份登录

**Files:**
- Create: `apps/miniapp/package.json`
- Create: `apps/miniapp/tsconfig.json`
- Create: `apps/miniapp/jest.config.cjs`
- Create: `apps/miniapp/project.config.json`
- Create: `apps/miniapp/miniprogram/app.json`
- Create: `apps/miniapp/miniprogram/app.ts`
- Create: `apps/miniapp/miniprogram/app.wxss`
- Create: `apps/miniapp/miniprogram/services/http.ts`
- Create: `apps/api-server/src/auth/wechat-auth.controller.ts`
- Create: `apps/api-server/src/auth/wechat-auth.service.ts`
- Test: `apps/api-server/src/auth/wechat-auth.service.spec.ts`

- [x] **Step 1: 写微信身份绑定测试**

```ts
it('returns the existing user for the same open id', async () => {
  const first = await service.loginWithOpenId('openid_test_1');
  const second = await service.loginWithOpenId('openid_test_1');
  expect(second.userId).toBe(first.userId);
});
```

- [x] **Step 2: 实现登录适配器**

定义 `WechatCodeExchange` 接口；开发环境使用固定测试实现，生产环境才调用微信 `code2Session`。日志不得记录 `code`、`session_key`。

- [x] **Step 3: 实现小程序统一请求客户端**

自动附加会话令牌和 `x-request-id`；401 时仅重试一次登录；错误提示展示公开错误信息。

- [x] **Step 4: 配置小程序单元测试**

`package.json` 提供 `test` 和 `typecheck` 脚本；测试环境模拟 `wx.request`、`wx.login`、`wx.setStorageSync` 和 `wx.requestPayment`，禁止测试访问真实微信接口。

- [x] **Step 5: 验证并提交**

Run:

```bash
pnpm --filter api-server test -- wechat-auth.service.spec.ts
pnpm --filter miniapp test
pnpm --filter miniapp typecheck
```

Expected: PASS。

```bash
git add apps/miniapp apps/api-server/src/auth
git commit -m "feat: add miniapp shell and WeChat login"
```

## Task 2：实现首页和四个主导航

**Files:**
- Create: `apps/miniapp/miniprogram/pages/home/*`
- Create: `apps/miniapp/miniprogram/pages/services/*`
- Create: `apps/miniapp/miniprogram/pages/console/*`
- Create: `apps/miniapp/miniprogram/pages/profile/*`
- Create: `apps/miniapp/miniprogram/components/status-row/*`
- Create: `apps/miniapp/miniprogram/components/usage-summary/*`
- Create: `apps/miniapp/miniprogram/assets/tabbar/*`

- [ ] **Step 1: 配置 tabBar**

标签固定为“首页 / 服务 / 控制台 / 我的”，选中色为 `#07C160`。

- [ ] **Step 2: 实现“微信服务台”首页**

首页按以下顺序渲染：品牌说明、服务与主体状态、三项快捷入口、本月用量、模型状态、客服与合规入口。

- [ ] **Step 3: 实现加载、空数据和失败状态**

首次加载显示骨架；无套餐显示“暂无可用套餐”；失败时提供“重新加载”，不展示假数据。

- [ ] **Step 4: 使用微信开发者工具预览**

Expected: 375px 和 390px 宽度下无横向滚动，底部导航和安全区正常。

- [ ] **Step 5: 提交**

```bash
git add apps/miniapp/miniprogram
git commit -m "feat: build miniapp navigation and home"
```

## Task 3：实现模型、套餐、文档与合规页面

**Files:**
- Create: `apps/miniapp/miniprogram/pages/models/*`
- Create: `apps/miniapp/miniprogram/pages/plans/*`
- Create: `apps/miniapp/miniprogram/pages/api-docs/*`
- Create: `apps/miniapp/miniprogram/pages/privacy/*`
- Create: `apps/miniapp/miniprogram/pages/content-safety/*`
- Create: `apps/miniapp/miniprogram/pages/support/*`

- [ ] **Step 1: 实现模型列表**

每行显示公开名称、能力、输入/输出计费单位和服务状态；停用模型不可进入购买操作。

- [ ] **Step 2: 实现套餐详情**

购买按钮前明确显示价格、额度、有效期、适用模型和退款条件；用户必须主动勾选协议确认。

- [ ] **Step 3: 实现 API 文档**

展示基础地址、Bearer 鉴权、请求参数、错误码和普通/流式示例；示例 Key 固定使用掩码值。

- [ ] **Step 4: 实现隐私、安全和客服**

全部内容来自公开 API；经营资料缺失时显示“待完善，当前不可正式购买”；客服入口使用后台真实配置。

- [ ] **Step 5: 提交**

```bash
git add apps/miniapp/miniprogram/pages
git commit -m "feat: add service documentation and policies"
```

## Task 4：实现 API Key 管理

**Files:**
- Create: `apps/miniapp/miniprogram/pages/api-keys/*`
- Create: `apps/miniapp/miniprogram/components/one-time-secret/*`
- Create: `apps/miniapp/miniprogram/utils/clipboard.ts`

- [ ] **Step 1: 写组件测试**

```ts
it('removes plaintext after confirmation', () => {
  const state = acknowledgeSecret({ plaintext: 'sk-gw_secret' });
  expect(state.plaintext).toBeUndefined();
  expect(state.acknowledged).toBe(true);
});
```

- [ ] **Step 2: 实现创建流程**

用户输入名称并确认后创建；完整 Key 仅在结果弹窗显示一次；弹窗包含复制按钮和“我已保存”按钮。

- [ ] **Step 3: 实现列表和停用**

列表只显示名称、掩码、创建时间和状态；停用前二次确认；不提供恢复和再次查看完整值。

- [ ] **Step 4: 验证并提交**

Run: `pnpm --filter miniapp test`

Expected: PASS。

```bash
git add apps/miniapp/miniprogram/pages/api-keys apps/miniapp/miniprogram/components/one-time-secret
git commit -m "feat: manage one-time API keys in miniapp"
```

## Task 5：实现用量、日志和订单中心

**Files:**
- Create: `apps/miniapp/miniprogram/pages/usage/*`
- Create: `apps/miniapp/miniprogram/pages/call-logs/*`
- Create: `apps/miniapp/miniprogram/pages/orders/*`
- Create: `apps/miniapp/miniprogram/pages/order-detail/*`
- Create: `apps/miniapp/miniprogram/pages/refunds/*`
- Create: `apps/miniapp/miniprogram/pages/invoices/*`

- [ ] **Step 1: 实现用量摘要**

显示调用次数、输入量、输出量、套餐已用/剩余和统计周期；按模型筛选。

- [ ] **Step 2: 实现调用日志**

显示请求 ID、模型、状态码、字符量、耗时和时间；不展示提示词、响应或明文 Key。

- [ ] **Step 3: 实现订单状态**

测试支付订单必须显示“测试支付”；真实支付未启用时购买按钮转为“支付资质准备中”，不能伪造付款。

- [ ] **Step 4: 实现发票与退款记录**

支持提交申请和查询状态；未接真实发票服务时不允许出现“已开具”。

- [ ] **Step 5: 提交**

```bash
git add apps/miniapp/miniprogram/pages
git commit -m "feat: add usage logs and order center"
```

## Task 6：小程序验收与视觉对比

**Files:**
- Create: `apps/miniapp/tests/core-flow.test.ts`
- Create: `docs/runbooks/miniapp-preview.md`

- [ ] **Step 1: 运行自动测试**

Run:

```bash
pnpm --filter miniapp test
pnpm --filter api-server test:e2e
```

Expected: 全部 PASS。

- [ ] **Step 2: 在开发者工具跑核心流程**

```text
测试登录
-> 查看真实服务状态
-> 获取测试套餐
-> 创建并保存 Key
-> 发起测试模型调用
-> 查看用量和日志
-> 查看测试订单
```

- [ ] **Step 3: 视觉 QA**

在 390 × 844 视口截图，将实现图与 `docs/superpowers/specs/assets/wechat-service-desk-home.png` 并排检查；修正布局、字号、留白、边框、图标和底部安全区差异。

- [ ] **Step 4: 提交**

```bash
git add apps/miniapp/tests docs/runbooks/miniapp-preview.md
git commit -m "test: verify miniapp core flow"
```
