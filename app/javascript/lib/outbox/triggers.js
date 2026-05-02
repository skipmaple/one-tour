// Page-lifecycle trigger 绑定。任意一个 event 都触发一次 replay,mutex 保证
// 不会真正并发。bindTriggers / unbindTriggers 对外暴露,inertia.jsx 启动时调一次
// bindTriggers,理论上整个 PWA 生命周期不需要 unbind(测试用)。

import * as Sentry from '@sentry/react'
import { openOutbox } from './queue'
import { replay } from './replay'

let dbPromise = null
let bound = false
let onOnline = null
let onVisibility = null

function getDb() {
  if (!dbPromise) dbPromise = openOutbox()
  return dbPromise
}

async function fire() {
  const db = await getDb()
  await replay(db)
}

// 包一层 catch 防 unhandled promise rejection。openOutbox 在 Safari 私密模式 /
// IDB 被禁 / quota 满时会 reject;早期实现把 fire() 作为 event handler 直挂上,
// rejection 沿冒到 window unhandledrejection,污染 Sentry / dev console。
// Copilot review item #5。
function safeFire() {
  fire().catch((err) => {
    Sentry.captureException(err, { tags: { context: 'outbox.trigger_failed' } })
  })
}

export function bindTriggers() {
  if (bound) return
  bound = true

  onOnline = safeFire
  onVisibility = () => {
    if (document.visibilityState === 'visible') safeFire()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)

  // 启动时触发一次(load 阶段)— 处理之前会话遗留的 pending row。
  // 注:onVisibility 已可能在初次渲染时同步触发(如果 page 已 visible),
  // 但 mutex 让重复调用安全。
  safeFire()
}

export function unbindTriggers() {
  // 注意:dbPromise 必须无条件清,即使 bound=false 也清。原因:triggerNow 不走
  // bindTriggers 但会调 fire() 缓存 dbPromise;之后 unbindTriggers 早退就把
  // 缓存的 promise 留下,下次 bindTriggers 用旧 db 实例,测试就会错乱。
  dbPromise = null
  if (!bound) return
  bound = false
  if (onOnline) window.removeEventListener('online', onOnline)
  if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
  onOnline = null
  onVisibility = null
}

// 用户点徽标手动触发
export function triggerNow() {
  safeFire()
}
