# 新疆出行架构方案

> **目标场景**:5 人小队 2026 年 6 月中旬赴新疆伊犁(那拉提 / 赛里木湖 / 夏塔 / 昭苏)旅行,期间使用 one-tour 协作规划行程、记录开支、上传照片视频。
>
> **核心约束**:深山景区频繁无信号 · 民宿 WiFi 弱且不稳 · 50 天交付窗口 · 单人开发 · 不做 ICP 备案

## TL;DR

| 项 | 决策 |
|---|---|
| **服务器** | 阿里云国际版 SWAS 香港 2C/4G(¥98/月,流量无限) |
| **存储** | Cloudflare R2 不变 |
| **DNS** | Cloudflare 解析(灰云直连),非代理 |
| **数据库备份** | `pg_dump` cron → R2,每日,保留 30 天 |
| **上传链路** | Active Storage Direct Upload(R2 自动 multipart) |
| **图片优化** | 客户端 `browser-image-compression` 转 WebP + resize |
| **离线读** | Service Worker + Workbox `CacheFirst` 缓存上次响应 |
| **离线写** | Workbox `BackgroundSyncPlugin`(Android)+ App 重启检查队列(iOS fallback) |
| **冲突解决** | 简单乐观锁(`updated_at` 比较)+ 弹窗提示,不上 PaperTrail / CRDT |
| **兜底** | PDF 行程导出存微信 / 邮箱 / 5 人手机 |

总成本约 ¥120/月。客户端工程占主体,基础设施是配角。

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
│  阿里云国际版 SWAS HK 2C/4G                                 │
│                                                             │
│  ├─ one-tour-app (Docker, Kamal 部署)                       │
│  ├─ postgres 18 (Kamal accessory, 同机)                     │
│  └─ solid-queue (in-puma)                                   │
└────────┬────────────────────────────────────────────────────┘
         │
         ├──── pg_dump 每日 → R2 backup bucket
         │
         └──── Active Storage Direct Upload
                    │
                    ▼
              ┌──────────────────┐
              │  Cloudflare R2   │
              │  · 主 bucket     │
              │  · backup bucket │
              └──────────────────┘
```

## 技术栈

| 层 | 选型 | 替换 / 不引入 |
|---|---|---|
| 应用服务器 | 阿里云国际版 SWAS HK 2C/4G | 替换 Vultr NJ |
| 数据库 | Postgres 18(同机 Docker accessory) | 不引入托管 PG |
| 对象存储 | Cloudflare R2(主)+ R2 backup bucket | 不切 OSS / 七牛 |
| 上传 | Active Storage Direct Upload + R2 multipart | 不引入 tus / tusd |
| 客户端图片压缩 | `browser-image-compression` → WebP | - |
| Service Worker | Workbox(`workbox-webpack-plugin` 通过 Vite 集成) | 不手写 SW |
| 离线写队列 | `BackgroundSyncPlugin` + 自管理 IndexedDB | 不引入 Dexie |
| 冲突解决 | 乐观锁(`updated_at` 比较)+ 弹窗 | 不引入 PaperTrail / CRDT |
| 网络检测 | `navigator.connection` + `navigator.onLine` + 主动 ping `/up` | - |
| DNS | Cloudflare(灰云,DNS only) | 关闭 CF 代理 |
| 监控 | Sentry(已有)+ Better Stack uptime monitor | 不上 APM |

## 实施计划(7 周 + 1 周 buffer)

### Week 1(4/25 – 5/1)— 基础设施 + 备份

- [ ] 注册 / 验证阿里云国际版账号,购买 SWAS HK 2C/4G 年付
- [ ] 写 `bin/backup-postgres` 脚本:`pg_dump` → 上传 R2 → 7/30 天分级保留
- [ ] 在当前 Vultr 上跑通备份并实测一次完整恢复(在本地 docker)
- [ ] 在新 SWAS 上从备份恢复,验证数据完整性
- [ ] 更新 `config/deploy.yml` 指向新 IP,Kamal 部署
- [ ] DNS 切换 + 观察 48 小时,旧 Vultr 暂留 7 天后销毁

**交付物**:迁移完成 + DR 演练完成 + 备份脚本上 cron。

### Week 2(5/2 – 5/8)— 上传链路改造

- [ ] 启用 Active Storage Direct Upload(`form.file_field :photo, direct_upload: true`)
- [ ] 前端集成 `browser-image-compression`:HEIC/JPEG → WebP,长边 ≤ 2048px
- [ ] 实测视频上传(50–500 MB)走 R2 multipart
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
- ❌ 七牛云 / 又拍云 / VOD 服务(R2 + 客户端压缩够)
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
| R2 在新疆访问被 Cloudflare 域名问题影响 | 中 | 中 | R2 用自定义域名(如 `assets.your-domain.com`)绑定,避开默认 r2 域名 |
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

3. **第三刀:砍服务器迁移**
   - 失:延迟改善
   - 留:数据备份 + PDF 导出
   - 影响:继续 Vultr NJ,体验回到当前

4. **底线:仅 PDF 导出 + 现状部署**
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

**版本**:v1.0(2026-04-25)
**作者**:架构评审收敛后产物
**状态**:已批准实施 · Week 1 进行中
