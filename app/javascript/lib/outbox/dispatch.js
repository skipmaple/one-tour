// 按 resource_kind 把 replay 成功 dispatch 给 Inertia 触发 page props 刷新。
// JSON path 用 router.reload({only: [...]}) 局部刷;photo 走专用 xhrRequest 重传。
//
// 为什么不直接拿 replay 的 fetch response.json() merge 进 page state:
// Inertia 是 server-rendered model — props 来自 controller 序列化逻辑,
// 客户端凭 raw API response 拼不出完整 page state(权限 / N+1 / cache 都是
// 服务端规范化过)。reload 一次重新走 controller 拿到准确 props,虽然多
// 一次 GET,但语义对、不会跟服务端真相分裂。

import { router } from '@inertiajs/react'
import { xhrRequest, mkForm } from '../xhr-request'

// prop 名称必须与 TourController 实际序列化的字段名一致。
// 不存在的 prop 在 Inertia partial reload 里会被静默忽略,导致 UI 看起来
// reload 成功但数据不刷新。
const RELOAD_ONLY_BY_KIND = {
  expense:        ['tour', 'expenses', 'expenses_summary'],
  activity_edit:  ['tour', 'activities', 'violations'],
  settlement:     ['tour', 'expenses_summary', 'settlements'],
  note:           ['tour', 'days'],  // 仅日程笔记 — activity desc edit 走 activity_edit
}

export function dispatchSuccess(row) {
  const only = RELOAD_ONLY_BY_KIND[row.resource_kind]
  if (!only) {
    // unknown kind:全 reload(safer 兜底)
    router.reload()
    return
  }
  router.reload({ only })
}

// photo 是应用层入队的特殊 kind:replay 时不走 fetch,而是用 xhrRequest 重传。
// 这是因为照片 endpoint 走 multipart form,SW intercept + JSON-style replay 不合适。
// 返回 xhrRequest 的 promise(replay.js 调用方决定 2xx/4xx 怎么处理)。
export function dispatchPhotoReplay(row) {
  return xhrRequest(row.path, mkForm('file', row.body.file_blob), {
    method: 'POST',
    maxAttempts: 1, // outbox 自己有 backoff retry,这里不再叠加
    sentryExtra: { activity_id: row.body.activity_id, replay: true },
  })
}
