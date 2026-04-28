// 共享的 mock response envelope —— 给 page.route fulfill 用。
//
// 维护原则:只放"两个 spec 都用 + 服务端真实响应的最小 superset"。
// 真实后端 schema 见对应 controller(controllers/activity_images_controller.rb 等)。

// Activity image POST 200 最小响应 —— 让 useGalleryUploader 走 success 路径。
export const ACTIVITY_IMAGE_OK = {
  status: 200,
  body: JSON.stringify({ id: 1, url: '/x.webp', medium_url: '/x.webp', width: 100, height: 100 }),
}
