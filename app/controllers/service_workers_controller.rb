class ServiceWorkersController < ApplicationController
  # vite-plugin-pwa 把 sw.js 输出到 public/vite/sw.js(因 vite-ruby
  # publicOutputDir: "vite"),如果 SW 从 /vite/sw.js 注册,scope 锁
  # 在 /vite/*,完全拦截不到业务路径。这个控制器从 root /sw.js 读
  # public/vite/sw.js 并加 Service-Worker-Allowed: / header,让
  # SW scope 提升到 /,workbox runtimeCaching 才能生效。
  #
  # 不走 ApplicationController 的认证 callback —— SW 注册时浏览器
  # 没 cookie 也得能拿到。
  skip_before_action :authenticate_user!, raise: false

  # Rails 的 protect_from_forgery 会在 after_action 里跑
  # verify_same_origin_request,把 SW 注册当跨域 script 拒掉(返回 422
  # InvalidCrossOriginRequest)。SW 是同源资源,显式跳过这个检查。
  skip_after_action :verify_same_origin_request, raise: false

  def show
    sw_path = Rails.root.join("public/vite/sw.js")
    if sw_path.exist?
      response.headers["Service-Worker-Allowed"] = "/"
      response.headers["Cache-Control"] = "no-cache"
      send_data sw_path.read, type: "text/javascript", disposition: "inline"
    else
      head :not_found
    end
  end
end
