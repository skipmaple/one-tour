# 新疆出行架构方案

> **目标场景**:5 人小队 2026 年 6 月中旬赴新疆伊犁(那拉提 / 赛里木湖 / 夏塔 / 昭苏)旅行,期间使用 one-tour 协作规划行程、记录开支、上传照片视频。
>
> **核心约束**:深山景区频繁无信号 · 民宿 WiFi 弱且不稳 · 50 天交付窗口 · 单人开发 · 不做 ICP 备案

## TL;DR

| 项 | 决策 |
|---|---|
| **服务器** | 阿里云中国站 SWAS 香港国际型 2C/4G(¥66/月 = ¥795/年,流量无限) |
| **存储** | 阿里云 OSS 香港(主)+ R2 保留 30 天作为回滚保险 |
| **DNS** | Cloudflare 解析(灰云直连),非代理 |
| **数据库备份** | `pg_dump` cron → OSS HK,每日,30 天 lifecycle 滚动 |
| **上传链路** | Active Storage Direct Upload(OSS HK + S3 兼容 multipart) |
| **图片优化** | 客户端 `browser-image-compression` 转 WebP + resize |
| **离线读** | Service Worker + Workbox `CacheFirst` 缓存上次响应 |
| **离线写** | Workbox `BackgroundSyncPlugin`(Android)+ App 重启检查队列(iOS fallback) |
| **冲突解决** | 简单乐观锁(`updated_at` 比较)+ 弹窗提示,不上 PaperTrail / CRDT |
| **兜底** | PDF 行程导出存微信 / 邮箱 / 5 人手机 |

总成本约 ¥80–120/月(SWAS 年付摊销 ¥66 + OSS 存储+流量 ¥10–40 视用量)。客户端工程占主体,基础设施是配角。

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  客户端(手机 + 笔记本,PWA)                                 │
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │  Inertia.js + React 页面         │                       │
│  └────────────┬─────────────────────┘                       │
│               │                                             │
│               ▼                                             │
│  ┌──────────────────────────────────┐                       │
│  │  Service Worker (Workbox)        │                       │
│  │  · CacheFirst: 静态资源 + GET    │                       │
│  │  · BackgroundSync: 失败 POST     │                       │
│  │  · 顶部"X 条待同步"徽标          │                       │
│  └────┬─────────────────────────┬───┘                       │
│       │ 在线                    │ 离线 / 失败               │
│       ▼                         ▼                           │
│  Rails 后端                  IndexedDB 队列                 │
│                              (Workbox 自管理,不引 Dexie)    │
└───────┬─────────────────────────────────────────────────────┘
        │ HTTPS
        ▼
┌─────────────────────────────────────────────────────────────┐
│  阿里云中国站 SWAS HK 国际型 2C/4G                          │
│                                                             │
│  ├─ one-tour-app (Docker, Kamal 部署)                       │
│  ├─ postgres 18 (Kamal accessory, 同机)                     │
│  └─ solid-queue (in-puma)                                   │
└────────┬────────────────────────────────────────────────────┘
         │
         ├──── pg_dump 每日 ──┐
         │                     │
         └──── Active Storage  │
               Direct Upload   │
                    │          │
                    ▼          ▼
              ┌──────────────────────────┐
              │  阿里云 OSS HK           │
              │  · one-tour-assets       │  ← 主存储(媒体)
              │  · one-tour-backups      │  ← DB 备份
              │  (同 region 内网,免流量) │
              └──────────────────────────┘

              ┌──────────────────┐
              │  Cloudflare R2   │  ← 30 天回滚期保留
              │  (旧主存储,只读) │     之后清理
              └──────────────────┘
```

## 技术栈

| 层 | 选型 | 替换 / 不引入 |
|---|---|---|
| 应用服务器 | 阿里云中国站 SWAS HK 国际型 2C/4G | 替换 Vultr NJ |
| 数据库 | Postgres 18(同机 Docker accessory) | 不引入托管 PG |
| 对象存储 | 阿里云 OSS HK · 主 bucket + 备份 bucket | 替换 R2 · 不切七牛/又拍 |
| 上传 | Active Storage Direct Upload + OSS S3 兼容 multipart | 不引入 tus / tusd |
| 客户端图片压缩 | `browser-image-compression` → WebP | - |
| Service Worker | Workbox(`workbox-webpack-plugin` 通过 Vite 集成) | 不手写 SW |
| 离线写队列 | `BackgroundSyncPlugin` + 自管理 IndexedDB | 不引入 Dexie |
| 冲突解决 | 乐观锁(`updated_at` 比较)+ 弹窗 | 不引入 PaperTrail / CRDT |
| 网络检测 | `navigator.connection` + `navigator.onLine` + 主动 ping `/up` | - |
| DNS | Cloudflare(灰云,DNS only) | 关闭 CF 代理 |
| 监控 | Sentry(已有)+ Better Stack uptime monitor | 不上 APM |

## 实施计划(7 周 + 1 周 buffer)

### Week 1(4/25 – 5/1)— 基础设施 + 备份 + 存储迁移

**Track A — 服务器迁移 Vultr → SWAS HK**

- [x] 购买 SWAS HK 2C/4G(已下单,中国站国际型 ¥795/年)
- [x] SSH 密钥 / 防火墙 / 系统准备 / OSS bucket / DNS 准备
- [x] `bin/backup-postgres` 脚本(`pg_dump` → OSS HK,30 天 lifecycle 管理)
- [x] `docs/backup-restore.md` 运维文档
- [ ] 在当前 Vultr 上跑通备份并实测一次完整恢复(本地 docker 验证)
- [ ] 在新 SWAS 上初始化 Docker + Kamal 准备
- [ ] 从 OSS 拉备份恢复到新 SWAS,验数据完整性
- [ ] 更新 `config/deploy.yml` 指向新 IP

**Track B — 存储迁移 R2 → OSS HK**

- [ ] 创建生产 OSS bucket(`one-tour-assets`)+ RAM 子账号(只给该 bucket 读写权限)
- [ ] `config/storage.yml` 加 `aliyun_oss` service,沿用 `aws-sdk-s3`(OSS S3 兼容)
- [ ] 安装 `rclone`,配置 R2 source + OSS dst,**初次全量 sync**
- [ ] 准备 `bin/migrate-blobs-service-name`(更新 `active_storage_blobs.service_name`)
- [ ] 在 staging / 本地 docker 验证:用 OSS 配置启 Rails,旧 blob 能读、新 blob 能写

**Track C — 切换日(A + B 一起切)**

- [ ] 应用停机窗口 5–10 分钟
- [ ] `rclone sync R2 → OSS`(增量,catch up 停机前的新 blob)
- [ ] 跑 `migrate-blobs-service-name`
- [ ] DNS 切到新 SWAS IP,Active Storage 配置切到 OSS
- [ ] Smoke test:登录 / 创建活动 / 看历史照片 / 上传新照片
- [ ] 观察 48 小时
- [ ] 旧 Vultr 暂留 7 天后销毁
- [ ] 旧 R2 bucket 暂留 30 天作回滚保险,之后清理

**交付物**:服务器 + 存储双迁完成 · DR 演练完成 · 备份脚本上 cron · R2 仅作只读回滚源。

### Week 2(5/2 – 5/8)— 上传链路改造

- [ ] 启用 Active Storage Direct Upload(`form.file_field :photo, direct_upload: true`)
- [ ] 前端集成 `browser-image-compression`:HEIC/JPEG → WebP,长边 ≤ 2048px
- [ ] 实测视频上传(50–500 MB)走 OSS multipart(SDK 自动分片)
- [ ] OSS bucket CORS 配置(允许浏览器 PUT / POST direct upload)
- [ ] 上传失败基础重试(指数退避 3 次)
- [ ] UI:上传进度条 + 暂停 / 取消按钮

**交付物**:照片视频上传链路从源头省 70%+ 流量,失败可重试。

### Week 3(5/9 – 5/15)— PWA 基础

- [ ] Vite 接入 `vite-plugin-pwa`(基于 Workbox)
- [ ] manifest.json + icons + "添加到主屏幕"配置
- [ ] Service Worker `CacheFirst` 策略:静态资源 + GET 请求
- [ ] iOS Safari + Android Chrome 真机测试 PWA 安装
- [ ] 飞行模式下能打开 App 看上次内容

**交付物**:5 人手机能装上 PWA,断网能读上次访问的页面。

### Week 4(5/16 – 5/22)— 写队列 + 状态 UI

- [ ] Workbox `BackgroundSyncPlugin` 拦截失败的 POST/PATCH/DELETE
- [ ] iOS fallback:App 重新打开时主动检查 IndexedDB 队列并重发
- [ ] 顶部状态徽标:`已同步` / `X 条待同步` / `离线`
- [ ] 点击徽标查看队列详情:每条状态 + 重试 / 放弃按钮
- [ ] 关键路径走通:离线创建费用 / 编辑节点 / 触发上传 → 联网后自动同步

**交付物**:核心写操作有离线队列兜底,UI 透明展示同步状态。

### Week 5(5/23 – 5/29)— 5 人 onboarding + 真实测试

- [ ] 写"如何使用 one-tour PWA"图文教程
- [ ] 召集 5 人现场演练(面对面 1.5–2 小时)
- [ ] 每人手机装 PWA + 触发首次缓存
- [ ] Chrome DevTools 模拟弱网(Slow 3G / Offline)测试
- [ ] 收集 P0 / P1 bug 列表

**交付物**:5 人都能正常使用,bug 列表清晰。

### Week 6(5/30 – 6/5)— Bug 修复 + 兜底

- [ ] 修上一周所有 P0(影响核心使用)+ P1(影响体验)
- [ ] 实现 PDF 行程导出(全行程 + 关键联系信息)
- [ ] 生成微信分享版本(图文 + 链接)
- [ ] 写 [docs/runbook.md](runbook.md):出问题时怎么办

**交付物**:出行的最低保障兜底就绪。

### Week 7(6/6 – 6/13)— 冻结 + 出发准备

- [ ] **6/6 起 feature freeze**,只修严重 bug
- [ ] 5 人提前 7 天确认 PWA 已装、缓存已就位
- [ ] 关键内容纸质打印(住宿 / 紧急联系 / 大致路线)
- [ ] 出发前 24h:备份验证 + 服务器健康检查 + 最后一次 PWA 缓存触发

**交付物**:出发。

### Buffer(预留 5 个工作日)

应对必然的延期。每个 Week 都允许溢出 1 天到 buffer。

## 不在范围内

明确**不做**,避免 scope creep:

- ❌ tus 协议 / tusd 容器(Active Storage Direct Upload 已够)
- ❌ Dexie + IndexedDB 数据层(Workbox 自管理够用)
- ❌ PaperTrail + 冲突 UI / undo(乐观锁 + 弹窗够用)
- ❌ CRDT(Linear 都只在一个字段用,5 人小队完全过度)
- ❌ 七牛云 / 又拍云 / VOD 服务(OSS HK + 客户端压缩够)
- ❌ 阿里云 GA 全球加速(¥30/月,客户端做对后边际收益小)
- ❌ ICP 备案 + 国内云迁移(50 天窗口太紧 + 不想绑定中国云生态)
- ❌ APM(Skylight / Scout / Datadog)(Sentry 够用)
- ❌ 多机 HA / Postgres 流复制(单点故障靠备份和兜底,不靠冗余)
- ❌ Real-time 协作改造(已有 Action Cable 不动)
- ❌ 离线地图 / 高德地图 PWA 缓存(出行用高德 App 本身就够,不重造)
- ❌ Chat 功能离线化(AI 助手只在有网时用)

## 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Service Worker 在 iOS Safari 行为不符预期 | 高 | 中 | iOS fallback:App 打开时主动检查队列;UI 显示醒目"立即同步"按钮 |
| 阿里云 SWAS HK 在新疆某些 ISP 抽风 | 中 | 高 | 出发前找新疆朋友实测;PDF + 微信兜底 |
| `pg_dump` 备份在生产数据增长后超时 | 低 | 高 | 监控备份耗时;数据量 > 10 GB 时切 `pg_basebackup` |
| 5 人之一手机型号特别老,PWA 装不上 | 中 | 低 | 留 H5 模式作为降级访问;重要内容 PDF 兜底 |
| R2 → OSS rclone sync 数据丢失/不一致 | 低 | 高 | sync 后用 `rclone check` 双向校验;R2 保留 30 天作回滚源 |
| `active_storage_blobs.service_name` UPDATE 误伤 | 低 | 高 | 切换前先 SELECT COUNT 确认范围;事务包裹;DB 切前已有备份 |
| OSS RAM 凭证泄露(写权限) | 低 | 高 | 子账号仅授权 1 个 bucket 的最小权限;凭证仅在 `.env.production` |
| 视频上传在弱网下反复失败 | 高 | 中 | 视频默认仅 WiFi 上传;失败 3 次后让用户决定继续或放弃 |
| 用户在景区编辑产生冲突 | 低 | 低 | 乐观锁弹窗"张三刚才改过这里,确认覆盖?" |
| 50 天 timeline 延期 | 高 | 高 | Week 6 起按降级预案逐项砍功能,保底是 PDF |

## 降级预案

按 5 月底进度,如发现做不完,**按这个顺序砍功能**:

1. **第一刀:砍 Workbox `BackgroundSyncPlugin`**(保留 ServiceWorker `CacheFirst`)
   - 失:离线写队列
   - 留:离线读取上次内容
   - 影响:用户在山上写的费用记录会失败,需要手动重输,但能查看行程

2. **第二刀:砍 Service Worker / PWA 整体**
   - 失:离线读取
   - 留:Active Storage Direct Upload + 客户端压缩
   - 影响:必须有网才能用,但上传链路仍优化

3. **第三刀:砍 R2 → OSS 存储迁移**(保留 R2 主存储)
   - 失:OSS HK 同 region 上传性能优势
   - 留:服务器迁移 + 备份 + 客户端压缩
   - 影响:上传走 R2 路径,Xinjiang 体验略差但可用
   - 备份仍走 OSS HK(已经接好,不动)

4. **第四刀:砍服务器迁移**
   - 失:延迟改善
   - 留:数据备份 + PDF 导出
   - 影响:继续 Vultr NJ,体验回到当前

5. **底线:仅 PDF 导出 + 现状部署**
   - 5 人能在微信里查行程
   - 其他全部失败

## 成功标准

出行结束后,以下条件全部满足视为方案成功:

- [ ] 14 天行程中,**没有数据丢失**(费用 / 笔记 / 照片)
- [ ] 5 人都成功上传过至少 10 张照片到 one-tour
- [ ] 至少 1 人在景区(无信号)用过 App 查行程
- [ ] 至少 3 次"离线写 → 回到 WiFi 后自动同步"的成功案例
- [ ] 没有任何一次"应用打不开 / 数据全丢"的灾难
- [ ] 每日 Postgres 备份全程无失败
- [ ] 出行期间总宕机时间 < 2 小时

## 出行后回顾

旅行结束后,按以下顺序处理:

1. 收集 5 人使用反馈
2. 评估每个组件的实际效果(哪些值,哪些不值)
3. 决定 one-tour 是否长期演进
   - 长期 → 考虑升级 Phase 3(真 local-first / Dexie),迁国内 + 备案
   - 短期 → 维持当前架构,只修严重 bug
4. 服务器升级 / 降级决策(根据使用量)
5. 写一篇 retro,沉淀经验

---

**版本**:v1.1(2026-04-25 · R2 → OSS HK 收敛)
**作者**:架构评审收敛后产物
**状态**:已批准实施 · Week 1 进行中
