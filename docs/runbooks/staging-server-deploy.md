# 体验服务器部署手册

这份手册用于把 TokenMarket API 部署到体验服务器，并通过 aaPanel/nginx 反向代理到 `https://api-staging.yourtoken.work`。不要把 AppSecret、数据库密码、API Key、微信支付密钥、证书私钥、Cookie、身份证、银行卡或公司机密写进 Git、截图、Issue、PR 或聊天记录。

## 1. 目标架构

```text
https://api-staging.yourtoken.work
  -> aaPanel/nginx HTTPS
  -> http://127.0.0.1:3000
  -> Docker api service
  -> Docker postgres + redis
```

成功标志：浏览器或 curl 访问 `https://api-staging.yourtoken.work/public/models` 返回 JSON。

## 2. 服务器前置条件

服务器已完成：

- Debian 13 x64。
- Docker 和 Docker Compose 可用。
- aaPanel/nginx 已创建 `api-staging.yourtoken.work` 站点。
- 站点 SSL 已启用。
- 站点反向代理目标为 `http://127.0.0.1:3000`。
- 防火墙和云安全组开放 `80`、`443`，不开放 PostgreSQL `5432` 和 Redis `6379`。

验证：

```bash
docker compose version
sudo nginx -t
curl -I https://api-staging.yourtoken.work
```

如果 API 还没启动，`curl -I` 看到 `502` 是正常的，表示 nginx 和 HTTPS 已经通到反代层。

## 3. 拉取代码

```bash
cd /opt/tokenmarket
git clone https://github.com/welger/TokenMarket.git repo
cd /opt/tokenmarket/repo
```

如果目录已存在，使用：

```bash
cd /opt/tokenmarket/repo
git pull --ff-only origin main
```

成功标志：`git log -1 --oneline` 能看到最新提交。

## 4. 准备服务器环境变量

复制样例到服务器密钥目录：

```bash
cp /opt/tokenmarket/repo/infra/staging.env.example /opt/tokenmarket/secrets/api-server.env
chmod 600 /opt/tokenmarket/secrets/api-server.env
nano /opt/tokenmarket/secrets/api-server.env
```

必须替换这些值：

- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`
- `API_KEY_PEPPER`
- `AUDIT_IP_HASH_SECRET`
- `ADMIN_LOGIN_THROTTLE_SECRET`
- `WECHAT_APP_SECRET`

生成随机值示例：

```bash
openssl rand -hex 32
```

体验环境建议：

```bash
NODE_ENV=development
PAYMENT_DRIVER=test
WECHAT_TEST_LOGIN_ENABLED=false
WECHAT_APP_ID=wx5723c60f8a67a5e2
```

不要把 `api-server.env` 发到聊天或提交到 Git。

成功标志：`api-server.env` 存在且权限为 `600`。

## 5. 构建并启动服务

```bash
cd /opt/tokenmarket/repo
set -a
source /opt/tokenmarket/secrets/api-server.env
set +a
docker compose -f infra/docker-compose.staging.yml up -d --build
```

风险：第一次启动会创建 PostgreSQL 和 Redis Docker 数据卷，并在本机 `127.0.0.1:3000` 暴露 API。

说明：compose 默认读取 `/opt/tokenmarket/secrets/api-server.env`。只有在本地检查语法时才需要临时覆盖 `API_SERVER_ENV_FILE`。

成功标志：

```bash
docker compose -f infra/docker-compose.staging.yml ps
```

`api`、`postgres`、`redis` 均为运行中或 healthy。

## 6. 初始化数据库

```bash
cd /opt/tokenmarket/repo
set -a
source /opt/tokenmarket/secrets/api-server.env
set +a
docker compose -f infra/docker-compose.staging.yml run --rm api ./node_modules/.bin/prisma migrate deploy
docker compose -f infra/docker-compose.staging.yml run --rm api node .seed-dist/prisma/seed.js
docker compose -f infra/docker-compose.staging.yml up -d api
```

风险：迁移会修改体验环境 PostgreSQL。确认 `DATABASE_URL` 指向 compose 内的 `postgres` 服务，不是生产库。

说明：这里直接调用容器里的 `./node_modules/.bin/prisma`，避免 `pnpm prisma ...` 在非交互服务器环境里触发安装确认。

成功标志：seed 输出 `Phase one local test data is ready.`。

## 7. 验证 API

服务器本机验证：

```bash
curl -sS http://127.0.0.1:3000/public/models
curl -sS http://127.0.0.1:3000/public/compliance
curl -sS http://127.0.0.1:3000/public/plans
```

公网 HTTPS 验证：

```bash
curl -sS https://api-staging.yourtoken.work/public/models
curl -I https://api-staging.yourtoken.work/public/models
```

成功标志：

- 本机接口返回 JSON。
- HTTPS 接口返回 `200`。
- 响应头里没有证书错误。

## 8. 常见问题

### `502 Bad Gateway`

检查 API 是否运行：

```bash
docker compose -f infra/docker-compose.staging.yml ps
docker compose -f infra/docker-compose.staging.yml logs api --tail=120
curl -I http://127.0.0.1:3000/public/models
```

### API 启动失败

检查环境变量：

```bash
docker compose -f infra/docker-compose.staging.yml logs api --tail=160
```

不要把日志里的密钥值贴到聊天里。

### 微信登录失败

体验环境必须配置真实：

```bash
NODE_ENV=development
WECHAT_APP_ID=wx5723c60f8a67a5e2
WECHAT_APP_SECRET=服务器密钥文件里的真实值
WECHAT_TEST_LOGIN_ENABLED=false
```

AppSecret 只放 `/opt/tokenmarket/secrets/api-server.env`。

## 9. 停止服务

```bash
cd /opt/tokenmarket/repo
docker compose -f infra/docker-compose.staging.yml down
```

该命令不会删除数据卷。不要使用递归删除命令清理数据目录。
