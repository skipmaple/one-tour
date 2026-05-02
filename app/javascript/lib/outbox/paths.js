// 4 个 JSON mutation 白名单 — SW 拦截这些 path 的失败请求入队。
// 照片(/activities/X/images)不在内,走应用层 useGalleryUploader catch。
//
// 顺序:由具体到一般,首匹配即返。activity edit 排最后是因为它的
// regex 最宽(吃 /activities/X/anything 危险);所以加了 $ 锚点。
export const OUTBOX_PATHS = [
  /^\/tours\/\d+\/expenses$/,        // POST 创建
  /^\/expenses\/\d+$/,                // PATCH 编辑
  /^\/activities\/\d+$/,              // PATCH 详情(不含 /position 或 /images)
  /^\/tours\/\d+\/settlements$/,      // POST 结算
  /^\/tours\/\d+\/days\/\d+$/,        // PATCH 日程笔记(也接收 day 整体编辑)
]

export function isOutboxPath(pathname) {
  return OUTBOX_PATHS.some((re) => re.test(pathname))
}
