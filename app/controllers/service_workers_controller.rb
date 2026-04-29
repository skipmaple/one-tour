class ServiceWorkersController < ApplicationController
  # vite-plugin-pwa 把 sw.js 输出到 public/vite/sw.js(因 vite-ruby
  # publicOutputDir: "vite"),如果 SW 从 /vite/sw.js 注册,scope 锁
  # 在 /vite/*,完全拦截不到业务路径。这个控制器从 root /sw.js 读
  # public/vite/sw.js 并加 Service-Worker-Allowed: / header,让
  # SW scope 提升到 /,workbox runtimeCaching 才能生效。
  #
  # SW 注册时浏览器即使没登录态也得能拿到 sw.js;ApplicationController
  # 没强制全局 require_login(各 controller 自己 before_action),所以这里
  # 不需要额外 skip auth。

  # Rails 的 protect_from_forgery 会在 after_action 里跑
  # verify_same_origin_request,把 SW 注册当跨域 script 拒掉(返回 422
  # InvalidCrossOriginRequest)。SW 是同源资源,显式跳过这个检查。
  skip_after_action :verify_same_origin_request, raise: false

  def show
    sw_path = Rails.root.join("public/vite/sw.js")
    return head(:not_found) unless sw_path.exist?

    stat = sw_path.stat

    response.headers["Service-Worker-Allowed"] = "/"
    # no-cache:浏览器每次必 revalidate(否则 SW 字节变化检测会被 HTTP
    # cache 拖)。配 fresh_when 让 revalidation 命中时返回 304,省 body
    # 又省一次 gsub。
    response.headers["Cache-Control"] = "no-cache"

    fresh_when(
      last_modified: stat.mtime.utc,
      etag: [ "service-worker", stat.size, stat.mtime.to_i, stat.mtime.nsec ],
    )
    return if performed?

    # vite-plugin-pwa 把 sw.js 出在 public/vite/sw.js,内部所有相对路径
    # (workbox runtime chunk + precache assets/)都假设 SW 自身是
    # /vite/sw.js。我们从 / 服务它(为了 scope=/),所以这些相对解析全
    # 错位 — `./workbox-xxx` 会变 /workbox-xxx (404),module 回调从不执
    # 行,registerRoute 全静默失败。两条 string replace 改回正路径:
    #   define(["./workbox-XXX"], ...)  → define(["/vite/workbox-XXX"], ...)
    #   url:"assets/foo"                → url:"/vite/assets/foo"
    # 用 Rails.cache 按 mtime 缓存重写结果 — 同 build 多次请求(stale
    # client / SW update check)免重读文件 + 重 gsub。
    body = Rails.cache.fetch([ "sw-rewritten", sw_path.to_s, stat.mtime.to_i, stat.size ]) do
      File.binread(sw_path)
        .gsub(%r{define\(\["\./workbox-}, 'define(["/vite/workbox-')
        .gsub(%r{url:"assets/}, 'url:"/vite/assets/')
    end

    send_data body, type: "text/javascript", disposition: "inline"
  end
end
