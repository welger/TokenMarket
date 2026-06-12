# 本地开发与阶段一验收

本手册用于在本机启动 PostgreSQL、Redis、API 服务和运营后台，并验证阶段一完整流程。

## 隐私提醒

`.env` 属于隐私配置文件，不要提交到 Git。

不要把以下内容写进仓库、截图或聊天记录：

- 真实 API Key、密码、Cookie、验证码
- 身份证、银行卡、真实手机号
- 未公开的公司资料或生产数据库地址

固定种子只包含 `seed_phase_one_*` 测试记录、虚构经营主体和 `example.invalid` 地址。

## 1. 检查环境

在项目根目录运行：

```bash
node --version
pnpm --version
docker --version
```

要求：

- Node.js 不低于 22.12
- pnpm 10
- Docker 可以正常运行

成功标志：三个命令都输出版本号，没有 `command not found`。

## 2. 准备本地配置

复制环境变量样例：

```bash
cp .env.example .env
```

把 `.env` 中四个 `replace-with-...` 值替换为各自独立、至少 32 字符的本地随机字符串。

不要填写真实上游密钥。开发环境的固定供应商使用 `env:TEST_PROVIDER`，服务会选择内存测试供应商。

成功标志：`.env` 存在，且 `JWT_ACCESS_SECRET`、`API_KEY_PEPPER`、`AUDIT_IP_HASH_SECRET`、`ADMIN_LOGIN_THROTTLE_SECRET` 都不再是样例值。

## 3. 安装依赖并启动数据库

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps
```

风险：Docker 会占用本机 `127.0.0.1:5432` 和 `127.0.0.1:6379`，并创建本地开发数据卷。

成功标志：`postgres` 和 `redis` 都显示为 `healthy`。

## 4. 初始化数据库

先加载 `.env`，再执行迁移和固定测试种子：

```bash
set -a
source .env
set +a
pnpm --filter api-server prisma migrate deploy
pnpm --filter api-server prisma db seed
```

风险：命令会修改 `DATABASE_URL` 指向的数据库。执行前必须确认它是本地开发库，不能指向生产数据库。

固定测试管理员：

- 用户名：`phase-one-owner`
- 密码：`Local-only-phase-one-owner`

该密码仅用于本地测试，禁止用于生产环境或其他账号。

成功标志：终端显示 `Phase one local test data is ready.`。

## 5. 启动 API 和运营后台

打开两个终端，均先进入项目根目录并加载 `.env`。

终端一：

```bash
set -a
source .env
set +a
pnpm --filter api-server dev
```

终端二：

```bash
pnpm --filter @gateway/admin-web dev --port 54870
```

成功标志：

- API 监听 `http://127.0.0.1:3000`
- 后台显示 `http://127.0.0.1:54870`
- 使用固定测试管理员可以登录后台

## 6. 运行自动验收

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter api-server test:e2e -- platform-flow.e2e-spec.ts
```

风险：专项 e2e 会在本地数据库写入带随机后缀的模型、套餐、API Key 和订单，结束时自动清理。测试生成的 API Key 只在测试进程内使用，不要记录或复用。

成功标志：

- 四个命令退出码均为 `0`
- 专项 e2e 显示 `Tests: 1 passed`

## 7. 人工成功标志

登录运营后台后确认：

1. “供应商与模型”可以查看和维护模型。
2. “服务套餐”可以查看固定测试套餐。
3. “合规配置”显示虚构测试资料，生产模式默认关闭。
4. 使用测试流程创建的 API Key 调用 `/v1/chat/completions` 后，`/me/usage/summary` 和 `/me/api-calls` 同步出现扣减与调用日志。
5. “订单与财务”可以看到测试订单及付款状态。

看到以上结果，表示阶段一核心平台、运营后台和计量链路已经贯通。

## 8. 停止本地服务

API 和后台终端按 `Ctrl+C`。

停止数据库：

```bash
docker compose -f infra/docker-compose.yml down
```

该命令不会删除数据卷。不要使用批量删除目录或递归删除命令。

成功标志：`docker compose -f infra/docker-compose.yml ps` 不再显示运行中的服务。
