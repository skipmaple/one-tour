// app/javascript/lib/pwa-register.js
//
// Service Worker 注册胶水。直接 navigator.serviceWorker.register('/sw.js'),
// 不用 vite-plugin-pwa 的 virtual:pwa-register —— 因为 vite-ruby 把 SW
// 输出到 public/vite/sw.js,virtual register 会从 /vite/sw.js 注册导致
// scope 锁 /vite/*,业务路径都被排除。我们通过 Rails ServiceWorkersController
// 在 / 路径服务 SW 并加 Service-Worker-Allowed: / header,让 scope = /。
//
// vite-plugin-pwa 仍然负责生成 sw.js(workbox precache 清单 + runtimeCaching
// 配置都在 vite.config.ts 的 VitePWA(...) 里)— 我们只是不让它管注册。
//
// autoUpdate 行为(skipWaiting + clientsClaim 在 vite.config 里)依然生效:
// 浏览器周期检测 SW 字节变化 → install → 立即 activate → 接管 client。
// 不弹 toast(spec § Q2 决策 C 静默升级)。
//
// 不支持 Service Worker 的环境(老 iOS、微信特殊版本)gracefully no-op。

export function setupPWA() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      if (import.meta.env.DEV) console.log('[PWA] SW registered:', reg.scope)
    })
    .catch((err) => {
      // 注册失败通常是浏览器环境性问题(scope / HTTPS / 微信内嵌等),
      // 不可 actionable per-user;console 留痕便于真机调试,不弹 UI、不上 Sentry
      console.warn('[PWA] SW register failed:', err)
    })
}

setupPWA()
