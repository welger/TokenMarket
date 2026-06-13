# 生产环境变量部署清单设计

## 目标

为生产上线准备一份可执行的环境变量和密钥部署清单，覆盖 API 服务、数据库、Redis、JWT、API Key、微信登录、微信支付、上游模型、反向代理、域名和监控相关配置。

## 输出范围

新增：

- `docs/runbooks/production-env-checklist.md`

修改：

- `docs/runbooks/production-launch-checklist.md`

## 设计原则

- 不填写真实密钥、密码、证书正文、Cookie 或公司机密。
- 每项配置说明用途、是否必填、生产要求、禁止事项、验证方式和成功标志。
- 区分“基础必填”“生产安全强制”“微信登录”“微信支付”“上游模型”“网络与反向代理”“运行验证”。
- 与 `.env.example` 和 `apps/api-server/src/common/config/env.schema.ts` 保持一致。
- 明确 `NODE_ENV=production` 时禁止 `PAYMENT_DRIVER=test` 和 `WECHAT_TEST_LOGIN_ENABLED=true`。

## 验收标准

- 清单覆盖 env schema 中所有生产相关变量。
- 上线清单能链接到生产环境变量部署清单。
- 文档没有真实密钥、证书正文、Cookie、Bearer Token、身份证或银行卡。
- 清单能让部署人员逐项确认“是否配置、在哪里配置、如何验证”。
