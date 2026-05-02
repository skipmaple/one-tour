# Week 4 — 离线写队列设计 (Offline Write Queue)

**Date:** 2026-05-02
**Status:** Approved (brainstorm complete)
**Goal:** 5 人小队出行场景下,5 个核心 mutation path 在弱网 / 离线时不丢数据 — 失败入队、上线 replay、冲突让用户决定。

## Background

Week 3 的 PWA 基础设施(SW + manifest + 运行时缓存 + 离线 read)已上线,Lighthouse 100/100/100。但 mutation(POST/PATCH/DELETE)在离线时直接失败 —— 5 人出行场景里"我加的费用 / 拍的照片到底传上去没?"是真问题。Week 4 解决 write 路径,架构 doc 早已规划但未实施。

## Scope

**5 个支持离线的 path:**

1. 费用增加 / 编辑 — POST `/tours/:id/expenses` 和 PATCH `/expenses/:id`(`AddExpenseDialog.jsx`)
2. 活动图上传 — POST `/activities/:id/images`(走现有 `xhrRequest` + `useGalleryUploader.js`,**应用层入队**而非 SW 拦截 — XHR 通过 SW 但响应处理与 fetch 不同,直接在 hook 里 catch 错误入队更可靠)
3. 活动详情编辑 — PATCH `/activities/:id`(`ActivityDrawer.jsx`,不含 `/position` 重排)
4. 结算 — POST `/tours/:id/settlements`(`ManualSettlementDialog.jsx`)
5. 日程笔记 — PATCH `/tours/:id/days/:day_id`(`DayEditModal.jsx`)

**Out of scope(本期):**

- 离线创建 Tour 本身 / 离线创建 Activity 或 Day(只支持已存在结构内的 mutation)
- 删除 mutation(优先级低,5 人 trip 删除少)
- WebSocket 真同步 / cross-device push
- 后端 `Idempotency-Key` 支持(future)

## 核心决策(已定)

| Q | 决策 | 备注 |
|---|------|------|
| Q1: Scope | 5 path | 上面列表 |
| Q2: UI surface | 头部徽标 + 点击展开抽屉 | 与架构 doc 一致 |
| Q3: 冲突语义 | 服务端总是赢,用户决定 [放弃] / [用最新数据重做] | 一刀切适用 5 path |
| Q4: 队列机制 | 统一 IndexedDB 队列 + 多 trigger | 放弃 BackgroundSyncPlugin,Chrome 和 iOS 同一套代码 |
| Photo 格式 | WebP(2048px ~500KB 主图 + 256px ~50KB thumbnail),不支持时 fallback JPEG | 7 day × 50 photo 用量约 120MB,在 Safari quota 内 |

## Architecture

### 数据流

```
[User mutation]
    │
    ├─ online ──→ fetch 正常 ──→ server ──→ 2xx Inertia 状态更新
    │
    └─ offline / failed ──→ SW intercept ──→ IDB outbox 写一行 + 合成 202
                                                  │
                                                  ↓
                                          Inertia 乐观更新 + Badge++
                                                  │
                                          [trigger 触发任一]:
                                          • online 事件
                                          • visibilitychange→visible
                                          • page load
                                          • 用户点击 Badge 强制 replay
                                                  │
                                                  ↓
                                  OutboxQueue.replay()  (mutex-guarded)
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ↓                   ↓                   ↓
                         2xx:               4xx (非 408/429):       5xx / network:
                         删 row +            标 failed_permanent      attempts++,
                         dispatch 真实        + Sentry capture        exp backoff,
                         结果到 Inertia      + 抽屉显示 [放弃] /       5 次 cap 后转
                                            [用最新数据重做]           failed_permanent
```

### Component / file layout

**新建**

```
app/javascript/lib/outbox/
├── paths.js              4 个 JSON mutation 白名单 regex(SW + 前端共享;photo 不在内,走应用层)
├── queue.js              IDB wrapper: openDB / enqueue / list / get / put / delete
├── replay.js             replay 逻辑 + isReplaying mutex + exp backoff + Sentry
├── triggers.js           online / visibilitychange / load / manual click 绑定
├── dispatch.js           dispatch 真实 res 给 Inertia(刷 page props 或 router.reload)
└── __tests__/
    ├── queue.test.js
    ├── replay.test.js
    ├── triggers.test.js
    └── dispatch.test.js

# 复用 Week 2 已有(不重写):
app/javascript/lib/image-compression.js   已实现 WebP / HEIC / fallback,直接用

app/javascript/components/
├── OutboxBadge.jsx       头部徽标(三态)
└── OutboxDrawer.jsx      抽屉:列表 + retry / abandon / redo

tests/e2e/
└── outbox.spec.js        Playwright:offline → enqueue → replay 全链
```

**修改**

```
vite.config.ts                                            加 Workbox handler:4 JSON path 白名单 → fail → enqueue
app/javascript/entrypoints/inertia.jsx                    全局挂 OutboxBadge + 注册 triggers
app/javascript/hooks/useGalleryUploader.js                photo flow:catch xhrRequest 失败 → outbox.enqueue(blob, kind: 'photo')
package.json                                              devDep 加 fake-indexeddb(Vitest 用)

# 4 个 JSON form 经 SW intercept,本身代码不需改(Inertia router 自动走 SW):
app/javascript/components/planner/AddExpenseDialog.jsx    confirm 走 router(已用)
app/javascript/components/planner/ManualSettlementDialog.jsx 同上
app/javascript/components/planner/DayEditModal.jsx        同上
app/javascript/components/activity-editor/ActivityDrawer.jsx 同上
```

### IndexedDB Schema

```
DB: 'one-tour-outbox' (version 1)

Object store: 'mutations'
keyPath: 'id' (autoIncrement)
Indexes:
  - 'enqueued_at'   (FIFO 排序)
  - 'status'        (筛 pending / failed_permanent)

Row schema:
  id              number   auto
  path            string   '/tours/123/expenses'
  method          string   'POST' | 'PATCH' | 'DELETE'
  body            object   form data;photo path 含 Blob 引用
  headers         object   Authorization, X-CSRF-Token, Content-Type
  enqueued_at     number   Date.now() ms
  attempts        number   default 0
  last_error      string   最后一次失败 msg
  status          string   'pending' | 'failed_permanent'
  resource_kind   string   'expense' | 'photo' | 'activity_edit' | 'settlement' | 'note'
  display_label   string   UI 用的简述,'¥85 午饭'
```

## UI 细节

### OutboxBadge(头部右上角)

三态:

- pending = 0 && failed = 0 → 隐藏
- pending > 0 → "X 条待同步"(yellow 警示色,Mantine yellow.6)
- failed > 0 → "X 条失败"(red,Mantine red.7)
- 同时存在 pending + failed → 显示 failed 数(红,优先级高)

点击展开 OutboxDrawer。

### OutboxDrawer

每行包含:

- 资源类型图标(Tabler icons:`IconCash` / `IconCamera` / `IconEdit` / `IconScale` / `IconNotebook`)
- `display_label`("¥85 午饭" / "上传 day3-IMG001.jpg")
- 状态:
  - pending → "等待"(如果 attempts > 0:"重试 N/5")
  - failed_permanent → "失败 — {last_error}"
- failed 行附两按钮:
  - `[放弃]` — `db.delete(row.id)` + Sentry breadcrumb,row 永久消失
  - `[用最新数据重做]` — GET 服务端当前状态 → 打开原表单预填**服务端最新值**(不 merge 用户离线时的改动,完全用服务端版本作为起点)→ 用户重新编辑 → 提交。原 outbox row 在用户提交成功后才删除(若用户取消则保留 failed 状态供下次重做)

按 `enqueued_at` desc 排序(最新在上)。

## Replay 算法

```js
async function replay() {
  if (isReplaying) return;
  isReplaying = true;
  try {
    const rows = await queue.listByStatus('pending');
    rows.sort((a, b) => a.enqueued_at - b.enqueued_at); // FIFO

    for (const row of rows) {
      try {
        const res = await fetch(row.path, {
          method: row.method,
          headers: row.headers,
          body: serializeBody(row.body), // photo blob → multipart 重组
        });

        if (res.ok) {
          await queue.delete(row.id);
          dispatchInertiaUpdate(row.resource_kind, await res.json());
          Sentry.addBreadcrumb({ category: 'outbox.success', data: { id: row.id, attempts: row.attempts } });
        } else if (isPermanent(res.status)) {
          // 4xx 非 408/429
          row.status = 'failed_permanent';
          row.last_error = await readErr(res);
          await queue.put(row);
          Sentry.captureException(new Error(`Outbox failed_permanent ${res.status}`), {
            tags: { path: row.path, method: row.method, attempts: row.attempts, kind: row.resource_kind },
          });
        } else {
          // 5xx / 408 / 429 / network
          row.attempts += 1;
          row.last_error = `HTTP ${res.status}`;
          if (row.attempts >= 5) row.status = 'failed_permanent';
          await queue.put(row);
          await sleep(backoff(row.attempts)); // 1s / 2s / 4s / 8s / 16s
        }
      } catch (networkErr) {
        // 网络中断 → 同 5xx
        row.attempts += 1;
        row.last_error = networkErr.message;
        if (row.attempts >= 5) row.status = 'failed_permanent';
        await queue.put(row);
      }
    }
  } finally {
    isReplaying = false;
    notifyUI(); // badge / drawer 重新渲染
  }
}

function isPermanent(status) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function backoff(n) {
  return Math.min(1000 * Math.pow(2, n - 1), 16000);
}
```

## Triggers

```js
// triggers.js
export function bindTriggers() {
  window.addEventListener('online', replay);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') replay();
  });
  window.addEventListener('load', replay); // 首次开 page 也跑
  // 徽标点击触发由 OutboxBadge 内部调用 replay
}
```

`isReplaying` mutex 保证多个 trigger 同时触发只跑一遍。

## SW intercept(vite.config.ts)

5 个 path 加入 Workbox `runtimeCaching` 的 NetworkOnly handler,失败时调用 outbox enqueue。Workbox 每个 `runtimeCaching` 条目只支持单 method,所以 POST / PATCH / DELETE 各注册一份(共享同一个 handler 函数):

```js
// vite.config.ts (示意,handler 共享)
const outboxHandler = async ({ event, request }) => {
  try {
    const res = await fetch(request.clone());
    if (!res.ok && res.status >= 500) throw new Error('5xx, queue it');
    return res;
  } catch {
    const id = await enqueueFromRequest(request);
    return new Response(JSON.stringify({ queued: true, id }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

const outboxUrlPattern = ({ url }) =>
  OUTBOX_PATHS.some(re => re.test(url.pathname));

// 三份注册(method 各一)
runtimeCaching: [
  // ...其他 read-side 缓存规则...
  { urlPattern: outboxUrlPattern, handler: outboxHandler, method: 'POST' },
  { urlPattern: outboxUrlPattern, handler: outboxHandler, method: 'PATCH' },
  { urlPattern: outboxUrlPattern, handler: outboxHandler, method: 'DELETE' },
]
```

`OUTBOX_PATHS` = 5 个白名单 regex(精确匹配 5 个 mutation endpoint),在 `app/javascript/lib/outbox/paths.js` 单独维护,SW 和前端共享。

## 照片上传特例

**现状(Week 2 已实施)**:

- `lib/image-compression.js` 已用 `browser-image-compression` 库,目标 `image/webp` q=0.82,maxSize 1.5MB,maxWidthOrHeight 2048。HEIC iPhone 自动 canvas decode。失败 fallback 原图。
- `lib/xhr-request.js` 已用 XHR + 自动 retry / 进度条。
- `hooks/useGalleryUploader.js` 已编排:文件选 → 压缩 → 串行上传 `POST /activities/:id/images`。

**Week 4 增量** — **应用层入队,不走 SW intercept**:

XHR 经 SW 但 Workbox 处理 XHR response 与 fetch 略有差异;现有 `xhrRequest` 自带 retry 在 SW 介入下行为复杂。更简单可靠是直接在 hook 里 catch 错误后写 outbox。

**离线流程:**

1. 拍照 / 选图 → File 对象(`useGalleryUploader#handleFilesSelected`)
2. `compressImage(file)` 返回 WebP File(已实现)
3. 调 `uploadOne(file)` → `xhrRequest(...)` 抛错(network / 5xx 用尽 retry)
4. catch 块判定 `navigator.onLine === false` 或错误类别为可重试 → 写 outbox:
   ```
   {
     resource_kind: 'photo',
     body: {
       file_blob: <压缩后的 File 对象,IDB 直存>,
       activity_id: X,
       file_name: 'IMG_xxx.webp',
     },
     path: '/activities/X/images',
     method: 'POST',
     ...
   }
   ```
5. 通知用户 "已加入队列,联网后自动上传" + Badge++
6. UI 用 `URL.createObjectURL(file_blob)` 在活动详情页面立即显示占位图

**Replay 流程:**

- `dispatch.js` 检查 `resource_kind === 'photo'` → 走专用 photo replay:
  1. 从 IDB row 取出 `file_blob`
  2. 重建 FormData → `xhrRequest('/activities/X/images', formData, ...)`
  3. 2xx → 删 row + `router.reload({ only: ['activity'] })` 刷 photo grid
  4. 4xx 永久失败 / 5xx 失败 → 走通用 replay 状态机(同 JSON path)
- 不走 Active Storage direct_upload 三步:现有 endpoint 是后端代理上传(POST `/activities/X/images` 直接 form file),已稳定不动。

**Quota guard:**

入队前 `navigator.storage.estimate()`:

- `usage / quota > 0.8` → 阻止新照片入队
- UI 提示:"存储吃紧,请联网上传现有照片再拍新的"
- 删 row 时 IDB GC blob

## 重试策略

| 状态 | 行为 |
|------|------|
| network error / timeout | retry(算 5xx) |
| 5xx | retry, exp backoff `1s / 2s / 4s / 8s / 16s`, 5 次 cap |
| 408 / 429 | retry(treat as transient) |
| 4xx 其他(400/401/403/404/409/422 等) | 立即 failed_permanent |
| 5 attempts cap 后 | 转 failed_permanent + Sentry capture |

## Sentry 集成

```
enqueue              → addBreadcrumb {category: 'outbox.enqueue', data: {path, method, kind}}
each retry attempt   → addBreadcrumb {category: 'outbox.retry', data: {id, attempts}}
2xx success          → addBreadcrumb {category: 'outbox.success', data: {id, attempts}}
failed_permanent     → captureException, tags: {path, method, attempts, error_class, kind}
user 放弃            → addBreadcrumb {category: 'outbox.abandon', data: {id}}(不报 error)
user 重做            → addBreadcrumb {category: 'outbox.redo', data: {id}}
quota guard 触发      → captureMessage(level: 'warning', tags: {usage_pct})
```

PII filter 与 Week 3 一致:**body 内容不入 Sentry**,只发 path / kind / metadata。

## Idempotency

**MVP 不加 `Idempotency-Key` header。**

风险:replay 成功但 response 在路上丢 → 用户 manual retry → 后端重复创建。

为何可接受:

- 5 人 trip 数据量小,duplicate 容易看出来手动删
- 后端不支持 Idempotency-Key,改造量大(每个 controller 加 dedup 中间件)
- 频率估 <1% mutation,边际收益小

未来后端改造时再补。Spec 里标 future work。

## Testing

### Vitest 单测

- **queue.test.js**:openDB / enqueue 写入 / list FIFO / delete / status 筛选 / migration onupgradeneeded(用 `fake-indexeddb`)
- **replay.test.js**:mutex(并发 replay 只一个跑)/ backoff 数列 / 4xx → failed_permanent / 5xx → retry / 5xx 5 次 → failed_permanent / 2xx → delete + dispatch / network err → retry
- **triggers.test.js**:online / visibilitychange / load / manual click 都触发 replay
- **dispatch.test.js**:每个 resource_kind 都正确 dispatch(JSON 走 `router.reload`,photo 走 FormData + `xhrRequest` 重传)

### Playwright E2E(在 staging dogfood 前必过)

1. **基础 offline → online**(Chromium):
   - 离线模式 → 加费用 → 看到 Badge+1
   - 恢复网络 → 等 online 事件 → Badge → 0
   - 验证服务端 expense 记录存在
2. **冲突场景**(Chromium):
   - User A 删除 activity(via API)
   - User B 离线编辑该 activity → online → 看到 failed 抽屉
   - 测试 [放弃] 按钮 → row 删 / Badge 减
   - 测试 [用最新数据重做] → 弹出表单 → 提交后清空
3. **iOS visibilitychange trigger**(WebKit profile):
   - 离线模式 → 加费用 → tab 隐藏 → tab 显示 → 验证 trigger 触发 replay
4. **Photo upload offline**(Chromium):
   - 离线 → 上传 mock 照片 → 验证 IDB 有 WebP blob → online → replay 三步 → 服务端 has photo

## 验证标准(done)

- [ ] 5 path 全部支持离线入队 + 上线 replay
- [ ] Badge 三态 UI 正确
- [ ] Drawer 失败行 [放弃] / [用最新数据重做] 工作
- [ ] Photo upload offline 三步链路全跑通
- [ ] WebP 压缩生效(IDB blob MIME 验证 + 大小验证)
- [ ] iOS Safari profile E2E 全过
- [ ] Sentry 离线 capture 验证(staging dogfood 1 周观察)
- [ ] Lighthouse 不退化(仍 100/100/100)
- [ ] `bin/rubocop` / `bin/brakeman` / `npm audit` / `bundle exec rspec` / `npm test` 全绿

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| iOS Safari quota 撑爆 | `navigator.storage.estimate()` 80% guard + 提示 |
| HEIC source 解码失败 | WebP encode 失败 fallback JPEG;再失败提示用户换格式 |
| Mutex 死锁(replay 卡住) | replay 内部 try/finally 释放;page reload 自动清(in-memory mutex) |
| 双写(replay 后 response 丢) | MVP 接受,后端 Idempotency-Key 是 future work |
| IDB 升级 corrupt | version 1 简单 schema,不做迁移;v2 时再加 onupgradeneeded |
| Photo blob 巨大撑爆 IDB | WebP 客户端压缩 + 80% quota guard |
| Workbox SW 拦截不到表单 multipart | E2E 第 4 项专项验证 photo flow |
| 弱网半失败(请求半路死) | abort timeout(15s) 计入 retry,不是 hang |

## Future work(out of MVP)

- 后端 `Idempotency-Key` header 支持(消灭双写)
- 真正 cross-device push(WebSocket / Cable)同步
- 队列优先级(费用 > 笔记)
- 离线创建 Activity / Day 本身
- 删除 mutation(DELETE)入队
- 队列分片(避免 5 人小队 → 大型团队 scale 时单 store 撑爆)

## 文件影响范围

新增 9 个 JS 文件(5 个核心 lib + 4 个 test)+ 2 个 component(Badge / Drawer)+ 1 个 E2E 文件 = 12 个新文件,~1000 行核心代码。
修改:`vite.config.ts`(SW handler)、`inertia.jsx`(全局 mount)、`useGalleryUploader.js`(catch + 入队)、`package.json`(devDep `fake-indexeddb`)。
4 个 JSON form component 不改动(Inertia router 走 SW,自动透明)。
后端 0 改动。
