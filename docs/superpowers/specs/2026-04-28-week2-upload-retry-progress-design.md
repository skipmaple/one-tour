# Week 2 上传链路:retry + progress(xhrRequest helper)

**日期**:2026-04-28
**作者**:skipmaple + Claude
**背景**:Week 2 客户端图片压缩(`543c1f8`)已完成但未 deploy。剩余 Week 2 任务 6-6 / 6-7 / 6-8(retry / 进度条 / 架构文档 v1.3)需要落地。Direct Upload 已被 Week 2 修订版决策砍掉(三步签名流程对 PWA + 弱网不友好)—— 改走客户端压缩 + 自写 XHR 上传 helper 的路线。

距出行 47 天(2026-06-14),5 人弱网场景(新疆景区),`tour.skipmaple.com` 跑在 SWAS HK + OSS HK proxy mode。

---

## 目标

1. 写一个共享 helper `xhrRequest(url, body, opts)`,统一覆盖 4 个上传/JSON 调用点。
2. 内置:指数退避重试(默认 3 次)、上传 progress 回调、AbortSignal、CSRF 自动注入、Sentry 终态上报。
3. 接入两个高频路径:`ActivityGalleryTab`(站点配图,顺序 batch)+ `AddExpenseDialog`(费用小票,并发,含两阶段创建)。
4. 14 个 vitest 单测(helper 自身)+ 18 个 Playwright E2E(12 compression × 6 retry/progress 闭环)。
5. 架构文档 `docs/xinjiang-trip-architecture.md` 升 v1.3 反映此路线。

## 非目标

明确 v1 不做(防止后续记不清):

- Active Storage Direct Upload —— 被 Week 2 修订版砍掉
- `ProfileSettingsModal` 头像走 retry/progress —— 低频,投入产出比低
- 419 CSRF token mismatch 的 once-retry-with-refresh —— 罕见,UX 上提示"请刷新"足够
- AddExpenseDialog 关闭时 abort 仍在跑的上传 —— modal 阻塞,不至于卡用户
- Per-attempt Sentry 上报 —— 仅 final failure 上报
- 文件名 / 文件内容 / headers 进 Sentry —— PII 风险
- `Retry-After` header 解析(429)—— 5 人系统不会撞限流
- Concurrency 上限控制 —— ActivityGallery 已是顺序,AddExpense 通常 ≤3 张
- CI 跑 Playwright —— 需要完整 Postgres + Rails 启动,超出 CI 预算
- AddExpenseDialog 当前并发上传(`Promise.allSettled` / `forEach` 不 await)的并发模型保留,**不**改为顺序

## 设计约束

- **纯中文 UI**:notification、Progress label(若有)全中文。
- **图标库**:Tabler。本 spec 不引入新图标,保持 `IconUpload` 等现有用法。
- **少即是多**:进度 UI 不堆文字 —— ActivityGallery 单 Progress 横扫整 batch,无 text;AddExpenseDialog 单 Progress 表达字节级聚合。
- **代码风格**:STYLE.md;ESM,无 TS。

---

## API 签名

```js
// app/javascript/lib/xhr-request.js

export class XhrRequestError extends Error {
  constructor({ status, body, attempts, message }) {
    super(message)
    this.name = 'XhrRequestError'
    this.status = status      // null 表示网络错误 / 无 status
    this.body = body          // 解析后的 JSON,无则 null
    this.attempts = attempts  // 1..maxAttempts(实际尝试次数)
  }
}

/**
 * 发送 XHR 请求,FormData 自动 multipart + 触发 onProgress。
 *
 * 成功(2xx):resolve(parsed JSON 或 null)
 * 不可重试失败(4xx 等)/ 重试耗尽:reject(XhrRequestError)
 * 用户 abort:reject(DOMException('AbortError'))
 */
export async function xhrRequest(url, body, opts = {})

// 小帮手,避免 caller 重复 new FormData / append
export function mkForm(field, value)
```

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | string | — | endpoint |
| `body` | `FormData \| object \| null` | — | FormData → multipart;object → JSON.stringify;null → 无 body |
| `opts.method` | string | `'POST'` | |
| `opts.signal` | `AbortSignal?` | — | abort 时立即停止当前请求 + 跳过剩余 retry,reject `AbortError` |
| `opts.onProgress` | `({percentage, loaded, total}) => void` | — | 仅 FormData 触发 |
| `opts.maxAttempts` | number | `3` | 总尝试次数(含首次)。3 = 首次 + 2 retry |
| `opts.sentryExtra` | object | `{}` | 透传到 Sentry `extra` |

**返回值约定**:

- 成功:`Promise<parsed_json | null>`(类 axios)
- 失败:`reject(XhrRequestError)` 或 `reject(DOMException('AbortError'))`

理由:4 个 call site 当前都已经手动写 "if (!res.ok) throw" 翻译 fetch-style 为 throw-style,helper 直接吐 throw-style 省 4 处 boilerplate。

---

## 重试策略

**判定 retryable**(以下才会触发退避后重试):

| 状态 | retry | 说明 |
|---|---|---|
| 网络错误 / 无 status / 超时 | ✅ | XHR `error` / `timeout` 事件 |
| 408 Request Timeout | ✅ | |
| 429 Too Many Requests | ✅ | 不读 `Retry-After`(YAGNI) |
| 500 Internal Server Error | ✅ | 弱网下 Rails OOM-kill / Kamal rolling-restart / DB 短暂不可用都会出 500,常见且短暂 |
| 502 / 503 / 504 | ✅ | kamal-proxy 切实例期 / Postgres accessory 重启 |
| 其他 4xx(400/401/403/404/419/422 等) | ❌ | retry 不会改变结果(参数/认证/资源问题),立即 reject |
| 其他 5xx(501/505 等) | ❌ | 罕见,真出了 retry 也无济于事 |
| 用户 abort | ❌ | reject AbortError,跳过 backoff |

**419 特别说明**:Rails CSRF token mismatch。当前 4 个 call site 都没处理。v1 不重试,UI 提示"请刷新页面"。

**退避节奏**(指数,2^n × 1s,n 从 0 起):

```
attempt 1 ──fail── wait 1000ms ──→
attempt 2 ──fail── wait 2000ms ──→
attempt 3 ──fail── reject(XhrRequestError, attempts=3)
```

- 总等待:最多 3 秒(不含请求时长)
- 无 jitter(5 人系统无 thundering-herd 风险)
- `signal.aborted` 检查在每次 wait 前后跑,abort 立刻退出

**进度条与 retry 的交互**:每次 retry 时 `onProgress({ percentage: 0, ... })` 重发一次,UI 自然回到 0% 重爬。用户看到"在重试",而不是进度条卡在 47%。

---

## Sentry 集成

**何时捕获**(只有这一种):

✅ 重试耗尽后的最终失败 —— `XhrRequestError` 且 status 为 retryable 之一(或 `null`)。

❌ 不捕获:

- 用户 abort
- 4xx 非 retryable —— 422 是 caller UX 问题,进 Sentry 会被噪音淹没
- 中途某次 retry 失败但下一次成功了 —— 目标是"用户体验到的不可挽回失败"

**Tag**(低 cardinality,Sentry 上可筛):

| tag | 值示例 | 来源 |
|---|---|---|
| `endpoint` | `POST /activities/:id/images` | URL `/\d+(?=\/\|$)/g → :id` 归一化 |
| `final_status` | `network` / `500` / `503` | XHR status,无则 `'network'` |
| `effective_type` | `4g` / `3g` / `2g` / `slow-2g` / `unknown` | `navigator.connection?.effectiveType` |

**Extra**(context):

| extra | 来源 |
|---|---|
| `attempts` | helper 内部计数 |
| `body_size_bytes` | FormData 累加文件 size,JSON `JSON.stringify(body).length` |
| `file_count` | FormData 中 `Blob`/`File` 条数;JSON 为 `0` |
| `downlink_mbps` | `navigator.connection?.downlink` |
| `rtt_ms` | `navigator.connection?.rtt` |
| `...opts.sentryExtra` | caller 透传(`tour_id` / `activity_id` / `expense_id`) |

**主动不上报**:文件名(可能含 PII 如"身份证.jpg")、request body、headers(尤其 `X-CSRF-Token`)、用户标识(`send_default_pii: false` + 已有 `beforeSend` 过滤继承)。

---

## Caller 改动

### 1. ActivityGalleryTab(`uploadOne` + batch loop)

[ActivityGalleryTab.jsx:68](app/javascript/components/activity-editor/ActivityGalleryTab.jsx:68):

```js
const uploadOne = (file, onProgress, signal) =>
  xhrRequest(`/activities/${activityId}/images`, mkForm('file', file), {
    method: 'POST',
    signal, onProgress,
    sentryExtra: { activity_id: activityId },
  })
```

batch loop 增加 progress state + AbortController(unmount cleanup):

```js
const [batchProgress, setBatchProgress] = useState(null)
// { current, total, percentage } | null
const abortRef = useRef(null)

useEffect(() => () => abortRef.current?.abort(), [])

const handleFilesSelected = async (e) => {
  // ... 原 validate + compress 逻辑保持 ...
  abortRef.current = new AbortController()
  try {
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i]
      try {
        await uploadOne(file,
          (p) => setBatchProgress({
            current: i + 1, total: accepted.length,
            percentage: ((i + p.percentage / 100) / accepted.length) * 100,
          }),
          abortRef.current.signal
        )
      } catch (err) {
        if (err.name === 'AbortError') return
        notifications.show({ title: file.name, message: err.body?.errors?.join('；') || err.message, color: 'red' })
        // 单张失败不中断 batch,继续下一张
      }
    }
  } finally {
    setBatchProgress(null)
    router.reload({ only: [ 'activity_images' ], preserveScroll: true })
  }
}
```

UI:`{batchProgress && <Progress value={batchProgress.percentage} size="xs" />}` 贴在按钮区下方一条。无文字。

### 2. AddExpenseDialog `uploadReceiptNow`(edit 模式,并发)

[AddExpenseDialog.jsx:301](app/javascript/components/planner/AddExpenseDialog.jsx:301):

> `nextFileIdx()` = 组件内一个 `useRef(0)` 计数器自增,给 `progressMap` 当 key。`File` 对象本身可以做 key 但 JS plain object 不接受非字符串 key,用整数最简单。

```js
const fileIdxRef = useRef(0)
const nextFileIdx = () => ++fileIdxRef.current

const uploadReceiptNow = (file) => {
  const fileIdx = nextFileIdx()
  setUploadsInFlight((n) => n + 1)
  xhrRequest(`/expenses/${expense.id}/receipts`, mkForm('file', file), {
    method: 'POST',
    onProgress: (p) => setProgressMap((prev) => ({ ...prev, [fileIdx]: p })),
    sentryExtra: { expense_id: expense.id },
  })
    .then(() => router.reload({ only: [ 'expenses', 'expenses_summary', 'flash' ] }))
    .catch((err) => notifications.show({ message: `上传失败:${err.body?.errors?.join('；') || err.message}`, color: 'red' }))
    .finally(() => {
      setUploadsInFlight((n) => n - 1)
      setProgressMap((prev) => { const next = { ...prev }; delete next[fileIdx]; return next })
    })
}
```

并发模型保留(`accepted.forEach(uploadReceiptNow)` 不变)。

### 3. AddExpenseDialog `createWithPendingReceipts`(create 模式两阶段)

[AddExpenseDialog.jsx:430](app/javascript/components/planner/AddExpenseDialog.jsx:430):

```js
const createWithPendingReceipts = async (payload) => {
  let created
  try {
    created = await xhrRequest(`/tours/${tour.id}/expenses`, payload, {
      sentryExtra: { tour_id: tour.id },
    })
  } catch (err) {
    setSaving(false)
    notifications.show({ message: err.body?.errors?.join('；') || '保存失败', color: 'red' })
    return
  }

  const results = await Promise.allSettled(pendingFiles.map((p, idx) =>
    xhrRequest(`/expenses/${created.id}/receipts`, mkForm('file', p.file), {
      onProgress: (prog) => setProgressMap((prev) => ({ ...prev, [`new-${idx}`]: prog })),
      sentryExtra: { tour_id: tour.id, expense_id: created.id },
    })
  ))
  // 后续 router.reload + notification + setProgressMap clear 保持原有
}
```

### 4. AddExpenseDialog progress UI(共享 progressMap)

```js
const [progressMap, setProgressMap] = useState({})
const inFlight = Object.keys(progressMap).length > 0
const totalLoaded = Object.values(progressMap).reduce((s, p) => s + p.loaded, 0)
const totalSize   = Object.values(progressMap).reduce((s, p) => s + p.total,  0)
const overall     = totalSize > 0 ? (totalLoaded / totalSize) * 100 : 0

{inFlight && <Progress value={overall} size="xs" />}
```

按字节聚合(非简单平均),反映真实剩余。Phase 1 JSON POST 不进 progressMap(无 progress 概念)。Save 按钮 `loading={saving}` 已表达 saving 态,不重复。

### 不动的

- `ProfileSettingsModal` —— 头像走 Inertia + 已有压缩。retry/progress 不接。
- `ActivityGalleryTab.handleSetCover` / `commitCaption` / `handleDelete` —— PATCH/DELETE 元数据,不是上传链路。
- `AddExpenseDialog.deleteReceipt` —— DELETE,同上。
- 各文件局部的 `csrfToken()` —— 给非上传 fetch 用,保留。`xhrRequest` 内部独立读 `<meta>`,不依赖外部传入。

---

## 测试方案

### Vitest 单元测试 — `app/javascript/lib/__tests__/xhr-request.test.js`

mock `XMLHttpRequest` + `vi.useFakeTimers()`,精确控制 retry 时序。14 个用例:

| # | 场景 |
|---|---|
| 1 | 2xx FormData → resolve(parsed JSON) |
| 2 | 2xx JSON body → resolve(parsed JSON);Content-Type: application/json |
| 3 | 422 → reject 立即,attempts=1,无 Sentry |
| 4 | 503 → retry 直到耗尽,reject(attempts=3),Sentry 调用一次,tag/extra 正确 |
| 5 | 503 → 200 → resolve,attempts=2,无 Sentry |
| 6 | 网络错误(无 status)→ retry → resolve,无 Sentry |
| 7 | 网络错误持续 → reject(status=null),Sentry final_status=`network` |
| 8 | 419 → reject 立即,无 retry |
| 9 | abort 在请求中 → reject(AbortError),取消所有 retry,无 Sentry |
| 10 | abort 在 backoff 中 → reject(AbortError),取消 timer,无 Sentry |
| 11 | onProgress 在 FormData 上传期间多次触发,带正确 `{percentage, loaded, total}` |
| 12 | onProgress 在 JSON 请求时**不**触发 |
| 13 | CSRF token 从 `<meta name="csrf-token">` 自动注入到 `X-CSRF-Token` header |
| 14 | URL `/activities/123/images` 归一化为 `endpoint=POST /activities/:id/images` 进 Sentry tag |

### Playwright E2E

```
tests/e2e/
├── fixtures/
│   ├── 200kb.jpg          (case 2 - 不压缩)
│   ├── 5mb.jpg            (主力压缩用例)
│   ├── 6mb.jpg            (case 7 - 压完通过)
│   ├── 60mb.jpg           (case 4 - 拒绝)
│   ├── animated.gif       (case 3 - 不压缩)
│   ├── photo.png          (case 10 - PNG → WebP)
│   ├── generate.sh        (本地一次性生成,用 ImageMagick + dd)
│   └── README.md          (各 fixture 怎么生成)
├── helpers/
│   ├── auth.js            (Developer Login,免 OAuth)
│   └── seed.js            (创建 tour + day + activity 给测试用)
├── compression.spec.js    (12 用例,详见 handoff)
├── upload-retry.spec.js   (6 用例,见下)
└── playwright.config.js
```

#### `compression.spec.js` 12 用例

按 [docs/session-handoff-2026-04-27.md](docs/session-handoff-2026-04-27.md) 的 4×3 矩阵直接落地:

- Activity Image:5MB JPEG / 200KB / GIF / 60MB
- Expense Receipt:EDIT 5MB / CREATE 5MB / 6MB(压完通过) / 100MB(假大文件)
- Avatar:5MB / PNG / 取消选择 / 50MB

无需 mock 后端,真实 dev server 跑,验证压缩前后 size + 上传成功。

#### `upload-retry.spec.js` 6 用例(用 `page.route()` 拦截上传 endpoint)

| # | 场景 | 拦截策略 |
|---|---|---|
| R1 | ActivityGallery:5MB,503 一次后 200 | 第 1 次 503,后续放行 |
| R2 | ActivityGallery:5MB,所有 attempt 都 503 | 全部 503;断言 toast + 上传未成功 |
| R3 | ActivityGallery:batch 上传中导航走,后续请求不应发出 | 计数 fulfill 数,断言 ≤ 中断点 |
| R4 | AddExpenseDialog edit:2 张 receipts,1 张 503-then-200,Progress 字节聚合 | 标记一张 503 一次,验证 Progress 在 (loaded/total) 上单调 |
| R5 | AddExpenseDialog create+pending:Phase 1(JSON POST)503-then-200,Phase 2 receipts 正常 | 第 1 次 expenses 创建 503 |
| R6 | ActivityGallery:422 immediate fail | 立即返回 422 with `{ errors: ['xxx'] }`,验证 toast 文字 |

**Sentry 验证不进 E2E**(投入产出比低)。手动验证:deploy 后造一次故障(关 SWAS DB 30 秒)看 Sentry 上有事件即可。

### Fixtures 准备

写一次性 `tests/e2e/fixtures/generate.sh`,首次跑测试时本地生成。

```sh
convert -size 6000x4000 xc:white -quality 95 fixtures/5mb.jpg
convert -size 8000x6000 xc:white -quality 95 fixtures/6mb.jpg
dd if=/dev/urandom of=fixtures/60mb.jpg bs=1M count=60
```

`fixtures/.gitignore`:`*.jpg *.png *.gif`,只 commit `README.md` + `generate.sh`。

### 工程要求

- `npm test` 仍跑 vitest,新增 14 个用例
- `npm run e2e` 新增 npm script,跑 Playwright
- `playwright.config.js`:`webServer: { command: 'bin/dev', port: 9000, reuseExistingServer: true }` —— 复用主 worktree 的 dev server,不重复启
- CI 不变(只跑 rubocop / brakeman / npm audit)

---

## 构建顺序

| # | Commit | 内容 | 完成判定 |
|---|---|---|---|
| 1 | `feat(upload): xhrRequest helper + retry/progress/abort/Sentry` | `app/javascript/lib/xhr-request.js` + 14 vitest | `npm test` 14 用例全过 |
| 2 | `feat(upload): ActivityGalleryTab 接入 xhrRequest + batch progress` | 4.1 改动 | 手动上传 5 张,Progress 平滑,无 console error |
| 3 | `feat(upload): AddExpenseDialog 接入 xhrRequest` | 4.2 + 4.3 改动 | 手动 edit 2 张 + create+pending 1 张,行为不变 |
| 4 | `test(e2e): Playwright 18 用例` | playwright.config + tests/e2e/** + npm script | `npm run e2e` 18 用例全过 |
| 5 | `docs: 架构方案 v1.3 反映 xhrRequest 路线` | 见下 | review 通过 |

Step 1 是 hard gate(后续都依赖 helper)。Step 2 / 3 可并行实现但顺序 commit 便于 git bisect。Step 4 必须最后,验证整个 Week 2 闭环。

---

## 架构文档 v1.2 → v1.3

定向改动 `docs/xinjiang-trip-architecture.md`,不大改:

| 段落 | 改动 |
|---|---|
| 顶部元数据 | 版本 1.2 → 1.3,日期 2026-04-28,加一句"生产环境架构详见 [swas-cutover.md](docs/swas-cutover.md)" |
| Week 2 任务列表 | 展开为:客户端压缩 ✅(`browser-image-compression`)/ retry 退避 3 次(`xhrRequest` helper)/ Progress 字节级聚合 / 18 个 E2E |
| 技术栈表 "上传" 行 | `Active Storage Direct Upload` → `xhrRequest helper + browser-image-compression`(注:proxy mode 已生效) |
| 新加 "明确不在范围" | 补一行:Active Storage Direct Upload(三步签名流程对 PWA + 弱网不友好) |
| 风险登记 | 新增:"`xhrRequest` 是新代码,虽有 14 单测但生产首次面世,有未知 edge case;缓解:Sentry final-failure 上报 + 5 人小规模观察期" |

不动:7 周路线图、降级预案(PDF / WeChat 备份)、Pre-flight checklist、其他 Week 任务表。

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| `xhrRequest` 是新代码,生产首次面世 | 14 vitest 覆盖核心分支 + 6 E2E 覆盖集成;Sentry final-failure 上报作安全网 |
| AbortSignal 在 React 18 strict mode 下 dev 双 mount 可能触发误 abort | 测试 dev mode + prod build 两种路径 |
| Playwright 引入新依赖(`@playwright/test` + chromium ~150MB) | 仅 dev 用,不打包进 production bundle;开发者首次需 `npx playwright install chromium`(README 加一句) |
| fixtures 60MB 假大文件不进 git,新克隆需运行 `generate.sh` | README + `tests/e2e/fixtures/README.md` 双重提示 |
| 419 CSRF 在生产可能间歇撞到 | UI 文案"请刷新页面",观察 Sentry 是否高频后再做 once-retry |

---

## 开放决策(已闭合,留备忘)

- ✅ 一个 helper(`xhrRequest`)还是两个(`xhrUpload` + `xhrJson`)→ 选一个
- ✅ AbortSignal 进 v1 → 是
- ✅ ActivityGallery 进度 UI → 单 Progress 横扫整 batch,无文字
- ✅ AddExpenseDialog 进度 UI → 单 Progress,字节级聚合
- ✅ 文件名 `xhr-request.js`(取代候选 `xhr-upload.js` / `upload.js`)
- ✅ 维持 AddExpenseDialog 当前并发模型,不改顺序
- ✅ Sentry 仅 final-failure,不上报 per-attempt
- ✅ 14 vitest + 18 Playwright(12 compression + 6 retry/progress)

---

## 下一步

本 spec 通过 review 后,调用 `superpowers:writing-plans` skill 出实施 plan。代码动手前 plan 再过一道 review。
