# SW Kill-Switch Runbook

紧急情况:**生产 sw.js 坏了,客户端跑成砖**。

典型症状:
- 部署后大量用户报"app 打不开"/"白屏",**Sentry 反而看不到**(SW 错误不在前端 context)
- 老 SW 还在 service 着旧 cache,新 deploy 后页面用 stale 内容
- 浏览器 DevTools Application > Service Workers 看到 SW activated 但 fetch 全失败
- /sw.js bundle 内有 syntax error(workbox chunk import 解析错位)

## Recovery 流程

### 1. 立刻部署 kill-switch SW(15 min,自动恢复 24h 内)

修 `app/controllers/service_workers_controller.rb#show` 改成返一个**自我注销 SW**:

```ruby
def show
  response.headers["Service-Worker-Allowed"] = "/"
  response.headers["Cache-Control"] = "no-cache"
  send_data <<~JS, type: "text/javascript", disposition: "inline"
    // KILL-SWITCH SW —— 注销自己 + 清所有 cache。部署到 staging / prod
    // 验客户端恢复后,再 revert 这个文件回正常 sw.js 服务。
    self.addEventListener('install', () => self.skipWaiting());
    self.addEventListener('activate', async (event) => {
      event.waitUntil((async () => {
        // 删所有 cache
        for (const name of await caches.keys()) {
          await caches.delete(name);
        }
        // 注销自己
        await self.registration.unregister();
        // force 所有 client 重载,跳脱坏 SW 控制
        for (const client of await self.clients.matchAll({ type: 'window' })) {
          client.navigate(client.url);
        }
      })());
    });
  JS
end
```

部署:
```bash
# 直接 push 到 main → CI 跑完 → staging 自动部 → prod 卡门 approve
git checkout -b hotfix/sw-kill-switch
# 改 service_workers_controller.rb 见上
git commit -am "hotfix(sw): emergency kill-switch — unregister + clear caches"
git push -u origin hotfix/sw-kill-switch
gh pr create --title "hotfix(sw): kill-switch" --body "Emergency"
# 你 merge → CI → deploy-staging 自动 → deploy-production 你 GH UI approve
```

客户端恢复路径:
- 浏览器周期性(每页面加载 + 24h 后)revalidate `/sw.js`(我们 controller 设了
  `Cache-Control: no-cache` + ETag,**强制 revalidate**)
- 拿到新 kill-switch SW → install + activate
- activate 内删所有 caches + 注销 self + 触发所有 tab reload
- reload 后 `navigator.serviceWorker.controller` 是 null,client 走 normal HTTP
- 用户**无感恢复**,无需手动操作

### 2. 验证恢复(1-2h 内观察)

```bash
# 1. 直接 curl prod sw.js 应看到 kill-switch 内容
curl https://tour.skipmaple.com/sw.js | head -10
# 应该见 'self.addEventListener("install"' 而非 workbox bundle

# 2. 用 chrome-devtools mcp 实地验:开 prod URL,Application > SW 应看到
#    "redundant" 或没有 SW 注册;caches 应为空
```

Sentry 也看 `[PWA] SW register failed` 错误是否消失。

### 3. 修真问题 + revert kill-switch(后续)

- 在 staging 验真 sw.js 跑通(用 storageState E2E 跑一遍验 cache 写入)
- 修原问题(常见:vite-plugin-pwa 升级 break gsub guard / vite.config 误配)
- revert kill-switch commit,部回正常 sw.js 服务
- 浏览器再次 revalidate,拿回新 sw.js,正常 PWA 行为恢复

## 防护点(已部署)

| 机制 | 在哪 |
|---|---|
| `Cache-Control: no-cache` + `fresh_when ETag` | `app/controllers/service_workers_controller.rb` |
| gsub 匹配 CI 护栏 | `scripts/verify-sw-rewrite-patterns.sh` + `.github/workflows/ci.yml` 第 4 个 job |
| `cacheableResponse: { statuses: [200] }` 防错响应缓存 | `vite.config.ts` 三 runtimeCaching |
| Logout `Clear-Site-Data` 清 SW Cache Storage | `app/controllers/sessions_controller.rb#destroy` |

## 不该用 kill-switch 的场景

- **单个用户报"打不开"** —— 让他清浏览器缓存或换 incognito 试试,先排除是不是单 IP 问题
- **新 feature 不工作** —— 没 PWA 也能复现?那是 feature bug,不是 SW 问题
- **iOS Safari 偶发** —— 真机 dogfood 文档里写的已知 emulation 跟真机差异,
  非紧急

kill-switch 是**核选项**,部署前先在 staging 演练一遍流程(不影响 prod)。
