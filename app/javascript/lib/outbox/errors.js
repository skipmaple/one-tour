// 把后端 / 网络错误规范化成给非工程用户看的中文短语。
//
// 为什么不直接显示 last_error 原文:replay 拿到的是 server raw response
// (Rails dev 可能返回完整 HTML 错误页;production 经常是 JSON;status code 只
// 是数字)。直接给用户看 "<!DOCTYPE html>..." 或 "HTTP 422" 体验上像 app 坏了。
//
// 这里把 last_error 拆成两个字段(replay.js 写两份):
//   row.last_error      → 用户看的友好句子(短、动词化、说"为什么无法同步")
//   row.last_error_raw  → 截断的原始 body(给 dev 看,Sentry capture 也带这份)

const TEXT = {
  401: "登录已过期,请重新登录",
  403: "你已不是这次旅程的成员,无法保存",
  404: "这条已被同伴删除,无法同步",
  413: "照片太大,请重选",
  rate_limited: "请求太频繁,稍后会自动重试",
  server_error: "服务器暂时无法处理,稍后再试",
  network_lost: "网络一直没好,改动还在排队",
  rejected: "服务器拒绝了这条改动,请编辑后重试",
}

// 尝试从 Rails JSON 错误响应里抽出可读字段。常见 shape:
//   { errors: ["..."] }                  ActiveRecord array
//   { error: "..." }                     单条
//   { errors: { field: ["..."] } }       per-field hash
// 返回拼接后的字符串 或 null(无法解析时)。HTML 错误页会进 catch 跳过。
function parseServerErrors(body) {
  if (!body) return null
  try {
    const json = JSON.parse(body)
    if (Array.isArray(json.errors)) {
      return json.errors.slice(0, 3).join(";")
    }
    if (typeof json.error === "string") {
      return json.error
    }
    if (json.errors && typeof json.errors === "object") {
      return Object.entries(json.errors)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v[0] : v}`)
        .join(";")
    }
  } catch {
    // body 不是 JSON(比如 Rails dev 的 HTML 错误页)— 跳过
  }
  return null
}

// 给定 HTTP status + response body,返回用户看的中文短句。
// status=null / 0 表示网络层错误(fetch throw / xhr 没拿到 status)。
export function friendlyError(status, body) {
  if (status === 401) return TEXT[401]
  if (status === 403) return TEXT[403]
  if (status === 404) return TEXT[404]
  if (status === 413) return TEXT[413]
  if (status === 408 || status === 429) return TEXT.rate_limited
  if (status >= 500) return TEXT.server_error
  if (status === 422 || status === 400) {
    return parseServerErrors(body) || TEXT.rejected
  }
  if (status === 0 || status == null) return TEXT.network_lost
  return TEXT.rejected
}
