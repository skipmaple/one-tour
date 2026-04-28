// app/javascript/lib/pwa-register.js
//
// Service Worker 注册胶水。autoUpdate 模式 — vite-plugin-pwa 会自动调用
// updateSW(),用户感知完全静默(skipWaiting + clientsClaim 在 vite.config 里)。
// 不暴露 onNeedRefresh / onOfflineReady,因为我们不弹 toast。
//
// 不支持 Service Worker 的环境(老 iOS、微信特殊版本)gracefully no-op。

import { registerSW } from 'virtual:pwa-register'

export function setupPWA() {
  // 老 iOS Safari、微信内嵌、Firefox private mode 等环境 navigator.serviceWorker 不存在
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl) {
      // 注册成功是 happy path,不上报 Sentry;仅 dev 打印便于调试
      if (import.meta.env.DEV) console.log('[PWA] SW registered:', swUrl)
    },
    onRegisterError(err) {
      // 注册失败通常是浏览器环境性问题(scope / HTTPS / 微信内嵌等),
      // 不可 actionable per-user;console 留痕便于真机调试,不弹 UI、不上 Sentry
      console.warn('[PWA] SW register failed:', err)
    },
    // 显式不传 onNeedRefresh / onOfflineReady — autoUpdate 模式不需要
  })
}

setupPWA()
