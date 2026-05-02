// Page-lifecycle trigger 绑定。任意一个 event 都触发一次 replay,mutex 保证
// 不会真正并发。bindTriggers / unbindTriggers 对外暴露,inertia.jsx 启动时调一次
// bindTriggers,理论上整个 PWA 生命周期不需要 unbind(测试用)。

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

export function bindTriggers() {
  if (bound) return
  bound = true

  onOnline = () => { fire() }
  onVisibility = () => {
    if (document.visibilityState === 'visible') fire()
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)

  // 启动时触发一次(load 阶段)— 处理之前会话遗留的 pending row。
  // 注:onVisibility 已可能在初次渲染时同步触发(如果 page 已 visible),
  // 但 mutex 让重复调用安全。
  fire()
}

export function unbindTriggers() {
  if (!bound) return
  bound = false
  if (onOnline) window.removeEventListener('online', onOnline)
  if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
  onOnline = null
  onVisibility = null
  dbPromise = null
}

// 用户点徽标手动触发
export function triggerNow() {
  fire()
}
