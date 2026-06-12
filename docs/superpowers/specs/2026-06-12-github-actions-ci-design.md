# GitHub Actions 完整 CI 设计

## 目标

为 TokenMarket 建立 Pull Request 和 `main` 分支的自动质量门禁。每次变更自动执行静态检查、单元测试、构建和完整端到端测试，并将结果显示在 GitHub Pull Request 页面。

## 触发范围

工作流在以下场景运行：

- 创建或更新以 `main` 为目标分支的 Pull Request。
- 代码合并或直接推送到 `main`。
- 管理员在 GitHub Actions 页面手动触发。

不在功能分支的普通推送上重复运行，避免同一提交同时消耗两次 Actions 额度。

## 工作流结构

使用一个 `.github/workflows/ci.yml` 工作流，包含两个并行任务：

### Quality

运行环境为 Ubuntu，使用 `actions/checkout@v6` 检出代码、`pnpm/action-setup@v6` 配置精确版本 pnpm `10.34.2`，并使用 `actions/setup-node@v6` 配置 Node.js 22 和 pnpm 缓存。

执行顺序：

1. 使用 `actions/checkout@v6` 检出代码。
2. 使用 `pnpm/action-setup@v6` 配置 pnpm `10.34.2`，再使用 `actions/setup-node@v6` 配置 Node.js 22 和 pnpm 缓存。
3. 使用 `pnpm install --frozen-lockfile` 安装依赖。
4. 执行 Prisma migration：`pnpm --filter api-server prisma migrate deploy`。
5. 执行 `pnpm lint`。
6. 在 `NODE_ENV=test` 下串行执行 API Jest（带 `--runInBand`），再依次执行 contracts 和 admin-web 测试。
7. 在 `NODE_ENV=production` 下执行 `pnpm build`。

当前 API 测试集中包含数据库完整性和事务测试，因此该任务也使用独立的 PostgreSQL 和 Redis service containers，并在测试前执行 migration。它不连接本地或生产数据库，不访问真实模型供应商，也不配置生产凭据。

### E2E

运行环境与 Quality 相同，并通过 GitHub Actions service containers 启动：

- PostgreSQL 16，数据库名和账号仅用于当前 CI 任务。
- Redis 7。

任务环境变量使用固定的 CI 测试值。所有密钥类变量都只用于测试环境，不具备生产权限，也不保存到 GitHub Secrets。Quality 和 E2E 各自拥有独立的一次性 service containers，不共享数据库状态。

执行顺序：

1. 检出代码并安装依赖。
2. 等待 PostgreSQL 和 Redis 健康检查通过。
3. 执行 Prisma migration。
4. 在 `NODE_ENV=test` 下使用 `--runInBand` 串行执行 API 服务的完整端到端测试。

E2E 任务使用独立、一次性的容器数据库，但该任务内的全部 E2E suites 共享这一套数据库。因此完整 E2E 必须串行运行，避免并发测试互相修改共享数据而产生不稳定失败。任务结束后由 GitHub 自动销毁数据库，不连接本地或生产数据库。

## 权限与安全

工作流顶层权限设置为只读：

```yaml
permissions:
  contents: read
```

工作流不使用 `pull_request_target`，防止 Pull Request 中未经信任的代码获得更高仓库权限。工作流不上传 `.env`、数据库内容、日志凭据或构建密钥。

测试环境变量必须满足以下规则：

- 不能使用真实 API Key、密码、Cookie、微信 AppSecret 或支付证书。
- 上游模型调用保持测试驱动，不访问真实供应商。
- 日志中不能输出鉴权密钥或请求正文。

## 并发控制

同一 Pull Request 或同一分支只保留最新一次运行。新提交到达时取消旧运行，避免过期测试继续占用额度：

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

## 分支保护衔接

工作流首次在 Pull Request 中成功运行后，GitHub 才会出现可选择的状态检查名称。届时在 `MainRules` 中启用 `Require status checks to pass`，并选择：

- `Quality`
- `E2E`

在这两个检查真实出现之前，不提前开启强制状态检查，避免 `main` 因找不到检查而无法合并。

## 失败处理

- Quality 失败：在对应步骤查看 lint、测试或构建错误。
- E2E 启动失败：先检查 PostgreSQL、Redis 健康状态和 migration 输出。
- E2E 测试失败：测试必须自行清理创建的数据，不保留容器或数据库快照。
- 不使用自动重试掩盖稳定性问题；修复后通过新提交重新运行。

## 验收标准

1. 本地 lint、串行 API 测试、contracts 测试、admin-web 测试和生产构建全部通过。
2. 工作流 YAML 可被 GitHub 正确解析。
3. Pull Request 页面同时显示 `Quality` 和 `E2E`。
4. 两个任务都显示绿色成功状态。
5. 工作流日志不包含真实凭据。
6. `MainRules` 最终要求上述两个状态检查通过后才允许合并。
