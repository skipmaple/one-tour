// app/javascript/lib/pwa-register.js
//
// Service Worker 注册胶水。autoUpdate 模式 — vite-plugin-pwa 会自动调用
// updateSW(),用户感知完全静默(skipWaiting + clientsClaim 在 vite.config 里)。
// 不暴露 onNeedRefresh / onOfflineReady,因为我们不弹 toast。
//
// 不支持 Service Worker 的环境(老 iOS、微信特殊版本)gracefully no-op。

import { registerSW } from 'virtual:pwa-register'

export function setupPWA() {
  if (typeof window === 'undefined') return  // SSR safety(本项目无 SSR,但保险)
  if (!('serviceWorker' in navigator)) return  // 老浏览器 / 不支持环境

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl) {
      // 仅 dev 时打印,prod 静默。Sentry 不上报(Q2 决策范围外)
      if (import.meta.env.DEV) console.log('[PWA] SW registered:', swUrl)
    },
    onRegisterError(err) {
      // 注册失败通常是浏览器拒绝(scope 问题、HTTPS 问题等),不是业务错误,
      // 不弹 UI 但 log 出来便于调试
      console.warn('[PWA] SW register failed:', err)
    },
    // 显式不传 onNeedRefresh / onOfflineReady — autoUpdate 模式不需要
  })
}

setupPWA()
