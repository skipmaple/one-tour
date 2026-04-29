# Week 3 PWA 基础:vite-plugin-pwa + 分级缓存 + 离线读

**日期**:2026-04-28
**作者**:skipmaple + Claude
**背景**:Week 2 上传链路已落地,生产 deploy 通过,17 commits 在 main(PR #49 squash + #52 R2 cleanup hotfix + #53 backup checksum hotfix)。距出行 47 天(2026-06-14),进入架构 doc v1.4 标的 Week 3:**PWA 基础**,目标"5 人手机能装上 PWA,断网能读上次访问的页面"。

Rails 8 默认 layout 已留 `apple-mobile-web-app-capable` + apple-touch-icon hooks(commented 状态),`vite-plugin-pwa` 未装,无 Service Worker,manifest commented。Phase 4 的 Playwright + 18 用例骨架已在仓内,本 spec 在其上扩 5 个 PWA 用例。

---

## 目标

1. 用 `vite-plugin-pwa`(基于 Workbox 7.x)注入 Service Worker,接管浏览器 fetch 路由
2. 启用 Rails 8 自带的 `/manifest` route + 修内容(品牌色 + 中文描述 + 颜色)
3. 实现分级缓存:NetworkFirst Inertia GETs / CacheFirst static + Active Storage / NetworkOnly auth 流
4. 接受激进的自动更新策略(`autoUpdate + skipWaiting + clientsClaim`),5 人始终一个版本
5. Playwright + 5 个 E2E 用例验证 manifest / SW 注册 / 缓存命中 / offline fallback / NetworkOnly 失败
6. Lighthouse PWA score ≥ 90

## 非目标

明确 v1 不做(防 scope creep):

- ❌ Workbox `BackgroundSyncPlugin` / 离线写队列 —— Week 4 范围
- ❌ 离线状态 banner / 顶部"已同步 / X 条待同步" 徽标 —— Week 4 范围
- ❌ Logout 时清 user-specific cache —— 5 人个人手机无 multi-user 风险,onboarding 文档(Week 5)告知"PWA 给个人用"
- ❌ 真品牌图标设计 —— 保持 Rails 默认红圆 placeholder,等真设计师(出行后)
- ❌ Sentry 在 SW context 里捕获错误 —— 跨 SW 复杂度高,Workbox 自带 logging 够用
- ❌ Push 通知 —— 架构 doc 明确不做
- ❌ iOS 7 天清理的应用层提醒 —— Onboarding 文档(Week 5)告知用户
- ❌ Pre-cache 用户特定 tour 数据 —— Workbox precache 只装 build assets,tour 数据靠 NetworkFirst lazy-cache
- ❌ vite-plugin-pwa 自带 PWA install prompt UI —— 静默 autoUpdate,浏览器原生 install banner 已够

## 设计约束

- **纯 ESM**,无 TS。Vite + vite-plugin-pwa 一等公民支持
- **Mantine v9** + `notifications` 系统(本 phase 不用,因为 autoUpdate 静默,但 § 5 测试用)
- **不引入新 hard dependency** 除 `vite-plugin-pwa` 自身(和它的 transitive Workbox)
- **不动 Rails 后端**(只取消 layout link tag commented 状态 + 改 manifest.json.erb 内容)

---

## 架构总览

```
Browser
 ├─ React + Inertia.js (主线程)
 │
 ├─ Service Worker (vite-plugin-pwa 注入)
 │    ├─ Precache:Vite build hashed assets 全集(自动)
 │    ├─ Runtime cache:
 │    │    ├─ NetworkFirst:Inertia GET (X-Inertia: true)
 │    │    ├─ CacheFirst:Active Storage blob redirect / variant
 │    │    └─ NetworkOnly:auth / login / up
 │    ├─ skipWaiting + clientsClaim (Q2 决策,§ 3)
 │    └─ Update detected → 静默接管,不弹 toast
 │
 └─ manifest.json (Rails ERB 提供,start_url=/, display=standalone, theme=#1971c2)
```

**单一信息源**:Rails ERB 是 manifest 唯一出处,vite-plugin-pwa 的 `manifest: false` 关闭其自带生成。

**新增文件**:
- `app/javascript/lib/pwa-register.js`(SW 注册胶水)
- `app/javascript/lib/__tests__/pwa-register.test.js`(4 个 vitest)
- `tests/e2e/pwa.spec.js`(5 个 Playwright)

**修改文件**:
- `vite.config.ts`(加 `VitePWA(...)` plugin)
- `app/views/pwa/manifest.json.erb`(内容更新)
- `app/views/layouts/application.html.erb`(取消 manifest link 注释)
- `app/javascript/entrypoints/inertia.jsx`(主 entrypoint 调一次 `import './lib/pwa-register'`,SW per-origin 全局生效,不用其他 entrypoint 重复)
- `package.json`(`+vite-plugin-pwa` devDep)
- `docs/xinjiang-trip-architecture.md`(v1.4 → v1.5)

---

## 缓存路由矩阵

逐一列死所有路径,**Workbox 按这个顺序匹配**:

### NetworkOnly(不缓存)

| 模式 | 原因 |
|---|---|
| `^/auth/.*` | OAuth callback / Developer login form,session 关键 |
| `^/login(_test)?$` | 登录入口,必须 fresh |
| `^/logout$` | 必须 server 销毁 session |
| `^/up$` | health check(实际只 kamal-proxy 内网调,不走 SW,但保险列上) |
| 任何非 GET method(POST/PATCH/DELETE) | Workbox 默认就只为 GET 注册 route,非 GET 天然走网络 |

### CacheFirst(优先缓存)

| 模式 | maxEntries | maxAgeDays | 原因 |
|---|---|---|---|
| Vite precacheManifest 自动注入 | — | — | hashed assets,文件名变就自然替换 |
| `^/icon\.(svg\|png)$` | 5 | 90 | PWA 图标,变化频率极低 |
| `^/rails/active_storage/blobs/(proxy\|redirect)/.*` | 100 | 30 | Active Storage blob URL;production.rb 当前是 proxy mode (`resolve_model_to_route = :rails_storage_proxy`),redirect 兜底以备 storage backend 切回。blob digest 在 URL 里 |
| `^/rails/active_storage/representations/(proxy\|redirect)/.*` | 100 | 30 | variant URL,同上 |

`maxEntries` 用 Workbox `ExpirationPlugin` 触发 LRU 淘汰。

### NetworkFirst(优先网络,失败用缓存)

| 模式 | 条件 | maxEntries | maxAgeDays |
|---|---|---|---|
| Inertia GETs | `request.headers.get('X-Inertia') === 'true'` 且 method=GET | 50 | 7 |

```js
registerRoute(
  ({ request }) =>
    request.method === 'GET' &&
    request.headers.get('X-Inertia') === 'true',
  new NetworkFirst({
    cacheName: 'inertia-pages',
    plugins: [ new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 }) ],
  })
)
```

**为什么不用 URL 模式**:Inertia 路由覆盖整 app,列所有 path 太脆;`X-Inertia` header 是稳定契约 marker。

### 显式不处理

- `https://jsapi-data*.amap.com/*` —— 高德地图瓦片,跨域 fetch,SW scope 外
- `https://o4*.ingest.us.sentry.io/*` —— Sentry envelope POST,跨域 + POST,默认跳过
- `wss://...../cable` —— Action Cable WebSocket,SW 不拦截

### Multi-user 隐私 edge case

NetworkFirst 在 **离线** 状态下命中 cache 可能展示前一个用户的数据。**5 人出行场景每人自己手机,不存在同设备多用户**。Week 3 不做 logout 清缓存。Onboarding 文档(Week 5)加一句"PWA 给个人用,不要在他人手机装"。

---

## SW 更新生命周期

`autoUpdate + skipWaiting + clientsClaim`(Q2 选 C):

```
T0  push main → CI → kamal deploy → 新 sw.js + assets 就绪
T1  用户下次打开 PWA(可能 1 小时,可能明天)
T2  浏览器后台:发现 sw.js 字节变 → install 新 SW
T3  install 完 → skipWaiting() 立即激活
T4  activate() 后调 clients.claim() → 接管所有 tab
T5  next request 起,统一走新 SW handler
T6  老 React app 发出的 fetch 走新 SW(老业务逻辑 + 新缓存策略)
T7  下次 navigate → Inertia version 不匹配 → full reload → 完整新版
```

### vite-plugin-pwa 配置

```js
VitePWA({
  registerType: 'autoUpdate',
  manifest: false,                           // 关闭 plugin 自带生成,用 Rails ERB
  workbox: {
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [/* § 缓存路由矩阵 */],
  },
  injectRegister: 'auto',
})
```

### 用户感知

- **完全静默**(无 toast),5 人场景你 commit 后群里发消息让大家打开 App
- mid-flight 上传:Week 2 xhrRequest 的 retry 兜底自动恢复
- 老 React tree 的瞬时状态(modal 打开 / form 填一半)在 full reload 时丢失 —— 接受 trade-off,出行期间不 deploy

### 不做

- ❌ `controllerchange` listener 弹"已更新"toast(Q2 选 C 静默)
- ❌ `onNeedRefresh` / `onOfflineReady` callback(prompt 模式才用)
- ❌ 强制 `window.location.reload()`(Inertia version mismatch 自然处理)

---

## Manifest 配置

### 内容(`app/views/pwa/manifest.json.erb`)

```json
{
  "name": "OneTour",
  "short_name": "OneTour",
  "description": "5 人小队出行规划 · 行程 / 开支 / 照片",
  "icons": [
    { "src": "/icon.png", "type": "image/png", "sizes": "512x512" },
    { "src": "/icon.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" }
  ],
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#1971c2",
  "background_color": "#ffffff",
  "lang": "zh-CN",
  "dir": "ltr"
}
```

### Layout

`app/views/layouts/application.html.erb` 取消 commented 的 manifest link:

```erb
<%= tag.link rel: "manifest", href: pwa_manifest_path(format: :json) %>
```

### 与 vite-plugin-pwa 的协作

`manifest: false` 让 plugin 不自己生成 manifest,**Rails ERB 是单一信息源**。

### 图标

`/icon.svg` + `/icon.png`(512x512 红圆,Rails 8 默认)**不动**。Q3 A 决策,出行后再换真品牌图标。

---

## 测试方案

### Vitest 单测

`app/javascript/lib/__tests__/pwa-register.test.js`:

| # | 用例 |
|---|---|
| 1 | `registerSW(...)` 接收 onRegisteredSW callback,SW URL 正确 |
| 2 | controllerchange event(mock)路径正确 |
| 3 | autoUpdate 模式下 onNeedRefresh callback **不被调用**(静默) |
| 4 | 不支持 SW 的环境(`'serviceWorker' in navigator === false` —— 老 iOS / 微信内嵌特殊版本)gracefully no-op,不抛错 |

预估 4 个 case,~30 行测试。**Workbox 内部不测**(自带过测)。

### Lighthouse PWA Audit

**手动跑**(deploy 后,不进 CI):

```sh
npx lighthouse https://tour.skipmaple.com \
  --only-categories=pwa \
  --output=html \
  --output-path=tmp/lighthouse-pwa.html
```

要求 score ≥ 90(SW 注册 / manifest 完整 / start_url 离线可达 / 主屏图标可识别 / HTTPS)。报告 path 加 `.gitignore`,只 commit 不进 git。

### Playwright E2E

`tests/e2e/pwa.spec.js`(5 用例):

| # | 用例 | 验法 |
|---|---|---|
| P1 | manifest 字段正确 | `page.goto('/manifest')` + `expect(json).toMatchObject({name:'OneTour', display:'standalone',...})` |
| P2 | SW 注册成功 | `navigator.serviceWorker.ready` resolved + scope = `/` |
| P3 | static asset CacheFirst 命中 | 第一次 → 第二次 offline → assets 仍可加载 |
| P4 | Inertia GET NetworkFirst 离线 fallback | `/tours` 在线 → offline → 再访问 → 看到 cached(无 modal)|
| P5 | NetworkOnly `/login` 离线失败 | offline 访问 `/login` → fail(不命中 stale cache) |

Playwright 用 `await context.setOffline(true)` 模拟 offline。

### 真机手动测试(必做)

| 场景 | iOS Safari | Android Chrome |
|---|---|---|
| 添加到主屏幕 | Share → 添加 → 看图标 | 浏览器 install prompt |
| 飞行模式打开 | 主屏点 OneTour → 看 cached `/tours` | 同 |
| 飞行模式 SPA 导航 | tour 内点击 → NetworkFirst fallback | 同 |
| 在线 → 离线切换 | 上传图片 → 飞行模式刷新 → 图还在 | 同 |
| Deploy 后更新 | push → 用户 next 打开 → 静默升级 | 同 |

**优先 iOS**(Safari PWA 限制最多)。

### 不做

- ❌ vitest mock Workbox SW(复杂度 >> 收益)
- ❌ iOS 7 天清理模拟(没法在 14 天测试窗口验证,文档化即可)
- ❌ Sentry SW capture 测试(范围外)

---

## 构建顺序

| # | Commit message | 内容 | 完成判定 |
|---|---|---|---|
| 1 | `feat(pwa): vite-plugin-pwa + manifest + SW 注册` | npm i + vite.config 最小配置 + manifest.json.erb 内容 + layout link tag + pwa-register.js + 各 entrypoint 调一次 | DevTools → Application → SW activated;manifest 字段全显示 |
| 2 | `feat(pwa): Workbox 分级缓存(NetworkFirst Inertia / CacheFirst static / NetworkOnly auth)` | vite.config 的 workbox.runtimeCaching 加完整 routing + 4 vitest | npm test 543 passed;SW handler 命中分布 verifiable |
| 3 | `test(e2e): Playwright PWA 5 用例(manifest / SW / 缓存 / offline)` | tests/e2e/pwa.spec.js 5 用例 + `context.setOffline` | npm run e2e 23 passed |
| 4 | `docs: 架构方案 v1.5 反映 Week 3 PWA 落地` | architecture.md Week 3 任务 ✅ + 版本 1.4 → 1.5 | review 通过 |

**Phase 1 是 hard gate**(SW 不注册成功后续都白干)。Phase 4 独立。

---

## 架构文档 v1.4 → v1.5

定向改 `docs/xinjiang-trip-architecture.md`:

| 段落 | 改动 |
|---|---|
| 顶部元数据 | 1.4 → 1.5,日期 2026-04-28(后续真实落地后改) |
| Week 3 任务列表 | 5 项任务全打 ✅ + 加"实施细节见 docs/superpowers/specs/2026-04-28-week3-pwa-foundation-design.md" |
| 风险登记 | 新增:"vite-plugin-pwa 是新引入,不熟悉的工程陷阱可能暴露;缓解:Lighthouse + Playwright + 真机三道防御" |
| 底部版本块 | 加 v1.5 变更说明 |

不动:7 周路线图主体 / 降级预案 / Pre-flight / Week 4-7 任务表。

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| `vite-plugin-pwa` 是新依赖,可能与 Vite-Ruby 配置冲突 | Phase 1 最小配置先打通基础,routing 后续渐进加;真出冲突可隔离测试 |
| iOS Safari 7 天未访问清 SW + IndexedDB + Cache | Onboarding 文档(Week 5)告知"出发后每 3 天打开一次";假设 cache 可能丢失,核心数据走 NetworkFirst 仍可在线获取 |
| 微信内嵌浏览器无法装 PWA 到桌面 | 已知,Onboarding 三步法(Week 5)教学:微信打开 → 用浏览器打开 → 添加桌面 |
| Inertia 离线 NetworkFirst fallback 拿到 stale 数据,用户以为是新数据 | Week 4 加状态徽标显示"离线 / 缓存命中";Week 3 范围内不做,接受用户一定的认知负担 |
| autoUpdate + skipWaiting 中断正在跑的 xhr / Inertia 请求 | Week 2 xhrRequest 已有 retry 兜底;Inertia version mismatch 触发 full reload 是预期行为 |
| Multi-user 同设备 cache leak | 5 人个人手机,Week 3 不做;onboarding 提示"个人用" |
| 红圆 placeholder 图标看着低质 | 出行不影响功能,出行后单独 design PR 替换 |

---

## 开放决策(已闭合,留备忘)

- ✅ 缓存策略选 B:NetworkFirst Inertia + CacheFirst static + NetworkOnly auth(不缓存 root HTML)
- ✅ SW 更新策略选 C:`autoUpdate + skipWaiting + clientsClaim`(完全静默)
- ✅ Manifest 选 A:最小修(name 保 OneTour,改颜色 + 描述 + lang)
- ✅ 品牌"路书" → OneTour 全项目搜替换(commit `2be2292`)
- ✅ 4 commit 构建顺序:install + manifest → routing + vitest → Playwright → docs
- ✅ Vitest 4 用例 + Playwright 5 用例 + Lighthouse + 真机 5 场景

---

## 下一步

本 spec 通过 review 后,调用 `superpowers:writing-plans` skill 出实施 plan。代码动手前 plan 再过一道 review。
