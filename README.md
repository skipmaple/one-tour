# OneTour

协作式的多人行程规划器:同一个 Tour 下,作者与成员一起把"去哪几天 / 每天排什么活动 / 谁付了钱 / 谁欠谁"一次讲清。

- 📅 Planner:`Tour → Day → Activity` 三层结构,外加 backlog 待选池,支持拖拽排程 / 跨日迁移 / 一键克隆
- 🗺️ 地图与路线:Leaflet + 高德(AMAP)Web / JS API,每日路线段(Route Legs)由高德 directions 预算、POI 搜索直连高德 REST
- 💰 费用与结算:`activity/day/tour` 三种作用域、`equal/percentage/custom/individual` 四种分摊策略、小票上传;独立的 Settlement 记账
- 👥 协作:作者 + editor / reader 两级成员;成员自动进入活动参与者候选
- 🔐 登录:GitHub / Google / 飞书 / 邮箱验证码;开发环境一键 Developer Login
- 🤖 AI 助手:每个 (Tour, 当前用户) 一个会话,Action Cable 流式返回
- 🛠️ Admin 视图:`/admin` 下查看全站用户与 Tour
- 📦 Kamal + Docker 一键部署

## 技术栈

**后端** Rails 8.0 · PostgreSQL · SolidQueue / SolidCache / SolidCable · Active Storage(Cloudflare R2)· OmniAuth · ruby_llm

**前端** React 19.2 · Inertia.js 3 · Mantine UI 9 · Leaflet 1.9 · CodeMirror 6 · Vite 8

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

**开发登录**:登录页面点 "Developer Login"(OmniAuth developer strategy,仅开发环境可用,无需配置任何 OAuth provider)。

### 环境变量

复制 [.env.example](.env.example) 为 `.env`,按需填入:

- **OAuth**(GitHub / Google / 飞书)——开发环境用 Developer Login 可全留空
- **LLM**(RubyLLM)——默认指向本机 LM Studio(`OPENAI_API_BASE=http://localhost:1234/v1`);切云端提供商改 `OPENAI_API_KEY` / `OPENAI_API_BASE` / `LLM_MODEL` 三项
- **AMAP**——需要**两把** key:`AMAP_API_KEY`(后端 POI 搜索,Web 服务平台)+ `AMAP_JS_API_KEY` / `AMAP_JS_API_SECURITY_CODE`(前端地图与路径,Web 端 JS 平台)。同一应用下分别建 key;JS key 的域名白名单记得加 `localhost` 与生产域名

生产所有密钥通过 `.env.production`(不提交)管理,Kamal 部署时由 [.kamal/secrets](.kamal/secrets) 动态读取。

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

# 代码检查
bundle exec rubocop       # rubocop-rails-omakase 风格
bundle exec brakeman      # 安全扫描
```

## 领域模型

```
Tour
├── constitution            # JSONB "行程共识"(出行规则);accept 后 title 变必填
├── TourMembership × N      # role: reader (0) / editor (1)
├── Day × N                 # day_index 排序;intensity: green / yellow / red
│   └── Activity × N        # position 排序
├── Activity(backlog)       # day_id 为空的活动放待选池
│   ├── kind: scenic / road / food / stay / fuel / other
│   ├── participants        # 通过 ActivityParticipant 挂到 User
│   ├── images              # Active Storage 附件
│   └── expenses / budgets  # 活动作用域的费用与预算
├── Expense                 # scope: activity / day / tour
│   ├── category: food / fuel / lodging / ticket / refund / misc
│   ├── split_strategy: equal / percentage / custom / individual
│   ├── ExpenseSplit × N
│   └── ExpenseReceipt × N  # 小票(Active Storage)
├── TourBudget              # 预算(可挂在 activity / day / tour 任一层)
├── RouteLeg                # 相邻活动间的一段路线(高德 directions)
├── Settlement              # 某人 → 某人的一次结算转账
└── Conversation            # 每个 (Tour, 当前用户) 一个 AI 会话
```

**Activity 双重身份** `day_id` 非空 = 排进某天的某个位置;为空 = 丢进 backlog 待选池。planner UI 通过 `PATCH /activities/:id/position` 在两者与各自顺序之间调整。

## 权限模型

模型层统一校验,见 [app/models/tour.rb](app/models/tour.rb):

| 方法 | 含义 |
|---|---|
| `owned_by?(user)` | 是否作者 |
| `editable_by?(user)` | 作者或 editor 成员 |
| `visible_to?(user)` | 作者或成员 |

`TourMembership.role` 枚举:`reader` (0) / `editor` (1)。只有作者能转移、删除、管理成员。

`/admin` 命名空间另有独立鉴权,见 `Admin::*` 控制器。

## 费用与结算

四字段账簿模型(全文在 [app/models/expense/summarize.rb](app/models/expense/summarize.rb),动这段前先读类头注释):

- `paid_cents` **刻意排除** `individual`(各付各)支出 —— 这些是付款人给自己花的钱,不进入结算账簿。曾因把它纳入产生过"幽灵应收"
- `my_spend_cents` = 我承担的分摊 + 我自己的 individual 支出 —— 预算卡片读的"我实际掏了多少"数字
- 其余两字段(`owed` / `owing`)在 `current_user_balance` 方法注释里展开

## 路由概览

```ruby
resources :tours, except: [ :new, :edit ] do
  resource  :constitution                            # 行程共识(update + accept)
  resources :members                                 # TourMembership
  resources :days do
    resources :activities, only: [ :create ]        # 创建进某天
  end
  resources :backlog_activities, only: [ :create ]   # 创建进待选池
  resources :expenses,    only: [ :create ]
  resources :budgets,     only: [ :create ]
  resources :settlements, only: [ :create ]
  resources :route_legs,  only: [ :create ]
  resource  :conversation do                         # AI 对话(单个)
    resources :messages, only: [ :create ]
  end
end

resources :activities, only: [ :update, :destroy ] do
  post :clone, on: :member
  resource  :position                                # 跨日 / 跨 backlog 排序
  resources :images
  resource  :participants
end

resources :expenses,    only: [ :update, :destroy ]
resources :settlements, only: [ :destroy ]
resources :route_legs,  only: [ :destroy ]

namespace :admin do
  resources :users
  resources :tours
end

# OAuth
match "/auth/:provider/callback", to: "sessions#create",      via: [ :get, :post ]
post  "/auth/email/send",          to: "sessions#send_code"
post  "/auth/email/verify",        to: "sessions#verify_code"
```

偏好 REST 资源而非自定义 action(详见 [STYLE.md](STYLE.md))。

## 项目结构

```
app/
├── controllers/
│   ├── tours/                      # Tour 作用域子资源(constitution 等)
│   ├── conversations/              # AI 消息
│   ├── admin/                      # /admin 命名空间
│   └── profiles/                   # 当前用户 profile + avatar
├── models/                         # 富模型,权限与业务逻辑在这里
│   ├── tour.rb day.rb activity.rb
│   ├── tour_membership.rb activity_participant.rb
│   ├── expense.rb expense_split.rb expense_receipt.rb tour_budget.rb settlement.rb
│   ├── route_leg.rb
│   └── expense/summarize.rb        # 费用汇总的"账簿立场"
├── jobs/
│   └── chat_stream_job.rb          # AI 流式响应(Action Cable)
└── javascript/
    ├── entrypoints/inertia.jsx
    ├── pages/{Tour,Auth,Admin}/    # Inertia 页面
    ├── components/
    │   ├── activity-editor/        # CommonFields / DetailsFields / MarkdownEditor / ParticipantsSection
    │   └── planner/                # DayColumn / BacklogList / ActivityCard / ActivityFilterBar / PlannerMap
    └── hooks/

config/
├── routes.rb
├── deploy.yml                      # Kamal
└── storage.yml                     # Active Storage (R2)

spec/                               # RSpec + FactoryBot + WebMock
```

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
4. (推荐)勾 **Deployment branches** → Selected branches → `main` —— 只允许从 main 触发

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
