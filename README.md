# OneTour

一个协作式的旅行攻略应用,把 Markdown + YAML 的行程描述渲染成交互式地图手册。作者写 Markdown,读者看地图。

- 📝 Markdown 编辑器(CodeMirror 6),支持 YAML frontmatter 结构化行程
- 🗺️ Leaflet 地图渲染路线、每日行程、兴趣点
- 👥 多人协作:作者、编辑者、读者三种角色
- 🔐 OAuth 登录(GitHub / Google / 飞书 / 邮箱验证码)
- 🤖 AI 助手对行程内容进行问答和改写
- 📦 Kamal + Docker 一键部署

## 技术栈

**后端** Rails 8.0 · PostgreSQL · SolidQueue / SolidCache / SolidCable · Active Storage (Cloudflare R2) · OmniAuth · ruby_llm

**前端** React 19 · Inertia.js · Mantine UI 9 · Leaflet · CodeMirror 6 · Vite

**架构要点** 不使用独立 REST API。Rails 控制器通过 Inertia 直接渲染 React 组件,页面组件位于 `app/javascript/pages/{Controller}/{Action}.jsx`,与路由一一对应。

## 快速开始

### 环境要求

- Ruby 3.4.8(项目根目录有 [mise.toml](mise.toml),使用 [mise](https://mise.jdx.dev/) 会自动切换)
- Node.js 20+
- PostgreSQL 14+
- [Foreman](https://github.com/ddollar/foreman)(用于 `bin/dev`)

### 本地启动

```bash
bin/setup        # 安装 gems、npm 依赖、建库、迁移
bin/dev          # 同时启动 Rails + Vite (Procfile.dev)
```

应用运行于 <http://localhost:3000>。

**开发登录**: 登录页面点 "Developer Login" 按钮即可(OmniAuth developer strategy,仅开发环境可用,无需配置任何 OAuth provider)。

### 环境变量

复制 [.env.example](.env.example) 为 `.env`,按需填入。开发环境只有想测试真实 OAuth / LLM / 地图服务时才需要配置;默认不配置也能用开发登录跑起来。

生产环境的所有密钥通过 `.env.production`(不提交)管理,Kamal 部署时由 [.kamal/secrets](.kamal/secrets) 动态读取。

## 常用命令

```bash
# 测试
bundle exec rspec                        # 全部 Ruby 测试
bundle exec rspec spec/models/           # 指定目录
bundle exec rspec spec/path/to_spec.rb   # 单个文件
npm test                                 # 前端测试 (vitest)
npm run test:watch                       # 前端测试 watch 模式

# 数据库
bin/rails db:create db:migrate
bin/rails db:seed         # 创建 admin@example.com,从兄弟目录 ../tour-of-xinjiang 读取示例攻略

# 代码检查
bundle exec rubocop       # rubocop-rails-omakase 风格
bundle exec brakeman      # 安全扫描
```

## 内容模型

每本攻略是一段 Markdown,开头为 YAML frontmatter,描述行程结构:

```yaml
---
title: 新疆环线
dates: "2024-09-01 ~ 2024-09-15"
vehicle: 自驾
days:
  - date: 2024-09-01
    coordinates: [43.8256, 87.6168]
    schedule:
      - "10:00 乌鲁木齐出发"
    lodging: 喀纳斯民宿
    pois:
      - name: 喀纳斯湖
        coordinates: [48.7254, 87.0234]
        tags: [湖泊, 必去]
---

# 正文 Markdown...
```

**双解析** 相同内容在两处解析:
- 后端 [FrontmatterParser](app/services/frontmatter_parser.rb) 保存时校验 + 填充 `frontmatter_cache` JSONB
- 前端 [useFrontmatter](app/javascript/hooks/useFrontmatter.js) 编辑时实时预览

**发布条件** frontmatter 无解析错误 + 有 `title` + **每一天必须有 `coordinates`**(地图渲染所需)。

## 权限模型

模型层统一校验,见 `Guidebook`:

| 方法 | 含义 |
|---|---|
| `owned_by?(user)` | 是否作者 |
| `editable_by?(user)` | 作者或 editor 成员 |
| `visible_to?(user)` | 已发布(任何人可见)或作者/成员(私密) |

`GuidebookMembership.role` 枚举:`reader` (0) / `editor` (1)。只有作者能发布、撤回、删除、管理成员。

## 自动保存

[useAutoSave](app/javascript/hooks/useAutoSave.js) 在用户停止输入 5 秒后以 `router.put` 保存一次,并在离开页面时提示未保存。没有 WebSocket 实时协作,多人并发编辑按 last-write-wins 处理。

## 项目结构

```
app/
├── controllers/            # Inertia 控制器,薄层
├── models/                 # 富模型,权限与业务逻辑在这里
│   └── guidebook.rb
├── services/
│   └── frontmatter_parser.rb
└── javascript/
    ├── entrypoints/inertia.jsx
    ├── pages/              # 对应 Rails controller/action
    │   ├── Guidebook/
    │   │   ├── Index.jsx Edit.jsx Show.jsx Settings.jsx
    │   └── Auth/Login.jsx
    ├── components/
    └── hooks/

config/
├── routes.rb               # REST 资源,见下
└── deploy.yml              # Kamal 部署配置

spec/                       # RSpec + FactoryBot + WebMock
```

## 路由概览

```ruby
resources :guidebooks do
  resource :publication                    # 发布 / 撤回
  resources :memberships                   # 共享成员
  resources :images                        # 图片上传
  resources :conversations do              # AI 对话
    resources :messages
  end
end

# OAuth
match "/auth/:provider/callback"
post  "/auth/email/send"
post  "/auth/email/verify"
```

偏好新的 REST 资源而非自定义 action(详见 [STYLE.md](STYLE.md))。

## 部署

Kamal + Docker,配置在 [config/deploy.yml](config/deploy.yml)。

### 本地部署

```bash
# 首次部署
kamal setup

# 更新
kamal deploy

# 查看日志
kamal app logs -f
```

### GitHub Actions 一键部署

工作流文件:[.github/workflows/deploy.yml](.github/workflows/deploy.yml)

**首次设置**(只做一次):

1. 在 GitHub repo → Settings → Environments → 新建 `production` environment
2. 在该 environment 下添加 4 个 secrets:

   | Secret | 内容 |
   |---|---|
   | `PROD_ENV_FILE` | 本地 `.env.production` 的**全文**(整个文件粘贴进去) |
   | `RAILS_MASTER_KEY` | `cat config/master.key` 的输出(单行) |
   | `DEPLOY_SSH_PRIVATE_KEY` | 有 root SSH 权限到生产机的私钥(完整带 `-----BEGIN/END-----`) |
   | `DEPLOY_SSH_KNOWN_HOSTS` | `ssh-keyscan 45.63.23.136` 的输出 |

3. (强烈推荐)在 environment settings 里勾 **Required reviewers** 把自己加进去 —— 作为人工刹车,防止手滑点按钮
4. (推荐)勾 **Deployment branches** → Selected branches → `main` — 只允许从 main 触发

**触发部署**:

Actions tab → 左侧选 "Deploy" → 右上 "Run workflow" → 可选填要部署的 ref(默认 main)→ "Run workflow"

工作流会:
1. 校验 4 个 secret 都非空(空的直接 fail-fast)
2. 校验目标 commit 的 CI 是否绿(红的直接拒绝部署)
3. 把 3 个 secret 材化为文件(`.env.production` / `config/master.key` / `~/.ssh/known_hosts`),私钥注入 `ssh-agent`
4. 校验 `.env.production` 变量数量合理(corrupt secret 提前挂)
5. `bin/kamal deploy`(Buildx 构建 + 推 Docker Hub + SSH 到 45.63.23.136 拉 + 重启)

并发保护:多次点击不会互相打断,后面的排队等前面结束。

**密钥更新**:任何一个密钥变了,重新把整个 `.env.production` 粘进 `PROD_ENV_FILE` secret 即可 —— 不需要在 GH Secrets 里维护 20+ 个零散变量和本地同步。

### 生产栈

Puma → Thruster(HTTP 加速)→ Kamal Proxy(Let's Encrypt SSL)→ 80/443。PostgreSQL 主库与 SolidCache / SolidQueue / SolidCable 分别使用独立的库。

## 代码风格

见 [STYLE.md](STYLE.md)。重点:

- 优先 vanilla Rails,薄控制器 + 富模型,不轻易引入 service 层
- REST 资源优先,不往 controller 里塞自定义 action
- 方法按调用顺序自上而下排列
- 详细约定见文件本身

## License

本项目采用 [GNU General Public License v3.0](LICENSE) 协议开源。
