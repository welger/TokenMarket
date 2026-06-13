# 合规材料预备包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提前准备微信小程序审核和生产上线所需的服务协议、隐私、退款、数据保存、供应商披露、内容安全和投诉入口材料。

**Architecture:** 新增 `docs/compliance/` 作为合规材料草案目录，所有待填真实信息用统一占位字段。生产上线清单只引用该目录，不复制长文本，避免多处口径漂移。

**Tech Stack:** Markdown 文档、现有 runbook。

---

## Task 1: 合规文档包

**Files:**
- Create: `docs/compliance/README.md`
- Create: `docs/compliance/terms-of-service.md`
- Create: `docs/compliance/privacy-policy.md`
- Create: `docs/compliance/refund-policy.md`
- Create: `docs/compliance/data-retention.md`
- Create: `docs/compliance/model-provider-disclosure.md`
- Create: `docs/compliance/content-safety-rules.md`
- Create: `docs/compliance/support-and-complaints.md`

- [x] Step 1: 新增 `README.md`，列出材料清单、待确认字段和使用顺序。
- [x] Step 2: 新增用户服务协议草案。
- [x] Step 3: 新增隐私政策草案。
- [x] Step 4: 新增退款规则草案。
- [x] Step 5: 新增数据保存期限和删除方式说明。
- [x] Step 6: 新增模型供应商与数据流向说明。
- [x] Step 7: 新增内容安全规则。
- [x] Step 8: 新增客服、投诉、账号注销和数据请求入口说明。

## Task 2: 上线清单接入

**Files:**
- Modify: `docs/runbooks/production-launch-checklist.md`

- [x] Step 1: 在经营主体、协议、模型供应商披露、支付退款和客服投诉部分链接 `docs/compliance/` 对应材料。
- [x] Step 2: 确认清单不复制长文，避免材料口径重复。

## Task 3: 验证和提交

- [x] Step 1: 扫描 `docs/compliance` 和 diff，确认没有真实密钥、证书正文、Cookie、Bearer Token、身份证或银行卡。
- [x] Step 2: 搜索 `【待确认：`，确认所有待填信息都有明确说明。
- [x] Step 3: 提交 `docs: add compliance material drafts`。
