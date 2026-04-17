# CI 修复与补全 — 设计文档

> **背景**：GitHub Actions CI 目前失败（`bin/importmap audit` 在非 importmap 项目上 exit 127；`bin/rubocop` 报 24 处格式违规）。同时缺两块关键验证：`rspec` 和 `vitest` 都没接入 CI，所以 agent/人改代码后 CI 绿色并不代表测试通过。本次目标是一次性修好完整 CI：修掉现有失败、加入测试、和刚完成的本地环境升级（Postgres 18 + Node 24）对齐。

---

## 当前状态

`.github/workflows/ci.yml` 的三个 job：

| Job | 命令 | 状态 |
|---|---|---|
| `scan_ruby` | `bin/brakeman --no-pager` | ✅ |
| `scan_js` | `bin/importmap audit` | ❌ exit 127（项目用 npm + Vite，未装 importmap） |
| `lint` | `bin/rubocop -f github` | ❌ 24 处 `Layout/*` 违规 |

缺失：
- `bundle exec rspec`（38 个 spec 文件，256 examples 本地全绿）
- `npm test`（21 个 spec 文件，150 tests 本地全绿）
- `npm audit`（CLAUDE.md 声称 CI 跑，实际不跑）

其他噪音：
- `actions/checkout@v4` 使用 Node 20，GitHub 已弃用
- `.github/workflows/ci.yml` 仍是 Rails 默认模板残留，与项目实际栈不符

---

## 目标状态

**3 个并行 job，每个 job 的 runtime setup 最小化**：

```
lint_scan  →  rubocop + brakeman                    (Ruby only)
test_ruby  →  rspec (带 postgres:18 service)         (Ruby + PG)
test_js    →  npm audit + vitest                     (Node only)
```

触发：`pull_request` + `push to main`（保持现状）。

---

## 设计

### 完整 ci.yml

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  lint_scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: .ruby-version
          bundler-cache: true
      - name: Scan for common Rails security vulnerabilities
        run: bin/brakeman --no-pager
      - name: Lint Ruby for consistent style
        run: bin/rubocop -f github

  test_ruby:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      RAILS_ENV: test
      DB_HOST: localhost
    steps:
      - uses: actions/checkout@v5
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: .ruby-version
          bundler-cache: true
      - name: Prepare test database
        run: bin/rails db:prepare
      - name: Run Ruby test suite
        run: bundle exec rspec

  test_js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version-file: .node-version
          cache: "npm"
      - run: npm ci
      - name: Audit JS dependencies
        run: npm audit --audit-level=high
      - name: Run JS test suite
        run: npm test
```

### 关键设计决策

1. **`lint_scan` 合并 brakeman 和 rubocop** — 都只需要 Ruby runtime，合并后省一份 `actions/checkout + setup-ruby` 开销。
2. **`test_js` 把 `npm audit` 和 `vitest` 放一起** — 都只需要 Node，同样省一份 setup。原 `scan_js` job 整个删除。
3. **`test_ruby` 的 Postgres service 镜像用 `postgres:18`** — 与本地刚升级完成的 `one-tour-postgres` 容器对齐。
4. **`DB_HOST=localhost`** — 精准对接 `config/database.yml` 里 `ENV.fetch("DB_HOST", "localhost")`，不需要改 Rails 配置。
5. **`bin/rails db:prepare`（不是 `db:create && db:migrate`）** — 幂等，有 `schema.rb` 时直接 `schema:load`，更快。
6. **`actions/checkout@v5` + `setup-node@v5`** — 消除 Node 20 deprecation 警告；同时让 dependabot 那个卡住的 "bump checkout from 4 to 6" PR 自动绿。
7. **`.node-version` 文件作为单一真源** — 本地 / CI / 以后接 mise 的 Node 都指向同一个文件，避免漂移。
8. **`concurrency` 组** — 同一个 PR 连续 push 时自动取消旧 run，省 CI 分钟且让最新结果更快出现；main 分支 push 不取消以保留完整历史。
9. **`npm audit --audit-level=high`** — 不让 moderate 级别的传递依赖漏洞阻塞 CI（往往无法修）。
10. **rubocop 跑 `-f github`（不是 `-a`）** — CI 做检查不做修复；修复在本地 `bin/rubocop -a` 手工做并入 commit。

### Rubocop 违规自动修复

本地 `bin/rubocop --format offenses` 目前汇总：

```
12  Layout/SpaceInsideArrayLiteralBrackets
6   Layout/CommentIndentation
4   Layout/SpaceInsideHashLiteralBraces
2   Style/StringLiterals
---
24  Total in 8 files
```

所有违规都标记为 `Safe Correctable`，`bin/rubocop -a` 一次跑完自动修复。

---

## 变更文件列表

| 路径 | 动作 |
|---|---|
| `.github/workflows/ci.yml` | 完全重写（按上述 yaml） |
| `.node-version` | 新建，内容：`24` |
| 以下 8 个文件 | `bin/rubocop -a` 自动修复 24 处违规 |

Rubocop autofix 会改动的 8 个文件：

- `Gemfile`
- `app/models/oauth_identity.rb`
- `config/initializers/content_security_policy.rb`
- `config/initializers/omniauth.rb`
- `db/migrate/20260412202545_create_oauth_identities.rb`
- `db/migrate/20260412203215_create_guidebook_memberships.rb`
- `db/migrate/20260413083904_create_conversations.rb`
- `spec/factories/oauth_identities.rb`

**不改的文件**：
- `config/database.yml` — 已经支持 `DB_HOST` env，无需改
- `mise.toml` — 刚确认不管 Node（用户偏好）
- `.github/dependabot.yml` — 不属于本次范围
- `package.json` / `Gemfile` — 无需改
- `spec/**` / `app/javascript/**/__tests__/**` — 测试本身不改

---

## 提交计划

**一个 commit 覆盖所有变更**（选用方案 B）：

```
ci: rewrite — rspec + vitest + postgres:18, fix lint, align runtimes

- Delete dead `bin/importmap audit` scan_js job (project uses npm/Vite)
- Merge brakeman + rubocop into single `lint_scan` job
- Add `test_ruby` job with postgres:18 service container
- Add `test_js` job combining `npm audit --audit-level=high` + vitest
- Upgrade actions/checkout@v4 → @v5 (removes Node 20 deprecation)
- Pin Node 24 via new .node-version file
- Add concurrency group to cancel superseded PR runs
- Apply `bin/rubocop -a` to fix 24 auto-correctable offenses
```

---

## 验证（本地 + CI）

**本地预检**（提交前跑一遍）：

```bash
mise exec -- bundle exec rubocop           # 应该 0 offenses (autofix 之后)
mise exec -- bundle exec brakeman --no-pager
mise exec -- bundle exec rspec             # 256 examples, 0 failures
npm ci
npm audit --audit-level=high               # 应该通过
npm test                                   # 150 tests passed
```

**远端验证**（push 后）：
- 3 个 job 全绿（lint_scan / test_ruby / test_js）
- 无 "Node.js 20 actions are deprecated" 警告
- dependabot 的 "bump actions/checkout from 4 to 6" PR 自动关闭或被更新（因为 v5 已覆盖该次升级路径）

**回归检查**（合到 main 后观察）：
- 下一次 dependabot 每日更新 CI 应该全绿
- 下一次人工 PR 应该看到 3 个 check

---

## 明确不做（Non-goals）

- ❌ matrix 跑多 Ruby / Node / PG 版本（单人项目单版本足够）
- ❌ Playwright / system specs / e2e
- ❌ 代码覆盖率报告（simplecov / codecov 接入）
- ❌ 自定义 artifact 缓存或跨 job 缓存（只依赖 `bundler-cache: true` 和 `cache: "npm"` 的默认行为）
- ❌ 改 `dependabot.yml` 配置
- ❌ 把数据库名 `tour_of_xinjiang_app_*` 改成 `one_tour_*`（另一项独立的 scope）
- ❌ 改 README 里"PostgreSQL 14+"那行（另一项独立的 scope）
- ❌ Sentry / 生产可见性 / 每日 smoke test（在更宽的 `/Users/drewlee/.claude/plans/why-your-ai-first-strategy-playful-porcupine.md` 那份分析里标为 backlog）
