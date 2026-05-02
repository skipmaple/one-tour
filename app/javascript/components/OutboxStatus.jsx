// 全局挂载的容器组件 — 组合 Badge + Drawer。
// 自己负责拉 IDB 计数(Badge 是 dumb 显示组件,数字从这里来)+ 监听 outbox 变化。
//
// 怎么知道 IDB 变了:
//   1. 启动时 + drawer open / close 后 → 重读
//   2. 自己每秒 poll(便宜,IDB 读 <5ms)— 5 人 trip 数据小,polling 没压力
// Mutation observer / BroadcastChannel 是更精的方案,但 polling 1s 已够用,
// 以后真要省可以改。

import { useEffect, useState } from 'react'
import { openOutbox, listByStatus } from '../lib/outbox/queue'
import { triggerNow } from '../lib/outbox/triggers'
import OutboxBadge from './OutboxBadge'
import OutboxDrawer from './OutboxDrawer'

export default function OutboxStatus() {
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const db = await openOutbox()
        const p = await listByStatus(db, 'pending')
        const f = await listByStatus(db, 'failed_permanent')
        if (!cancelled) {
          setPending(p.length)
          setFailed(f.length)
        }
      } catch {
        // IDB 不可用(老浏览器 / 隐私模式)→ 隐藏 badge(stays 0)
      }
    }

    refresh()
    const tid = setInterval(refresh, 1000)
    return () => { cancelled = true; clearInterval(tid) }
  }, [])

  function handleClick() {
    setDrawerOpen(true)
    triggerNow() // 同时强制 replay
  }

  return (
    <>
      <OutboxBadge pending={pending} failed={failed} onClick={handleClick} />
      <OutboxDrawer opened={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
