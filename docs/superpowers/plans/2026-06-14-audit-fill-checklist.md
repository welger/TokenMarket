# 待确认字段填空清单与小程序审核材料包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把合规草案里的待确认字段整理成执行清单，并准备微信小程序审核后台可用的材料包。

**Architecture:** 在 `docs/compliance/` 内新增两份执行型文档，分别面向内部填空推进和微信审核提交准备。`README.md` 和生产上线清单只做入口链接，避免复制长文造成口径漂移。

**Tech Stack:** Markdown 文档、现有合规材料和上线 runbook。

---

## Task 1: 待确认字段填空清单

**Files:**
- Create: `docs/compliance/fill-in-checklist.md`

- [x] Step 1: 新增字段状态、负责人和填写流程说明。
- [x] Step 2: 新增主体与联系方式字段表。
- [x] Step 3: 新增域名、协议、服务器和模型供应商字段表。
- [x] Step 4: 新增数据保存、退款、客服投诉和安全字段表。
- [x] Step 5: 新增填写完成后的自检标准。

## Task 2: 小程序审核材料包

**Files:**
- Create: `docs/compliance/miniapp-review-pack.md`

- [x] Step 1: 新增使用说明和非法律意见提醒。
- [x] Step 2: 新增基础资料、服务类目和功能说明。
- [x] Step 3: 新增隐私保护指引填写材料。
- [x] Step 4: 新增交易、支付、退款和发票材料。
- [x] Step 5: 新增内容安全、客服投诉和截图页面清单。
- [x] Step 6: 新增提交前自检清单。

## Task 3: 入口链接

**Files:**
- Modify: `docs/compliance/README.md`
- Modify: `docs/runbooks/production-launch-checklist.md`

- [x] Step 1: 在合规 README 材料清单中加入两份新材料。
- [x] Step 2: 在生产上线清单的小程序资质部分链接小程序审核材料包。
- [x] Step 3: 在最终确认部分加入待确认字段填空清单全部完成的检查项。

## Task 4: 验证和提交

- [x] Step 1: 扫描 diff，确认没有真实密钥、证书正文、Cookie、Bearer Token、身份证或银行卡。
- [x] Step 2: 搜索 `【待确认：`，确认真实待填字段仍用统一占位。
- [x] Step 3: 提交 `docs: add miniapp review preparation checklists`。
