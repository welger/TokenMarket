# 微信支付生产配置与验收手册

这份手册用于微信小程序认证通过、微信支付商户号准备好以后，配置真实 JSAPI 支付。认证审核期间可以先按 [微信小程序平台测试准备手册](./wechat-platform-test-readiness.md) 准备商户资料和体验版测试。不要把 API v3 Key、商户私钥、平台证书、AppSecret、Cookie、身份证、银行卡或公司机密写进 Git、截图或聊天记录。

## 1. 需要提前准备的微信侧资料

在微信公众平台和微信商户平台确认：

- 小程序 AppID 已完成认证。
- 微信支付商户号已开通。
- 商户号已绑定该小程序 AppID。
- JSAPI 支付权限已开通。
- API v3 Key 已设置。
- 商户 API 证书已生成，并能看到商户证书序列号。
- 支付回调域名已具备公网 HTTPS 访问能力。

成功标志：微信商户平台中能看到已关联的小程序 AppID，且 JSAPI 支付能力处于可用状态。

如果小程序仍在微信认证审核中，可以先准备经营主体、结算账户、联系人、经营类目、客服电话、投诉入口、服务说明和体验版截图。最终能否完成商户号开通、AppID 绑定和 JSAPI 支付开通，以微信后台审核结果为准。

## 2. 服务器环境变量

生产环境需要配置以下变量。真实值只能放在服务器环境变量或密钥管理系统，不能提交到仓库。

```bash
PAYMENT_DRIVER=wechat
WECHAT_APP_ID=wx_xxxxxxxxxxxxxxxx
WECHAT_APP_SECRET=由微信公众平台提供，放密钥系统
WECHAT_PAY_MCH_ID=商户号
WECHAT_PAY_SERIAL_NO=商户 API 证书序列号
WECHAT_PAY_PRIVATE_KEY_PATH=/secure/tokenmarket/wechat-pay/apiclient_key.pem
WECHAT_PAY_PLATFORM_CERT_PATH=/secure/tokenmarket/wechat-pay/platform_cert.pem
WECHAT_PAY_API_V3_KEY=32 字符 API v3 Key，放密钥系统
WECHAT_PAY_NOTIFY_URL=https://api.example.com/payments/wechat/notify
```

说明：

- `WECHAT_PAY_PRIVATE_KEY_PATH` 指向商户私钥文件路径，不是私钥内容。
- `WECHAT_PAY_PLATFORM_CERT_PATH` 指向微信支付平台证书或平台公钥文件路径。
- `WECHAT_PAY_NOTIFY_URL` 必须是公网 HTTPS，且能被微信支付服务器访问。
- `PAYMENT_DRIVER=wechat` 后，新订单会进入真实微信支付流程；不要在生产使用 `test` 驱动。

成功标志：生产 API 服务启动后，没有因缺少微信支付配置而报错；创建新订单时 `paymentDriver` 为 `WECHAT`。

## 3. 证书和密钥文件放置

推荐做法：

1. 在服务器上创建仅服务进程可读的目录，例如 `/secure/tokenmarket/wechat-pay/`。
2. 放入商户私钥文件 `apiclient_key.pem`。
3. 放入微信支付平台证书或平台公钥文件 `platform_cert.pem`。
4. 设置文件权限，确保只有运行 API 服务的用户可读。
5. 在部署系统中把路径写入环境变量。

不要做：

- 不要把 PEM 文件放入项目目录。
- 不要把 PEM 内容写进 `.env.example`、Markdown、Issue、PR 或聊天记录。
- 不要把 API v3 Key 当成普通配置发给多人。

成功标志：API 服务进程能读取证书文件；其他普通系统用户不能读取。

## 4. 微信后台配置

微信公众平台：

- 配置服务器 request 合法域名，例如 `https://api.example.com`。
- 配置业务域名和隐私保护指引。
- 确认小程序类目、主体信息、客服入口与实际服务一致。

微信商户平台：

- 确认 JSAPI 支付权限。
- 确认 AppID 和商户号绑定关系。
- 确认 API v3 Key、商户证书序列号可用。
- 如后台提供回调通知配置，填写 `WECHAT_PAY_NOTIFY_URL` 对应地址。

成功标志：小程序预览版可以访问 API 域名，商户平台没有 AppID 未关联或权限未开通提示。

## 5. 发布前小额真实支付验收

风险提醒：这一步会产生真实微信支付订单和真实扣款，建议使用最低金额测试套餐或临时小额套餐。测试后按退款规则处理。

步骤：

1. 部署生产 API，并确认 `PAYMENT_DRIVER=wechat`。
2. 部署小程序体验版或审核版。
3. 使用真实微信用户登录小程序。
4. 在套餐页创建一笔小额订单。
5. 在订单中心点击“微信支付”。
6. 微信支付面板正常拉起后完成付款。
7. 等待微信支付通知进入 `/payments/wechat/notify`。
8. 回到订单中心刷新订单。
9. 检查套餐是否发放，用量页是否出现可用额度。

成功标志：

- 订单状态从“待支付”变为“已发放”。
- `paymentReference` 记录为 `wechat:<微信交易号>`。
- 用户套餐只发放一次。
- 重复通知不会重复发放套餐。
- 日志没有记录用户完整支付密钥、API v3 Key、商户私钥或完整输入内容。

## 6. 常见问题排查

### 小程序没有拉起支付

- 检查订单是否为 `WECHAT + PENDING_PAYMENT`。
- 检查用户是否有 `wechatOpenId`。
- 检查 `/me/orders/:id/pay-wechat` 是否返回 `timeStamp`、`nonceStr`、`package`、`signType`、`paySign`。
- 检查小程序 request 合法域名是否包含 API 域名。

### 微信返回签名错误

- 检查商户私钥是否与商户证书序列号匹配。
- 检查 `WECHAT_PAY_SERIAL_NO` 是否填写商户 API 证书序列号。
- 检查服务器时间是否明显偏差。
- 检查 `WECHAT_APP_ID` 和 `WECHAT_PAY_MCH_ID` 是否属于同一绑定关系。

### 回调验签失败

- 检查 `WECHAT_PAY_PLATFORM_CERT_PATH` 是否指向微信支付平台证书或平台公钥。
- 检查反向代理是否保留原始请求体；API 服务需要原始 body 验签。
- 检查回调头 `wechatpay-timestamp`、`wechatpay-nonce`、`wechatpay-signature` 是否完整到达应用。

### 支付成功但套餐未发放

- 检查回调是否到达 `/payments/wechat/notify`。
- 检查通知中的商户号是否等于 `WECHAT_PAY_MCH_ID`。
- 检查通知金额和币种是否与订单一致。
- 检查订单是否已经是终态，例如已取消、已退款或已发放。

## 7. 回滚方式

如果真实支付上线后出现阻塞问题：

1. 暂停小程序购买入口或下架相关套餐。
2. 保持回调接口可访问，避免已付款订单无法入账。
3. 排查失败订单，按微信商户平台交易记录人工核对。
4. 不要直接删除订单或用户套餐记录。
5. 修复后重新跑小额真实支付验收。

成功标志：已付款用户的订单都能核对清楚，没有重复发放或漏发套餐。
