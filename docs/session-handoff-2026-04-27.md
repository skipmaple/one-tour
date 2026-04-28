# Session Handoff — 2026-04-27

> **目的**:云端沙盒 Claude session 收尾,你在本地 Claude Code 接续。
> 这份文档让下一个 Claude session 在 5 分钟内完整 onboard。
>
> 安全删除条件:Week 2 完成 + E2E 通过 + Week 3 PWA 启动后,即可归档。

## 🎯 立刻该做的(优先级降序)

1. **Week 2 - 6/7/8 收尾** — 上传重试 + 进度条 + 架构文档 v1.3。代码改动在 ~3-4 个文件。
2. **E2E 测试 compression 改动**(`543c1f8` 已 commit 但**未 deploy**) — 用 Playwright 跑 12 个用例(详见下方 "未交付的 E2E 测试" 章节)。
3. **24h 后 Vultr 销毁** — 生产 Phase 2 切换是 2026-04-27 ~09:13 UTC,**今天 ~09:13 UTC 就到点**。先看 Sentry 无新增错误,再去 Vultr 控制台 Delete 实例。
4. **48h 后 DNS TTL 改回 Auto** — Cloudflare → tour.skipmaple.com → TTL Auto。

---

## 📍 项目当前状态

### 生产环境(Phase 2 切换日已完成)

| 维度 | 状态 |
|---|---|
| **服务器** | 阿里云 SWAS HK 国际型 2C/4G(43.103.50.22),¥795/年 |
| **数据库** | Postgres 18 Kamal accessory,SWAS 同机 |
| **存储** | 阿里云 OSS HK(`one-tour-assets`),Active Storage **proxy mode** + 内网 endpoint |
| **备份** | OSS HK(`one-tour-backups`)每日 cron,30 天 lifecycle |
| **域名** | tour.skipmaple.com 仅 DNS(灰云直连 SWAS),SSL Let's Encrypt 自动续 |
| **旧资源(过渡期)** | Vultr NJ 待销毁(+24h);R2 配 30 天 lifecycle 自动清空 |

### 关键 commit(最近 15 个)

```
543c1f8 feat(upload): 客户端图片压缩 (browser-image-compression) ← 未 deploy
108e34c chore(kamal): proxy.hosts 改回 host 单字符串,撤掉 onetour.*
14690da docs(cutover): 补充 5 个切换日实战陷阱(OSS SigV4 bug 等)
6c04c4b chore(kamal): 移除 deploy.staging.yml,SWAS 已转 prod
976fcbd feat(storage): OSS 优先用内网 endpoint,省 ¥0.5/GB 出站流量
03168e8 fix(storage): Active Storage 切 proxy mode 绕开 OSS SigV4 兼容性 bug
abf9b4f fix(staging): proxy.host → hosts 数组,与 deploy.yml 统一
9f951e0 feat: cutover to SWAS HK + OSS HK ← 切换日核心
cf8cab5 docs(cutover): Phase 2 完整切换日 runbook
42d8179 fix(kamal): .kamal/secrets → .kamal/secrets-common
6904009 feat(kamal): 加 deploy.staging.yml 给 SWAS HK 当 staging 用
07a290d fix(backup): aws CLI 强制 OSS virtual-hosted-style 寻址
197b8bf fix(backup): 从 ossutil 切到 aws CLI
0a8845c feat(backup): Postgres 每日备份脚本 + 运维文档
d2fdd83 docs: 新疆出行架构方案
```

**生产正在跑**:`108e34c`(切换 + proxy mode + 内网 endpoint + 单 host)
**未 deploy 但已 commit**:`543c1f8`(图片压缩)

### 分支与 PR

- 分支:`claude/seo-basics-SMWCO`
- PR:**#49** — `docs: 新疆出行架构方案` 仍 open,base = main
- 所有 cutover 工作都堆在这个 PR 里。**还没合并 main**。

---

## 📋 Active Todos

```
✅ Phase 2 全部完成(迁移 + bug 修复 + 优化 + Sentry 检查)
✅ R2 lifecycle 30 天自动清理已配
🟡 +24h:Sentry 二检 + 销毁 Vultr(节省 $10/月)
🟡 +48h:Cloudflare DNS TTL 恢复 Auto
🟡 +30 天:R2 lifecycle 自动清空 + cleanup PR(移除 R2_* env / cloudflare service)
🟡 Week 2 修订版:server-side + 压缩路线
  ✅ 6 - 1: 安装 browser-image-compression
  ✅ 6 - 2: 共享压缩 util app/javascript/lib/image-compression.js
  ✅ 6 - 3: ActivityGalleryTab 集成压缩
  ✅ 6 - 4: AddExpenseDialog 集成压缩
  ✅ 6 - 5: ProfileSettingsModal 集成压缩
  🟡 6 - 6: 上传失败重试逻辑(指数退避 3 次)
  🟡 6 - 7: 上传进度条(XHR onprogress)
  🟡 6 - 8: 架构文档 v1.3(反映 Direct Upload 砍掉决策)
```

---

## ⚠️ 未交付的 E2E 测试(关键 gate!)

`543c1f8` 客户端图片压缩 commit **没经过 E2E**,只跑了 vitest 单测(519 通过)。**deploy 前必须验证**。

### 12 个测试用例

#### Activity Image(站点配图)

| # | 输入 | 预期 |
|---|---|---|
| 1 | 5MB JPEG | 压缩后 ~500-800KB WebP 上传,显示成功 |
| 2 | 200KB 小图 | **不压缩**直接上传 |
| 3 | GIF(带动画) | **不压缩**直接上传,GIF 仍能动画 |
| 4 | 60MB 大图 | "超过 50 MB,已跳过",无 HTTP 请求 |

#### Expense Receipt(费用小票)

| # | 输入 | 预期 |
|---|---|---|
| 5 | EDIT 模式 5MB JPEG | 压缩后立即上传,UI 看到 receipt |
| 6 | CREATE 模式 5MB JPEG | 压缩后**暂存**,保存 expense 后上传 |
| 7 | 6MB JPEG(原 5MB 限制) | 压缩后通过(因为压完 < 5MB) |
| 8 | 100MB 假大文件 | "超过 30 MB,已跳过" |

#### Avatar(头像)

| # | 输入 | 预期 |
|---|---|---|
| 9 | 5MB JPEG | 压缩到 ≤300KB / 512px 后保存 |
| 10 | PNG | 压缩成功(WebP 输出,服务端 Marcel 检测通过) |
| 11 | 取消选择(选了又取消) | form.avatar 重置为 null,头像回到原状 |
| 12 | 50MB 超大头像 | 压缩成功(浏览器 CPU 慢但完成),最终 < 1MB |

### 跑 E2E 的方式

**沙盒环境跑不了**(无 Ruby gems / Postgres / dev server),必须本地。

- **Option A**(快):写 vitest 测试 `app/javascript/lib/__tests__/image-compression.test.js` 覆盖 util 自身分支,再手动点击 12 个用例
- **Option B**(全面):安装 Playwright `npm i -D @playwright/test && npx playwright install chromium`,写 `tests/e2e/image-upload.spec.js`,自动化 12 个用例
- **Option C**:Capybara + Selenium(rspec-rails 系统测试)

**用户(skipmaple)选 Playwright**——继续这条路写 spec。下一个 Claude 接手后,创建:
- `playwright.config.js`(端口 9000,project base = http://localhost:9000)
- `tests/e2e/fixtures/`(各种大小的测试图片)
- `tests/e2e/helpers/auth.js`(用 Developer Login,见下方 dev login 笔记)
- `tests/e2e/image-upload.spec.js`(12 个用例)

**Developer Login 路径**:
- 仅开发环境可用,登录页有 "Developer Login" 按钮
- OmniAuth developer strategy
- Playwright 走这个最简单(免 OAuth)

---

## 🚨 切换日发现的关键工程陷阱(这些必须读!)

详见 [docs/swas-cutover.md](docs/swas-cutover.md) "已知陷阱" 章节,5 项总结:

1. **OSS SigV4 不验证 `response-content-disposition` 参数** → Active Storage presigned URL 报"bucket acl"误导消息 → **必须用 proxy mode** 绕开
2. **OSS 公网 vs 内网 endpoint** → SWAS 用 INTERNAL endpoint 流量免费(省 ¥50/月) → `storage.yml` 用 `OSS_ENDPOINT_INTERNAL.presence || OSS_ENDPOINT`
3. **Kamal 2 destination 合并** → `deploy.<dest>.yml` 与 `deploy.yml` 字段语法必须一致(都用 `host` 或都用 `hosts:`)
4. **multi-destination 共存期 host conflict** → 切换日先 `kamal app remove -d staging` 释放 host
5. **DNS 必须先切再 deploy** → Let's Encrypt HTTP-01 挑战要求

**对下一阶段开发的影响**:
- Direct Upload 不要做(被砍,因 OSS PUT presigned 也可能踩同样兼容性问题 + PWA 不友好)
- Active Storage 已设为 proxy mode → 浏览器看不到 OSS 域名,所有 blob 流量走 SWAS 转发(同 region 内网免费)

---

## 📚 必读文档(项目根 `docs/`)

| 文档 | 内容 |
|---|---|
| [xinjiang-trip-architecture.md](docs/xinjiang-trip-architecture.md) | 50 天交付计划 v1.2,7 周路线图 + 风险登记 |
| [swas-cutover.md](docs/swas-cutover.md) | 切换日 9 阶段 runbook + **5 个已知陷阱**(必读!) |
| [r2-to-oss-migration.md](docs/r2-to-oss-migration.md) | rclone 数据迁移流程 |
| [backup-restore.md](docs/backup-restore.md) | Postgres 备份与恢复 |
| [CLAUDE.md](CLAUDE.md) | 项目级指南 |
| [STYLE.md](STYLE.md) | 代码风格 |

---

## 🛠 关键文件(最近改动)

| 文件 | 状态 |
|---|---|
| `bin/backup-postgres` | Postgres 每日备份脚本(aws CLI 写 OSS) |
| `lib/tasks/storage.rake` | `storage:migrate_service_name` 切换 active_storage_blobs |
| `script/oss-compatibility-spike.rb` | OSS aws-sdk-s3 兼容性测试(11/11 ✅) |
| `config/storage.yml` | 加 `aliyun_oss` service,优先内网 endpoint |
| `config/environments/production.rb` | `:aliyun_oss` + proxy mode |
| `config/deploy.yml` | server/db host = SWAS,proxy.host = tour.* |
| `.kamal/secrets-common` | OSS_* + R2_* 凭证抽取(改名 secrets → secrets-common 适配 Kamal 2 destination) |
| `app/javascript/lib/image-compression.js` | **新**,共享压缩工具 |
| `app/javascript/components/activity-editor/ActivityGalleryTab.jsx` | 集成压缩(MAX_RAW_MB=50) |
| `app/javascript/components/planner/AddExpenseDialog.jsx` | 集成压缩(MAX_RAW_RECEIPT_BYTES=30MB) |
| `app/javascript/components/ProfileSettingsModal.jsx` | 集成压缩(头像 0.3MB / 512px override) |

---

## 🏥 生产健康检查(随时跑)

```sh
# 1. App 健康
curl -I https://tour.skipmaple.com/up
# 期望:HTTP/2 200

# 2. SSL 证书
echo | openssl s_client -connect tour.skipmaple.com:443 -servername tour.skipmaple.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
# 期望:subject CN=tour.skipmaple.com,issuer Let's Encrypt

# 3. SWAS 上容器
ssh root@43.103.50.22 'docker ps --format "table {{.Names}}\t{{.Status}}"'
# 期望:kamal-proxy / one-tour-db / one-tour-web-XXXXX 全 Up

# 4. 备份 OSS 上有今日 dump
aws s3 ls s3://one-tour-backups/postgres/$(date +%Y/%m/%d)/ \
  --endpoint-url https://oss-cn-hongkong.aliyuncs.com
```

**aws CLI 必须先一次性配** `addressing_style=virtual`:

```sh
aws configure set default.s3.addressing_style virtual
```

---

## 🚑 紧急回滚(如果生产挂)

切换后超过 30 分钟,**已无法回滚到 Vultr**(数据已分叉)。新方案:

```sh
# 1. 从 OSS 拉最新 backup
ssh root@43.103.50.22 'source /etc/one-tour-backup.env && /usr/local/bin/backup-postgres'

# 2. 如 Postgres 损坏,docker exec one-tour-db pg_restore ...(见 docs/backup-restore.md)

# 3. 如 SWAS 整个挂,新建 Vultr 紧急机器,从 OSS backup 恢复
#    详见 docs/swas-cutover.md 故障排查表
```

---

## 🛣 长期路线图(出行 6/14)

```
Week 1 (4/25-5/1)  ✅ 服务器迁移 + DR + Phase 2 切换
Week 2 (5/2-5/8)   🟡 上传链路改造 (压缩 ✅,重试/进度待做,文档 v1.3 待写)
Week 3 (5/9-5/15)  🔵 PWA 基础 (Service Worker + Workbox 分级缓存)
Week 4 (5/16-5/22) 🔵 PWA 离线写队列(BackgroundSync + iOS fallback)
Week 5 (5/23-5/29) 🔵 5 人 onboarding + 真机弱网测试
Week 6 (5/30-6/5)  🔵 Bug 修 + PDF 兜底导出 + WeChat 备份
Week 7 (6/6-6/13)  🔵 Feature freeze + 出发前 24h 缓存触发
```

距出行约 **47 天**(从 2026-04-28 起)。

---

## 🤝 给下一个 Claude 的建议

1. **第一件事**:读完 `docs/swas-cutover.md` "已知陷阱" 章节(5 项)。会避免重蹈覆辙。
2. **避免**:不要再尝试 Active Storage Direct Upload(被砍,见 Week 2 修订版决策)
3. **风格**:用户(skipmaple)注重**端到端验证**——任何代码改动 deploy 前必须 E2E。我犯的错是只跑 vitest 就推送 `543c1f8`。下次先写测试或先 manual E2E。
4. **commit 习惯**:这个项目用中文 commit message,Conventional Commits 格式(`feat(scope): ...`),trailer 加 `https://claude.ai/code/session_XXX`
5. **架构师 review**:用户偶尔会要求"高级架构师 review",意思是冷静评估当前方案的过度工程 / 时间风险。**砍范围 > 加功能**。

---

## 📦 给本地 Claude 的启动 prompt(可复制)

```
我从一个云端沙盒 Claude session 转到本地 Claude Code 继续。
请先读 docs/session-handoff-2026-04-27.md 了解项目当前状态、
近期决策、未完成工作。读完后告诉我:
1. 你理解的 immediate next action 是什么
2. 你打算先做什么、为什么
3. 有什么不清楚或要确认的

之后我们继续 Week 2 的 retry + progress 实现,
然后写 Playwright E2E 验证 compression。
```

---

**文档版本**:1.0
**生成时间**:2026-04-28 06:19 UTC
**生成 session**:云端沙盒
**接收**:本地 Claude Code
