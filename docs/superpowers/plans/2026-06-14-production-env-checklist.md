# 生产环境变量部署清单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增生产环境变量部署清单，降低上线漏配、误配和密钥泄露风险。

**Architecture:** 在 `docs/runbooks/` 新增独立部署清单，生产上线清单只链接该文档。清单以 `.env.example` 和 `env.schema.ts` 为准，按基础、密钥、微信、支付、上游、网络和验证分组。

**Tech Stack:** Markdown 文档、现有 NestJS 环境变量校验。

---

## Task 1: 新增部署清单

**Files:**
- Create: `docs/runbooks/production-env-checklist.md`

- [x] Step 1: 写隐私和密钥处理提醒。
- [x] Step 2: 写基础运行变量表。
- [x] Step 3: 写安全密钥变量表。
- [x] Step 4: 写上游模型变量表。
- [x] Step 5: 写微信登录变量表。
- [x] Step 6: 写微信支付变量表。
- [x] Step 7: 写反向代理、域名、HTTPS、监控和验证步骤。

## Task 2: 上线清单接入

**Files:**
- Modify: `docs/runbooks/production-launch-checklist.md`

- [x] Step 1: 在域名、HTTPS、发布前最终确认部分链接生产环境变量部署清单。
- [x] Step 2: 确认上线清单不复制长变量表，避免口径漂移。

## Task 3: 验证和提交

- [x] Step 1: 扫描 diff，确认没有真实密钥、证书正文、Cookie、Bearer Token、身份证或银行卡。
- [x] Step 2: 搜索关键变量，确认清单覆盖 `env.schema.ts` 中的生产相关配置。
- [x] Step 3: 提交 `docs: add production environment checklist`。
