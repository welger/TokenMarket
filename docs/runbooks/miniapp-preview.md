# 微信小程序预览验收

本 runbook 用于在微信开发者工具中验收 `apps/miniapp`。不要把 API Key、Cookie、微信登录凭证、身份证、银行卡或公司机密粘贴到截图、日志或提交记录中。

## 前置条件

1. 安装微信开发者工具，并启用 CLI 或手动导入项目。
2. 本地 API 服务可访问，开发环境默认地址为 `http://127.0.0.1:3000`。
3. 如果要跑后端 E2E，先配置本地测试库环境变量：
   - `WECHAT_AUTH_E2E_DATABASE_URL`
   - 其他 `apps/api-server/test/*.e2e-spec.ts` 依赖的本地数据库连接变量
4. 小程序 `apps/miniapp/project.config.json` 已配置真实小程序 AppID。不要把 AppSecret、登录 code、session_key 或 Cookie 写入仓库。
5. 如果已经拿到真实 AppID，可按 [微信小程序平台测试准备手册](./wechat-platform-test-readiness.md) 先做开发版、体验版、真实登录和体验 API 域名联调。

## 自动检查

```bash
pnpm --filter miniapp test
pnpm --filter miniapp typecheck
pnpm --filter api-server test:e2e
```

成功标志：

- miniapp Jest 全部通过。
- miniapp TypeScript 无错误。
- api-server E2E 全部通过；如果缺少本地测试库配置，会看到 `WECHAT_AUTH_E2E_DATABASE_URL is required` 或数据库初始化超时，此时不能视为通过。

## 开发者工具预览

1. 打开微信开发者工具。
2. 导入项目目录：`apps/miniapp`。
3. 编译小程序。
4. 在模拟器分别选择 375px 和 390px 宽度。
5. 检查底部 Tab：`首页 / 服务 / 控制台 / 我的`。
6. 确认页面没有横向滚动，底部安全区没有遮挡 Tab。

成功标志：

- 首页展示“模型网关”、服务状态、经营主体、本月用量、模型状态、客服与合规入口。
- 四个 Tab 均可切换。
- “服务”页可进入模型列表、服务套餐、API 文档。
- “控制台”页可进入密钥管理、用量统计、订单中心。
- “我的”页可进入隐私与数据、内容安全、客服投诉。

## 核心流程

按顺序执行：

1. 测试登录。
2. 查看真实服务状态。
3. 查看模型列表和套餐。
4. 创建 API Key，复制完整 Key，然后点击“我已保存”。
5. 确认列表只显示掩码 Key，不能再次查看完整 Key。
6. 停用 Key，确认弹窗出现且停用后不可恢复。
7. 发起测试模型调用。
8. 查看用量摘要和调用日志。
9. 查看测试订单、发票记录和退款记录。

成功标志：

- 完整 API Key 只显示一次，关闭后不再出现在列表或日志中。
- 调用日志只展示请求 ID、模型、状态码、字符量、耗时和时间，不展示提示词或响应内容。
- 测试订单明确显示“测试支付”。
- 发票只有后端状态为 `ISSUED` 时才显示“已开具”。
- 退款完成状态明确显示为测试退款，不伪装成真实支付通道退款。

## 视觉 QA

1. 在 390 x 844 模拟器截图首页。
2. 与 `docs/superpowers/specs/assets/wechat-service-desk-home.png` 并排检查。
3. 对比布局、字号、留白、边框、图标、底部安全区。
4. 如有偏差，先改 WXSS，再重新编译截图。

成功标志：

- 首页视觉接近参考图。
- 375px 和 390px 宽度下均无横向滚动。
- 骨架屏、空状态、失败状态都能正常展示。

## 2026-06-13 本地验收记录

- 微信开发者工具：Stable v2.01.2510290。
- 375px 截图：`artifacts/miniapp-preview/miniapp-375px-window-20260613-211751.png`。
- 390px 截图：`artifacts/miniapp-preview/miniapp-390px-window-20260613-211751.png`。
- 验收结论：两档宽度首页可渲染，底部 Tab 和安全区正常；`Problems` 为 0。
- 限制：当前使用 `touristappid`，只能做本地模拟器验收；生成真机预览二维码需要替换为真实小程序 AppID。

## 2026-06-14 真实 AppID 本地页面验收记录

- 小程序 AppID：`wx5723c60f8a67a5e2`。
- 微信开发者工具：Stable v2.01.2510290。
- 后端环境：本地 API `http://127.0.0.1:3000`，PostgreSQL 和 Redis 使用本地 Docker 开发容器。
- 验收范围：首页、服务、控制台、我的四个 Tab。
- 验收结论：页面可切换，本地测试数据可加载，Console 无红色错误；仅剩微信开发者工具黄色提示。
- 安全说明：本次未配置 AppSecret、微信支付 API v3 Key、商户私钥或证书正文。
- 限制：当前仍为本地模拟器验收；上传开发版、生成体验版和真机二维码验收需在微信开发者工具和微信公众平台继续执行。

## 2026-06-14 开发版上传与体验版二维码记录

- 开发版本号：`0.1.0dev.20260614`。
- 上传结果：微信开发者工具显示 `Upload Successfully`。
- 微信公众平台状态：开发版本已上传，并已设置为体验版，已生成体验版二维码。
- 项目备注：真实 AppID 本地页面验收通过：首页、服务、控制台、我的；本地 API 联调无红色错误。
- 当前限制：`API_BASE_URLS.trial` 仍未配置 HTTPS 体验 API 域名，真机扫码体验版无法完整访问本机 `http://127.0.0.1:3000`。
- 下一步：准备 HTTPS 体验环境 API 域名，并在微信公众平台加入 request 合法域名后重新上传体验版。
