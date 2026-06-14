# 微信小程序平台测试准备手册

这份手册用于小程序已经拿到 AppID、但微信认证仍在审核期间，提前完成开发版、体验版、真实登录、服务器域名和微信支付资料准备。不要把 AppSecret、微信支付 API v3 Key、商户私钥、平台证书正文、Cookie、身份证、银行卡或公司机密写进仓库、截图、Issue、PR 或聊天记录。

## 1. 当前目标

在不等待正式发布的前提下，先完成这些可验证事项：

- 使用真实小程序 AppID 导入 `apps/miniapp`。
- 上传开发版，并生成体验版二维码。
- 添加体验成员，用真机微信打开体验版。
- 配置体验环境 API HTTPS 域名。
- 验证真实微信登录能换取平台 JWT。
- 提前申请微信支付商户号、API v3 Key 和商户 API 证书。

成功标志：微信开发者工具能用真实 AppID 编译并上传；真机体验版能访问体验 API；后端没有把 AppSecret、API v3 Key 或证书正文输出到日志。

## 2. 资料边界

可以进入仓库或文档的资料：

- 小程序 AppID。
- API 体验环境域名，例如 `https://api-staging.example.com`。
- API 正式环境域名，例如 `https://api.example.com`。
- 微信支付回调 URL，例如 `https://api.example.com/payments/wechat/notify`。
- 商户号和证书序列号。

不能进入仓库或文档的资料：

- `WECHAT_APP_SECRET`。
- `WECHAT_PAY_API_V3_KEY`。
- 商户私钥 `apiclient_key.pem` 正文。
- 微信支付平台证书正文。
- 微信登录 code、session_key、Cookie、Bearer Token。
- 身份证、银行卡、营业执照扫描件或公司内部机密。

成功标志：`git diff` 中只能看到占位值、域名或非密钥标识，不能看到任何密钥正文。

## 3. 真实 AppID 开发版准备

步骤：

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择 `apps/miniapp`。
4. AppID 填写你的小程序真实 AppID。
5. 项目名称保持 `payment-miniapp`。
6. 编译小程序。
7. 在“详情”中确认 AppID 不是 `touristappid`。

风险提醒：微信开发者工具可能会把 AppID 写入 `apps/miniapp/project.config.json` 或本地私有配置文件。提交前必须检查 `git diff`，不要把无关本地配置一起提交。

成功标志：

- 微信开发者工具左上角显示真实小程序项目。
- 编译无错误。
- `wx.getAccountInfoSync().miniProgram.appId` 返回真实 AppID。

## 4. 体验环境 API 域名准备

小程序体验版不能长期依赖 `http://127.0.0.1:3000`。体验环境建议使用独立 HTTPS 域名，例如：

```text
https://api-staging.example.com
```

需要同时配置两处：

1. 微信公众平台后台：把体验 API 域名加入 request 合法域名。
2. 小程序代码：在 `apps/miniapp/miniprogram/config/api.ts` 中配置 `API_BASE_URLS.trial` 和 `API_ALLOWED_HOSTS.trial`。

示例，不要直接照抄域名：

```ts
export const API_BASE_URLS: ApiBaseUrls = {
  develop: DEVELOP_API_BASE_URL,
  trial: 'https://api-staging.example.com',
  release: '',
};

export const API_ALLOWED_HOSTS: ApiAllowedHosts = {
  develop: ['localhost', '127.0.0.1'],
  trial: ['api-staging.example.com'],
  release: [],
};
```

成功标志：

- 体验版真机打开首页不会出现“服务地址未配置”。
- 首页、服务、控制台、我的四个 Tab 都能加载接口数据。
- 后端访问日志能看到来自体验版的请求。

## 5. 真实微信登录联调

后端体验环境需要配置：

```bash
WECHAT_APP_ID=真实小程序 AppID
WECHAT_APP_SECRET=只放服务器环境变量或密钥管理系统
WECHAT_TEST_LOGIN_ENABLED=false
```

步骤：

1. 部署体验环境 API。
2. 确认体验环境 `WECHAT_APP_ID` 与小程序 AppID 一致。
3. 在微信开发者工具或真机体验版打开小程序。
4. 触发登录。
5. 后端调用微信 `code2session`，换取 openid。
6. 小程序收到平台 JWT 后访问控制台数据。

成功标志：

- 后端创建或复用同一个 `wechatOpenId` 用户。
- 小程序后续请求带平台 JWT。
- 日志不出现完整 AppSecret、session_key 或 JWT。

## 6. 上传开发版和生成体验版

步骤：

1. 微信开发者工具中点击“上传”。
2. 版本号建议使用日期和用途，例如 `0.1.0-trial.20260614`。
3. 版本说明写清楚：`真实 AppID 体验版联调：登录、模型列表、套餐、API Key、订单、客服入口`。
4. 微信公众平台后台进入“版本管理”。
5. 把刚上传的开发版设为体验版。
6. 添加体验成员。
7. 用体验成员微信扫码打开。

成功标志：

- 微信公众平台后台能看到开发版本。
- 体验二维码可扫码打开。
- 非体验成员无法访问体验版，体验成员可以访问。

## 7. 体验版验收顺序

按这个顺序验收：

1. 首页：经营主体、服务介绍、客服入口可见。
2. 服务：模型列表、服务套餐、API 文档可进入。
3. 控制台：API Key、用量统计、订单中心可进入。
4. 我的：隐私与数据、内容安全、客服投诉可进入。
5. 登录：真实微信用户能登录，不再走测试登录。
6. API Key：完整 Key 只显示一次。
7. 订单：测试支付仍明确标注测试支付，不能伪装真实付款。
8. 截图：375px 和 390px 核心页面无横向滚动。

成功标志：验收记录可以补到 [微信小程序预览验收](./miniapp-preview.md)，并注明 AppID、体验 API 域名、验收日期和限制项。不要把密钥或个人身份信息写入验收记录。

## 8. 微信支付资料提前准备

认证审核期间可以先准备这些材料，最终能否开通和绑定以微信公众平台、微信商户平台审核结果为准：

- 小程序 AppID。
- 经营主体资料。
- 结算账户资料。
- 商户联系人。
- 经营类目和服务说明。
- 客服电话和投诉入口。
- 体验版截图或服务说明截图。

商户号通过后再配置：

- `WECHAT_PAY_MCH_ID`。
- `WECHAT_PAY_SERIAL_NO`。
- `WECHAT_PAY_PRIVATE_KEY_PATH`。
- `WECHAT_PAY_PLATFORM_CERT_PATH`。
- `WECHAT_PAY_API_V3_KEY`。
- `WECHAT_PAY_NOTIFY_URL`。

成功标志：商户平台能看到商户号，小程序 AppID 与商户号完成关联，JSAPI 支付能力可用。真实小额支付验收按 [微信支付生产配置与验收手册](./wechat-pay-production.md) 执行。

## 9. 提交前安全检查

每次准备提交前运行：

```bash
git diff -- . ':!pnpm-lock.yaml'
rg -n "AppSecret|API v3 Key|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|session_key|Cookie:|Authorization: Bearer|Bearer [A-Za-z0-9._-]{20,}" docs apps .env.example
```

成功标志：

- `git diff` 只包含代码、文档、占位值或非密钥配置。
- 搜索命令没有扫出真实密钥、私钥、Cookie 或 Bearer Token。
- `apps/miniapp/project.private.config.json` 没有进入 Git 暂存区。

