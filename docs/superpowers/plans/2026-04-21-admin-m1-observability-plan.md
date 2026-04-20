# Admin M1 — 观测面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 admin 地基（role 枚举 + 鉴权路由 + 布局壳） + 观测页面（Dashboard 6 KPI + 趋势图 + Users/Tours 列表和详情） + LLM 用量采集（ChatStreamJob 捕获 tokens/成本）。

**Architecture:** Rails + Inertia + React + Mantine。`/admin` 命名空间走独立控制器链（`Admin::BaseController` 做 `require_admin!`，非 admin 返回 404）。前端复用现有 Mantine/Tabler 风格，放在 `app/javascript/pages/Admin/` 和 `app/javascript/components/admin/`。数据模型改动只有两个 migration（`users.role` 和 `messages` LLM 指标列），其余靠衍生查询。

**Tech Stack:** Rails 8、Inertia.js、React 19、Mantine UI 9、@tabler/icons-react、@mantine/charts（新增）、RSpec、Vitest、FactoryBot

**Spec reference:** [2026-04-21-admin-m1-observability-design.md](../specs/2026-04-21-admin-m1-observability-design.md)

---

## File Structure Map

**新建文件：**

| 文件 | 职责 |
|---|---|
| `db/migrate/*_add_role_to_users.rb` | users.role 列 + 索引 |
| `db/migrate/*_add_llm_metrics_to_messages.rb` | tokens_in/out/cost_cents 列 + created_at 索引 |
| `app/models/llm_pricing.rb` | 定价表 YAML 读取 + 模型 → 单价查找 |
| `config/llm_pricing.yml` | Kimi/Qwen/默认单价（cents per million tokens） |
| `lib/tasks/admin.rake` | `admin:grant EMAIL=x` / `admin:revoke EMAIL=x` |
| `app/controllers/admin/base_controller.rb` | 鉴权 + 日志 + Sentry breadcrumb |
| `app/controllers/admin/dashboard_controller.rb` | KPI + 趋势图 props |
| `app/controllers/admin/users_controller.rb` | 用户列表 + 详情 |
| `app/controllers/admin/tours_controller.rb` | Tour 列表 + 详情 |
| `app/javascript/components/admin/AdminShell.jsx` | Mantine AppShell 布局壳 + 侧栏导航 |
| `app/javascript/pages/Admin/Dashboard.jsx` | 6 KPI 卡 + 时间切换 + 趋势图 |
| `app/javascript/pages/Admin/UsersIndex.jsx` | 用户列表（表格 + 搜索 + 分页） |
| `app/javascript/pages/Admin/UsersShow.jsx` | 用户详情（Profile + 生涯 + Tour + 消息） |
| `app/javascript/pages/Admin/ToursIndex.jsx` | Tour 列表 |
| `app/javascript/pages/Admin/ToursShow.jsx` | Tour 详情（成员 + Day + 对话统计） |

**修改文件：**

| 文件 | 改动 |
|---|---|
| `config/routes.rb` | 追加 `namespace :admin` 块 |
| `app/models/user.rb` | `enum :role` + 清理 stale `guidebooks` 关联，改成 `tours` / `tour_memberships` |
| `app/models/message.rb` | `billable` scope |
| `app/jobs/chat_stream_job.rb` | 流结束捕获 usage，写入 Message 的新三列 |
| `db/seeds.rb` | 开发环境把第一个 user 设成 admin |
| `package.json` | 新增 `@mantine/charts` 依赖 |

**测试文件（新建/修改）：**

| 文件 | 用途 |
|---|---|
| `spec/models/user_spec.rb` | role 枚举、admin? |
| `spec/models/message_spec.rb` | billable scope |
| `spec/models/llm_pricing_spec.rb` | lookup 命中 / _default 兜底 |
| `spec/jobs/chat_stream_job_spec.rb` | usage 写入 + 缺失 null + 不 raise |
| `spec/tasks/admin_rake_spec.rb` | grant/revoke 改 role |
| `spec/requests/admin/base_controller_spec.rb` | 鉴权（未登录/非 admin 404，admin 200） |
| `spec/requests/admin/dashboard_controller_spec.rb` | KPI props + range 切换 + 趋势数据结构 |
| `spec/requests/admin/users_controller_spec.rb` | 列表分页/搜索/排序 + 详情四段 |
| `spec/requests/admin/tours_controller_spec.rb` | 列表分页/搜索 + 详情四段 |
| `app/javascript/components/admin/__tests__/AdminShell.test.jsx` | 侧栏导航渲染 + active 态 |

---

## Task Breakdown（14 个任务）

### Task 1: User role 枚举 + 清理 stale 关联

**Files:**
- Create: `db/migrate/*_add_role_to_users.rb`
- Modify: `app/models/user.rb`
- Test: `spec/models/user_spec.rb`

- [ ] **Step 1: 生成 migration 骨架**

Run:
```bash
mise exec -- bundle exec rails g migration AddRoleToUsers role:integer
```

Expected: 生成文件 `db/migrate/YYYYMMDDHHMMSS_add_role_to_users.rb`

- [ ] **Step 2: 编辑 migration 加 default/null/index**

覆盖生成文件内容：

```ruby
class AddRoleToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :role, :integer, default: 0, null: false
    add_index  :users, :role
  end
end
```

- [ ] **Step 3: 写 role enum 失败的 test**

在 `spec/models/user_spec.rb` 顶部（或新建）加：

```ruby
require "rails_helper"

RSpec.describe User, type: :model do
  describe "role enum" do
    it "defaults to :user" do
      user = create(:user)
      expect(user.role).to eq("user")
      expect(user.admin?).to be false
    end

    it "admin? returns true after promotion" do
      user = create(:user)
      user.update!(role: :admin)
      expect(user.admin?).to be true
    end
  end

  describe "associations (post-rename cleanup)" do
    it "has_many :tours (not :guidebooks)" do
      expect(User.reflect_on_association(:tours)).not_to be_nil
      expect(User.reflect_on_association(:guidebooks)).to be_nil
    end

    it "has_many :tour_memberships (not :guidebook_memberships)" do
      expect(User.reflect_on_association(:tour_memberships)).not_to be_nil
      expect(User.reflect_on_association(:guidebook_memberships)).to be_nil
    end
  end
end
```

- [ ] **Step 4: 跑测试，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/models/user_spec.rb
```

Expected: FAIL（role column 不存在 + 关联没 tours/tour_memberships）

- [ ] **Step 5: 执行 migration**

Run:
```bash
mise exec -- bundle exec rails db:migrate
```

Expected: `== AddRoleToUsers: migrated (...)`

- [ ] **Step 6: 改 User model**

编辑 `app/models/user.rb`，把第 5-6 行：

```ruby
has_many :guidebooks, foreign_key: :author_id, dependent: :destroy
has_many :guidebook_memberships, dependent: :destroy
```

替换为：

```ruby
has_many :tours, foreign_key: :author_id, dependent: :destroy
has_many :tour_memberships, dependent: :destroy
enum :role, user: 0, admin: 1
```

- [ ] **Step 7: 跑测试，确认全绿**

Run:
```bash
mise exec -- bundle exec rspec spec/models/user_spec.rb
```

Expected: PASS（3 examples, 0 failures）

- [ ] **Step 8: 跑全量 model spec 确认没破其它**

Run:
```bash
mise exec -- bundle exec rspec spec/models/
```

Expected: 全绿（User 的改动不应波及其它模型测试，因为 `guidebooks` 从未被任何 spec 使用）

- [ ] **Step 9: Commit**

```bash
git add db/migrate/ db/schema.rb app/models/user.rb spec/models/user_spec.rb
git commit -m "feat(admin): add User.role enum + clean stale guidebook associations"
```

---

### Task 2: Admin 鉴权 + 路由 + BaseController

**Files:**
- Modify: `config/routes.rb`
- Create: `app/controllers/admin/base_controller.rb`
- Create: `app/controllers/admin/dashboard_controller.rb`
- Create: `spec/requests/admin/base_controller_spec.rb`

- [ ] **Step 1: 写鉴权请求 spec（失败态）**

Create `spec/requests/admin/base_controller_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "Admin::BaseController auth", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  it "returns 404 when unauthenticated" do
    get "/admin"
    expect(response).to have_http_status(:not_found)
  end

  it "returns 404 when logged in as non-admin" do
    login_as(create(:user))
    get "/admin"
    expect(response).to have_http_status(:not_found)
  end

  it "returns 200 when logged in as admin" do
    admin = create(:user, role: :admin)
    login_as(admin)
    get "/admin"
    expect(response).to have_http_status(:ok)
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/base_controller_spec.rb
```

Expected: FAIL（路由不存在，两个 404 用例可能侥幸过，admin 200 用例一定失败）

- [ ] **Step 3: 追加路由**

编辑 `config/routes.rb`，在 `get "/login", to: "sessions#new"` 之前追加：

```ruby
  namespace :admin do
    root to: "dashboard#show"
    resources :users, only: [:index, :show]
    resources :tours, only: [:index, :show]
  end
```

- [ ] **Step 4: 创建 Admin::BaseController**

Create `app/controllers/admin/base_controller.rb`:

```ruby
module Admin
  class BaseController < ApplicationController
    before_action :require_admin!
    before_action :log_admin_access

    private

    def require_admin!
      unless current_user&.admin?
        raise ActionController::RoutingError.new("Not Found")
      end
    end

    def log_admin_access
      Rails.logger.info(
        "[admin] user=#{current_user.id} " \
        "action=#{controller_name}##{action_name} " \
        "params=#{request.filtered_parameters.except('controller', 'action')}"
      )
      Sentry.add_breadcrumb(
        Sentry::Breadcrumb.new(
          category: "admin",
          message: "#{controller_name}##{action_name}",
          level: "info"
        )
      )
    end
  end
end
```

- [ ] **Step 5: 创建 Admin::DashboardController stub**

Create `app/controllers/admin/dashboard_controller.rb`:

```ruby
module Admin
  class DashboardController < BaseController
    def show
      render inertia: "Admin/Dashboard", props: {}
    end
  end
end
```

- [ ] **Step 6: 创建空的 Dashboard.jsx 供 Inertia 渲染**

Create `app/javascript/pages/Admin/Dashboard.jsx`:

```jsx
export default function Dashboard() {
  return <div>Admin Dashboard</div>
}
```

- [ ] **Step 7: 跑 spec，确认全绿**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/base_controller_spec.rb
```

Expected: PASS（3 examples, 0 failures）

- [ ] **Step 8: Commit**

```bash
git add config/routes.rb app/controllers/admin/ app/javascript/pages/Admin/Dashboard.jsx spec/requests/admin/base_controller_spec.rb
git commit -m "feat(admin): auth gate + /admin routes + Dashboard stub"
```

---

### Task 3: admin rake 任务 + dev seed

**Files:**
- Create: `lib/tasks/admin.rake`
- Modify: `db/seeds.rb`
- Test: `spec/tasks/admin_rake_spec.rb`

- [ ] **Step 1: 写 rake 失败 spec**

Create `spec/tasks/admin_rake_spec.rb`:

```ruby
require "rails_helper"
require "rake"

RSpec.describe "admin rake tasks", type: :task do
  before(:all) do
    Rails.application.load_tasks if Rake::Task.tasks.empty?
  end

  before do
    Rake::Task["admin:grant"].reenable if Rake::Task.task_defined?("admin:grant")
    Rake::Task["admin:revoke"].reenable if Rake::Task.task_defined?("admin:revoke")
  end

  describe "admin:grant" do
    it "promotes the user to admin" do
      user = create(:user, email: "a@example.com")
      ENV["EMAIL"] = "a@example.com"
      Rake::Task["admin:grant"].invoke
      expect(user.reload.admin?).to be true
    ensure
      ENV.delete("EMAIL")
    end
  end

  describe "admin:revoke" do
    it "demotes admin to user" do
      user = create(:user, email: "b@example.com", role: :admin)
      ENV["EMAIL"] = "b@example.com"
      Rake::Task["admin:revoke"].invoke
      expect(user.reload.admin?).to be false
    ensure
      ENV.delete("EMAIL")
    end
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/tasks/admin_rake_spec.rb
```

Expected: FAIL（任务未定义）

- [ ] **Step 3: 创建 rake 任务**

Create `lib/tasks/admin.rake`:

```ruby
namespace :admin do
  desc "Grant admin role: rake admin:grant EMAIL=x@y.com"
  task grant: :environment do
    email = ENV.fetch("EMAIL")
    user = User.find_by!(email: email)
    user.update!(role: :admin)
    puts "✔ #{user.email} → admin"
  end

  desc "Revoke admin role: rake admin:revoke EMAIL=x@y.com"
  task revoke: :environment do
    email = ENV.fetch("EMAIL")
    user = User.find_by!(email: email)
    user.update!(role: :user)
    puts "✔ #{user.email} → user"
  end
end
```

- [ ] **Step 4: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/tasks/admin_rake_spec.rb
```

Expected: PASS (2 examples)

- [ ] **Step 5: 补 dev seed（可选，失败不阻塞）**

编辑 `db/seeds.rb`，在文件末尾追加：

```ruby
if Rails.env.development?
  User.first&.update!(role: :admin)
end
```

- [ ] **Step 6: Commit**

```bash
git add lib/tasks/admin.rake db/seeds.rb spec/tasks/admin_rake_spec.rb
git commit -m "feat(admin): grant/revoke rake tasks + dev seed"
```

---

### Task 4: Messages LLM 指标列 + billable scope

**Files:**
- Create: `db/migrate/*_add_llm_metrics_to_messages.rb`
- Modify: `app/models/message.rb`
- Test: `spec/models/message_spec.rb`

- [ ] **Step 1: 生成 migration**

Run:
```bash
mise exec -- bundle exec rails g migration AddLlmMetricsToMessages
```

- [ ] **Step 2: 编辑 migration**

覆盖生成文件内容：

```ruby
class AddLlmMetricsToMessages < ActiveRecord::Migration[8.0]
  def change
    add_column :messages, :tokens_in,   :integer
    add_column :messages, :tokens_out,  :integer
    add_column :messages, :cost_cents,  :integer
    add_index  :messages, :created_at
  end
end
```

- [ ] **Step 3: 写 billable scope 失败 spec**

Create or append to `spec/models/message_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe Message, type: :model do
  describe ".billable scope" do
    let(:conversation) { create(:conversation) }

    it "includes assistant messages with tokens_out recorded" do
      m = create(:message, conversation: conversation, role: :assistant,
                           tokens_out: 100, tokens_in: 50, cost_cents: 5)
      expect(Message.billable).to include(m)
    end

    it "excludes assistant messages with null tokens_out" do
      m = create(:message, conversation: conversation, role: :assistant,
                           tokens_out: nil)
      expect(Message.billable).not_to include(m)
    end

    it "excludes user messages even if tokens_out is set somehow" do
      m = create(:message, conversation: conversation, role: :user,
                           tokens_out: 99)
      expect(Message.billable).not_to include(m)
    end
  end
end
```

- [ ] **Step 4: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/models/message_spec.rb
```

Expected: FAIL (三列不存在 + scope 未定义)

- [ ] **Step 5: 执行 migration**

Run:
```bash
mise exec -- bundle exec rails db:migrate
```

- [ ] **Step 6: 在 Message 模型加 scope**

编辑 `app/models/message.rb`，在 `enum :role` 下加：

```ruby
scope :billable, -> { where(role: :assistant).where.not(tokens_out: nil) }
```

- [ ] **Step 7: 跑 spec，确认全绿**

Run:
```bash
mise exec -- bundle exec rspec spec/models/message_spec.rb
```

Expected: PASS (3 examples)

- [ ] **Step 8: Commit**

```bash
git add db/migrate/ db/schema.rb app/models/message.rb spec/models/message_spec.rb
git commit -m "feat(admin): messages token/cost columns + billable scope"
```

---

### Task 5: LlmPricing 模型 + 定价 yaml

**Files:**
- Create: `app/models/llm_pricing.rb`
- Create: `config/llm_pricing.yml`
- Test: `spec/models/llm_pricing_spec.rb`

- [ ] **Step 1: 创建 llm_pricing.yml**

Create `config/llm_pricing.yml`:

```yaml
# Unit: cents per million tokens (CN fen per million tokens)
# Values are PLACEHOLDERS — replace with real SiliconFlow published rates
# before first deploy. Update this file does NOT require migration.
moonshotai/Kimi-K2-Instruct-0905:
  input_cents_per_mtok:  400
  output_cents_per_mtok: 1200
qwen3-235b:
  input_cents_per_mtok:  200
  output_cents_per_mtok: 800
_default:
  input_cents_per_mtok:  500
  output_cents_per_mtok: 1500
```

- [ ] **Step 2: 写 LlmPricing 失败 spec**

Create `spec/models/llm_pricing_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe LlmPricing do
  describe ".lookup" do
    it "returns known-model pricing by exact name" do
      result = described_class.lookup("moonshotai/Kimi-K2-Instruct-0905")
      expect(result["input_cents_per_mtok"]).to eq(400)
      expect(result["output_cents_per_mtok"]).to eq(1200)
    end

    it "falls back to _default for unknown models and warns" do
      expect(Rails.logger).to receive(:warn).with(/unknown model/)
      result = described_class.lookup("nonexistent-model-xyz")
      expect(result["input_cents_per_mtok"]).to eq(500)
      expect(result["output_cents_per_mtok"]).to eq(1500)
    end

    it "returns a hash with string keys (from YAML.load_file)" do
      result = described_class.lookup("_default")
      expect(result).to include("input_cents_per_mtok", "output_cents_per_mtok")
    end
  end
end
```

- [ ] **Step 3: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/models/llm_pricing_spec.rb
```

Expected: FAIL (LlmPricing undefined)

- [ ] **Step 4: 实现 LlmPricing**

Create `app/models/llm_pricing.rb`:

```ruby
class LlmPricing
  CONFIG_PATH = Rails.root.join("config/llm_pricing.yml")

  class << self
    def lookup(model_name)
      pricing[model_name] || begin
        Rails.logger.warn("[llm_pricing] unknown model=#{model_name}, using _default")
        pricing["_default"]
      end
    end

    def reload!
      @pricing = nil
    end

    private

    def pricing
      @pricing ||= YAML.load_file(CONFIG_PATH)
    end
  end
end
```

- [ ] **Step 5: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/models/llm_pricing_spec.rb
```

Expected: PASS (3 examples)

- [ ] **Step 6: Commit**

```bash
git add app/models/llm_pricing.rb config/llm_pricing.yml spec/models/llm_pricing_spec.rb
git commit -m "feat(admin): LlmPricing YAML lookup + fallback"
```

---

### Task 6: ChatStreamJob 捕获 usage

**Files:**
- Modify: `app/jobs/chat_stream_job.rb`
- Test: `spec/jobs/chat_stream_job_spec.rb` (create or augment)

**背景：** 当前 `ChatStreamJob#perform` 的流程：
```ruby
full_text = stream_response(...)       # 只返 text
save_assistant_message(conversation, full_text)   # 只存 role/content
```
需要改成：`stream_response` 返回 `[full_text, final_response_with_usage]`，`save_assistant_message` 接收并写入 tokens。

- [ ] **Step 1: 写 job 失败 spec**

Create `spec/jobs/chat_stream_job_spec.rb` (若已存在就追加 describe 块):

```ruby
require "rails_helper"

RSpec.describe ChatStreamJob, type: :job do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }
  let(:conversation) { create(:conversation, tour: tour, user: user) }

  before do
    create(:message, conversation: conversation, role: :user, content: "hi")
  end

  describe "LLM usage capture" do
    it "writes tokens_in/tokens_out/cost_cents on the assistant message when usage present" do
      fake_response = double(
        "RubyLLM::Message",
        input_tokens: 1_000,
        output_tokens: 500,
        model_id: "moonshotai/Kimi-K2-Instruct-0905"
      )

      fake_chat = double("RubyLLM::Chat")
      allow(fake_chat).to receive(:with_instructions)
      allow(fake_chat).to receive(:with_tool)
      allow(fake_chat).to receive(:messages).and_return([])
      allow(fake_chat).to receive(:on_tool_call)
      allow(fake_chat).to receive(:on_tool_result)
      allow(fake_chat).to receive(:ask) do |_text, &blk|
        blk.call(double(content: "hello")) if blk
        fake_response
      end

      allow(RubyLLM).to receive(:chat).and_return(fake_chat)

      described_class.new.perform(conversation.id, tour.id, user.id)

      m = conversation.messages.where(role: :assistant).last
      expect(m.tokens_in).to eq(1_000)
      expect(m.tokens_out).to eq(500)
      # 1000 * 400/1M + 500 * 1200/1M = 0.4 + 0.6 = 1.0 cent; rounded
      expect(m.cost_cents).to eq(1)
    end

    it "stores nulls and does not raise when usage is missing" do
      fake_response = double(
        "RubyLLM::Message",
        input_tokens: nil,
        output_tokens: nil,
        model_id: nil
      )

      fake_chat = double("RubyLLM::Chat")
      allow(fake_chat).to receive(:with_instructions)
      allow(fake_chat).to receive(:with_tool)
      allow(fake_chat).to receive(:messages).and_return([])
      allow(fake_chat).to receive(:on_tool_call)
      allow(fake_chat).to receive(:on_tool_result)
      allow(fake_chat).to receive(:ask) do |_text, &blk|
        blk.call(double(content: "hello")) if blk
        fake_response
      end

      allow(RubyLLM).to receive(:chat).and_return(fake_chat)

      expect {
        described_class.new.perform(conversation.id, tour.id, user.id)
      }.not_to raise_error

      m = conversation.messages.where(role: :assistant).last
      expect(m.tokens_in).to be_nil
      expect(m.tokens_out).to be_nil
      expect(m.cost_cents).to be_nil
    end
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/jobs/chat_stream_job_spec.rb
```

Expected: FAIL（tokens 字段都是 nil）

- [ ] **Step 3: 改 ChatStreamJob 流程**

编辑 `app/jobs/chat_stream_job.rb`：

**3a. 修改 `perform`（line 12-20）** — 把 stream_response 的返回从单个 text 改成 `[text, response]`：

```ruby
def perform(conversation_id, tour_id, user_id)
  conversation = Conversation.find(conversation_id)
  tour         = Tour.find(tour_id)
  user         = User.find(user_id)
  channel      = "chat_tour_#{tour_id}_user_#{user_id}"

  full_text, final_response = stream_response(conversation, tour, user, channel)
  save_assistant_message(conversation, full_text, final_response)
  broadcast(channel, type: "complete", content: full_text)
rescue => e
  Sentry.capture_exception(e, extra: {
    conversation_id: conversation_id,
    tour_id: tour_id,
    user_id: user_id
  })
  broadcast(channel, type: "error", message: e.message)
end
```

**3b. 修改 `stream_response`（line 31-59）** — 捕获 `chat.ask` 的返回值：

```ruby
def stream_response(conversation, tour, user, channel)
  chat = RubyLLM.chat(
    model: ENV.fetch("LLM_MODEL", "moonshotai/Kimi-K2-Instruct-0905"),
    provider: :openai,
    assume_model_exists: true
  )
  chat.with_instructions(system_prompt(tour))
  AITools::Schema.all.each { |tool_class| chat.with_tool(tool_class.new(tour: tour, user: user)) }

  prior = conversation.messages.order(:created_at)[0..-2].to_a
  replay_history(chat, prior)

  attach_tool_callbacks(chat, channel)

  latest = conversation.messages.order(:created_at).last.content
  full_text = "".dup

  final_response = chat.ask(latest) do |chunk|
    text = chunk.content.to_s
    next if text.empty?
    full_text << text
    broadcast(channel, type: "assistant_text", delta: text)
  end

  [full_text, final_response]
end
```

**3c. 修改 `save_assistant_message`（line 96-98）** — 接收 response，读取 usage + 计成本：

```ruby
def save_assistant_message(conversation, content, final_response)
  return unless content.present?

  tokens_in  = safely(final_response) { final_response.input_tokens }
  tokens_out = safely(final_response) { final_response.output_tokens }
  model      = safely(final_response) { final_response.model_id } ||
               ENV.fetch("LLM_MODEL", "moonshotai/Kimi-K2-Instruct-0905")

  cost_cents = if tokens_in && tokens_out
    pricing = LlmPricing.lookup(model)
    (
      tokens_in  * pricing["input_cents_per_mtok"] +
      tokens_out * pricing["output_cents_per_mtok"]
    ) / 1_000_000.0
  end

  conversation.messages.create!(
    role: :assistant,
    content: content,
    tokens_in:  tokens_in,
    tokens_out: tokens_out,
    cost_cents: cost_cents&.round
  )
end

def safely(obj)
  return nil unless obj
  yield
rescue NoMethodError => e
  Rails.logger.warn("[llm_usage] missing method on response: #{e.message}")
  nil
end
```

- [ ] **Step 4: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/jobs/chat_stream_job_spec.rb
```

Expected: PASS (2 examples)

- [ ] **Step 5: Commit**

```bash
git add app/jobs/chat_stream_job.rb spec/jobs/chat_stream_job_spec.rb
git commit -m "feat(admin): capture LLM usage from ChatStreamJob into Message"
```

---

### Task 7: AdminShell 布局壳

**Files:**
- Create: `app/javascript/components/admin/AdminShell.jsx`
- Modify: `app/javascript/pages/Admin/Dashboard.jsx`（使用 AdminShell）
- Test: `app/javascript/components/admin/__tests__/AdminShell.test.jsx`

- [ ] **Step 1: 写 AdminShell 失败 test**

Create `app/javascript/components/admin/__tests__/AdminShell.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import AdminShell from '../AdminShell'

function renderWithShell(ui, { currentPath = '/admin' } = {}) {
  return render(
    <MantineProvider>
      <AdminShell currentPath={currentPath}>
        {ui}
      </AdminShell>
    </MantineProvider>,
  )
}

describe('AdminShell', () => {
  it('renders all three nav items', () => {
    renderWithShell(<div>child</div>)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('用户')).toBeInTheDocument()
    expect(screen.getByText('Tour')).toBeInTheDocument()
  })

  it('renders children', () => {
    renderWithShell(<div data-testid="child">hello</div>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders "Admin" badge in header', () => {
    renderWithShell(<div />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('highlights Dashboard nav when currentPath is /admin', () => {
    renderWithShell(<div />, { currentPath: '/admin' })
    const dashLink = screen.getByText('Dashboard').closest('a')
    expect(dashLink).toHaveAttribute('data-active', 'true')
  })

  it('highlights Users nav when currentPath starts with /admin/users', () => {
    renderWithShell(<div />, { currentPath: '/admin/users/42' })
    const usersLink = screen.getByText('用户').closest('a')
    expect(usersLink).toHaveAttribute('data-active', 'true')
  })
})
```

- [ ] **Step 2: 跑 test，确认红**

Run:
```bash
npm test -- app/javascript/components/admin/__tests__/AdminShell.test.jsx
```

Expected: FAIL (AdminShell 未定义)

- [ ] **Step 3: 实现 AdminShell**

Create `app/javascript/components/admin/AdminShell.jsx`:

```jsx
import { AppShell, Burger, Group, NavLink, Text, Badge } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link } from '@inertiajs/react'
import {
  IconLayoutDashboard,
  IconUsers,
  IconMap,
  IconArrowBack,
} from '@tabler/icons-react'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/admin',        icon: IconLayoutDashboard, match: (p) => p === '/admin' },
  { label: '用户',       href: '/admin/users',  icon: IconUsers,           match: (p) => p.startsWith('/admin/users') },
  { label: 'Tour',       href: '/admin/tours',  icon: IconMap,             match: (p) => p.startsWith('/admin/tours') },
]

export default function AdminShell({ children, currentPath = '' }) {
  const [opened, { toggle }] = useDisclosure()

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700}>One Tour</Text>
            <Badge color="red" variant="light">Admin</Badge>
          </Group>
          <Group gap="xs">
            <Link href="/" as="a">
              <Group gap={4}>
                <IconArrowBack size={16} />
                <Text size="sm">返回前台</Text>
              </Group>
            </Link>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {NAV_ITEMS.map((item) => {
          const active = item.match(currentPath)
          const Icon = item.icon
          return (
            <NavLink
              key={item.href}
              component={Link}
              href={item.href}
              label={item.label}
              leftSection={<Icon size={18} stroke={1.5} />}
              active={active}
              data-active={active || undefined}
            />
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  )
}
```

- [ ] **Step 4: 改 Dashboard.jsx 使用 AdminShell + 取 currentPath**

覆盖 `app/javascript/pages/Admin/Dashboard.jsx` 内容：

```jsx
import { usePage } from '@inertiajs/react'
import AdminShell from '../../components/admin/AdminShell'

export default function Dashboard() {
  const { url } = usePage()
  return (
    <AdminShell currentPath={url}>
      <div>Admin Dashboard (placeholder)</div>
    </AdminShell>
  )
}
```

- [ ] **Step 5: 跑 test，确认绿**

Run:
```bash
npm test -- app/javascript/components/admin/__tests__/AdminShell.test.jsx
```

Expected: PASS (5 tests)

- [ ] **Step 6: 跑完整 JS test 套件确认没破其它**

Run:
```bash
npm test
```

Expected: 全绿

- [ ] **Step 7: Commit**

```bash
git add app/javascript/components/admin/ app/javascript/pages/Admin/Dashboard.jsx
git commit -m "feat(admin): AdminShell layout with sidebar nav"
```

---

### Task 8: Dashboard KPI 卡 + 时间切换

**Files:**
- Modify: `app/controllers/admin/dashboard_controller.rb`
- Modify: `app/javascript/pages/Admin/Dashboard.jsx`
- Test: `spec/requests/admin/dashboard_controller_spec.rb`

- [ ] **Step 1: 写 Dashboard 控制器 spec**

Create `spec/requests/admin/dashboard_controller_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "Admin::DashboardController", type: :request do
  let(:admin) { create(:user, role: :admin) }

  before { post "/login_test", params: { user_id: admin.id } }

  it "returns 6 KPI values in Inertia props" do
    # Arrange: 2 users (admin + 1), 1 tour, 3 billable messages
    user = create(:user)
    tour = create(:tour, author: user)
    conv = create(:conversation, tour: tour, user: user)
    3.times { create(:message, conversation: conv, role: :assistant,
                                tokens_in: 10, tokens_out: 20, cost_cents: 5) }

    get "/admin", headers: { "X-Inertia" => "true" }
    expect(response).to have_http_status(:ok)
    props = JSON.parse(response.body).fetch("props")
    kpis  = props.fetch("kpis")

    expect(kpis).to include(
      "new_users", "active_users",
      "new_tours", "active_tours",
      "llm_messages", "llm_cost_cents"
    )
    expect(kpis["llm_messages"]).to eq(3)
    expect(kpis["llm_cost_cents"]).to eq(15)
  end

  it "accepts ?range=30d and adjusts window" do
    get "/admin?range=30d", headers: { "X-Inertia" => "true" }
    expect(response).to have_http_status(:ok)
    props = JSON.parse(response.body).fetch("props")
    expect(props.fetch("range")).to eq("30d")
  end

  it "defaults range to 7d" do
    get "/admin", headers: { "X-Inertia" => "true" }
    props = JSON.parse(response.body).fetch("props")
    expect(props.fetch("range")).to eq("7d")
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/dashboard_controller_spec.rb
```

Expected: FAIL（props 里没有 kpis/range）

- [ ] **Step 3: 实现 DashboardController#show**

覆盖 `app/controllers/admin/dashboard_controller.rb` 内容：

```ruby
module Admin
  class DashboardController < BaseController
    RANGES = { "today" => 1.day, "7d" => 7.days, "30d" => 30.days }.freeze

    def show
      range = resolve_range
      render inertia: "Admin/Dashboard", props: {
        range: range_key,
        kpis:  compute_kpis(range)
      }
    end

    private

    def range_key
      key = params[:range].to_s
      RANGES.key?(key) ? key : "7d"
    end

    def resolve_range
      (Time.current - RANGES.fetch(range_key))..Time.current
    end

    def compute_kpis(range)
      {
        "new_users":      User.where(created_at: range).count,
        "active_users":   active_user_count(range),
        "new_tours":      Tour.where(created_at: range).count,
        "active_tours":   Tour.where(updated_at: range).count,
        "llm_messages":   Message.billable.where(created_at: range).count,
        "llm_cost_cents": Message.billable.where(created_at: range).sum(:cost_cents).to_i
      }.stringify_keys
    end

    def active_user_count(range)
      tour_user_ids    = Tour.where(updated_at: range).pluck(:author_id)
      member_user_ids  = TourMembership.joins(:tour)
                                        .where(tours: { updated_at: range })
                                        .pluck(:user_id)
      message_user_ids = Message.billable.where(created_at: range)
                                .joins(conversation: :user).pluck("users.id")
      (tour_user_ids + member_user_ids + message_user_ids).uniq.size
    end
  end
end
```

- [ ] **Step 4: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/dashboard_controller_spec.rb
```

Expected: PASS (3 examples)

- [ ] **Step 5: 实现 Dashboard 前端（KPI 卡 + 时间 Tab）**

覆盖 `app/javascript/pages/Admin/Dashboard.jsx` 内容：

```jsx
import { usePage, router } from '@inertiajs/react'
import {
  Container, SimpleGrid, Card, Group, Text, Title, Tabs, Stack,
} from '@mantine/core'
import {
  IconUserPlus, IconUsersGroup, IconMapPlus, IconMap,
  IconMessageDots, IconCurrencyYen,
} from '@tabler/icons-react'
import AdminShell from '../../components/admin/AdminShell'

const RANGES = [
  { value: 'today', label: '今天' },
  { value: '7d',    label: '近 7 天' },
  { value: '30d',   label: '近 30 天' },
]

function KpiCard({ icon: Icon, label, value }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb="xs">
        <Icon size={18} stroke={1.6} />
        <Text size="sm" c="dimmed">{label}</Text>
      </Group>
      <Title order={2}>{value}</Title>
    </Card>
  )
}

function fmtCost(cents) {
  return `¥${(cents / 100).toFixed(2)}`
}

export default function Dashboard() {
  const { url, props } = usePage()
  const { range, kpis } = props

  const onRangeChange = (value) => {
    router.get('/admin', { range: value }, { preserveState: true, preserveScroll: true })
  }

  return (
    <AdminShell currentPath={url.split('?')[0]}>
      <Container size="lg" px={0}>
        <Stack gap="lg">
          <Group justify="space-between">
            <Title order={2}>Dashboard</Title>
            <Tabs value={range} onChange={onRangeChange} variant="pills">
              <Tabs.List>
                {RANGES.map((r) => (
                  <Tabs.Tab key={r.value} value={r.value}>{r.label}</Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </Group>

          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
            <KpiCard icon={IconUserPlus}     label="新增用户" value={kpis.new_users} />
            <KpiCard icon={IconUsersGroup}   label="活跃用户" value={kpis.active_users} />
            <KpiCard icon={IconMapPlus}      label="新增 Tour" value={kpis.new_tours} />
            <KpiCard icon={IconMap}          label="活跃 Tour" value={kpis.active_tours} />
            <KpiCard icon={IconMessageDots}  label="LLM 消息" value={kpis.llm_messages} />
            <KpiCard icon={IconCurrencyYen}  label="LLM 成本" value={fmtCost(kpis.llm_cost_cents)} />
          </SimpleGrid>
        </Stack>
      </Container>
    </AdminShell>
  )
}
```

- [ ] **Step 6: 跑全量 spec + JS test**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/
npm test
```

Expected: 全绿

- [ ] **Step 7: Commit**

```bash
git add app/controllers/admin/dashboard_controller.rb app/javascript/pages/Admin/Dashboard.jsx spec/requests/admin/dashboard_controller_spec.rb
git commit -m "feat(admin): Dashboard KPI cards with time range tabs"
```

---

### Task 9: Dashboard 趋势图

**Files:**
- Modify: `app/controllers/admin/dashboard_controller.rb`
- Modify: `app/javascript/pages/Admin/Dashboard.jsx`
- Modify: `package.json`（新增 `@mantine/charts`）
- Test: `spec/requests/admin/dashboard_controller_spec.rb`（追加断言）

- [ ] **Step 1: 安装 @mantine/charts**

Run:
```bash
npm install @mantine/charts recharts
```

Expected: package.json 新增两个依赖

- [ ] **Step 2: 追加 trend 数据的 spec**

在 `spec/requests/admin/dashboard_controller_spec.rb` 的 `describe` 块里追加：

```ruby
it "returns trend[] data in Inertia props with date/messages/cost per bucket" do
  user = create(:user)
  tour = create(:tour, author: user)
  conv = create(:conversation, tour: tour, user: user)
  create(:message, conversation: conv, role: :assistant,
                    tokens_in: 10, tokens_out: 20, cost_cents: 7,
                    created_at: 2.days.ago)

  get "/admin?range=7d", headers: { "X-Inertia" => "true" }
  props = JSON.parse(response.body).fetch("props")
  trend = props.fetch("trend")

  expect(trend).to be_an(Array)
  sample = trend.find { |b| b["messages"] > 0 }
  expect(sample).to include("date", "messages", "cost_cents")
  expect(sample["cost_cents"]).to eq(7)
end
```

- [ ] **Step 3: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/dashboard_controller_spec.rb
```

Expected: FAIL（`trend` 不在 props 里）

- [ ] **Step 4: 控制器加 trend 计算**

编辑 `app/controllers/admin/dashboard_controller.rb`，在 `show` 里追加 trend prop，并加 private 方法：

```ruby
def show
  range = resolve_range
  render inertia: "Admin/Dashboard", props: {
    range: range_key,
    kpis:  compute_kpis(range),
    trend: compute_trend(range)
  }
end

# ...

def compute_trend(range)
  # Group assistant messages by day, sum count and cost.
  # Using raw SQL (date_trunc) to keep it portable and indexed.
  rows = Message.billable
                .where(created_at: range)
                .group("DATE_TRUNC('day', created_at)")
                .pluck(Arel.sql("DATE_TRUNC('day', created_at)"),
                       Arel.sql("COUNT(*)"),
                       Arel.sql("COALESCE(SUM(cost_cents), 0)"))

  # Fill missing days with zero so the line chart shows gaps as zero not skip.
  by_date = rows.to_h { |date, cnt, cost| [date.to_date, { count: cnt, cost: cost }] }
  days_in_range = ((range.begin.to_date)..(range.end.to_date)).to_a

  days_in_range.map do |d|
    bucket = by_date[d] || { count: 0, cost: 0 }
    {
      "date"       => d.iso8601,
      "messages"   => bucket[:count],
      "cost_cents" => bucket[:cost].to_i
    }
  end
end
```

- [ ] **Step 5: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/dashboard_controller_spec.rb
```

Expected: PASS（所有用例，包括新的 trend 那个）

- [ ] **Step 6: 前端加 LineChart**

编辑 `app/javascript/pages/Admin/Dashboard.jsx`，在 SimpleGrid 之后追加：

```jsx
import { LineChart } from '@mantine/charts'

// ... in the Dashboard component, after </SimpleGrid>:

<Card withBorder padding="md" radius="md">
  <Group justify="space-between" mb="md">
    <Text fw={600}>趋势</Text>
    <Text size="sm" c="dimmed">消息数（左）· 成本 ¥（右）</Text>
  </Group>
  {props.trend.length === 0 ? (
    <Text c="dimmed" ta="center" py="xl">本时段暂无数据</Text>
  ) : (
    <LineChart
      h={240}
      data={props.trend.map((t) => ({
        ...t,
        cost_yuan: t.cost_cents / 100,
      }))}
      dataKey="date"
      series={[
        { name: 'messages',  label: '消息数', color: 'blue.6',   yAxisId: 'left'  },
        { name: 'cost_yuan', label: '成本¥',  color: 'orange.6', yAxisId: 'right' },
      ]}
      withRightYAxis
      curveType="monotone"
      withTooltip
      withLegend
    />
  )}
</Card>
```

**注意**：`@mantine/charts` 的 `LineChart` 需要 recharts 作为 peer 依赖（已在 Step 1 安装）。`withRightYAxis` + `yAxisId` 是 Mantine 文档中的双轴写法；若实施时 API 有差异，以当前 @mantine/charts 文档为准。

- [ ] **Step 7: 手动验收 + 跑全量 test**

启动 dev server（已在 9000 跑）或 worktree dev server：
```bash
# 如果在主 worktree：bin/dev 已经在 9000 跑
# 在 worktree 里需要隔离端口：
bin/worktree-dev up
```

浏览器打开 `http://localhost:9000/admin`，确认：
- 切换时间 Tab，KPI 数字和图表数据都变
- 图表悬停显示具体日的消息/成本
- 空数据显示"本时段暂无数据"文案

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/
npm test
```

Expected: 全绿

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json app/controllers/admin/dashboard_controller.rb app/javascript/pages/Admin/Dashboard.jsx spec/requests/admin/dashboard_controller_spec.rb
git commit -m "feat(admin): Dashboard LLM trend line chart (@mantine/charts)"
```

---

### Task 10: 用户列表

**Files:**
- Create: `app/controllers/admin/users_controller.rb`
- Create: `app/javascript/pages/Admin/UsersIndex.jsx`
- Test: `spec/requests/admin/users_controller_spec.rb`

- [ ] **Step 1: 写 users#index spec**

Create `spec/requests/admin/users_controller_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "Admin::UsersController", type: :request do
  let(:admin) { create(:user, role: :admin) }
  before { post "/login_test", params: { user_id: admin.id } }

  describe "GET /admin/users" do
    it "returns list with search/sort/paginate props" do
      5.times { create(:user) }
      get "/admin/users", headers: { "X-Inertia" => "true" }
      props = JSON.parse(response.body).fetch("props")
      expect(props).to include("users", "total", "page", "per_page", "q", "sort")
      expect(props["users"].size).to be >= 1
    end

    it "filters by ?q=" do
      alice = create(:user, name: "AliceXYZ", email: "alice@ex.com")
      create(:user, name: "Bob", email: "bob@ex.com")
      get "/admin/users?q=AliceXYZ", headers: { "X-Inertia" => "true" }
      props = JSON.parse(response.body).fetch("props")
      emails = props["users"].map { |u| u["email"] }
      expect(emails).to include(alice.email)
      expect(emails).not_to include("bob@ex.com")
    end

    it "sorts by cost_desc by default" do
      high = create(:user)
      low  = create(:user)
      [[high, 100], [low, 10]].each do |u, cost|
        tour = create(:tour, author: u)
        conv = create(:conversation, tour: tour, user: u)
        create(:message, conversation: conv, role: :assistant,
                         tokens_out: 1, cost_cents: cost)
      end
      get "/admin/users", headers: { "X-Inertia" => "true" }
      props = JSON.parse(response.body).fetch("props")
      ids = props["users"].map { |u| u["id"] }
      expect(ids.index(high.id)).to be < ids.index(low.id)
    end

    it "paginates with per_page=25" do
      30.times { create(:user) }
      get "/admin/users", headers: { "X-Inertia" => "true" }
      props = JSON.parse(response.body).fetch("props")
      expect(props["per_page"]).to eq(25)
      expect(props["users"].size).to eq(25)
      expect(props["total"]).to be >= 30
    end
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/users_controller_spec.rb
```

Expected: FAIL（controller 不存在）

- [ ] **Step 3: 实现 UsersController#index**

Create `app/controllers/admin/users_controller.rb`:

```ruby
module Admin
  class UsersController < BaseController
    PER_PAGE = 25
    RANGE_30D = 30.days

    def index
      page  = [params[:page].to_i, 1].max
      q     = params[:q].to_s.strip
      sort  = params[:sort].presence || "cost_desc"

      rel = build_scope(q)
      total = rel.count(:id)
      rows  = rel.order(order_clause(sort)).limit(PER_PAGE).offset((page - 1) * PER_PAGE)

      render inertia: "Admin/UsersIndex", props: {
        users:    rows.map { |r| serialize_user_row(r) },
        total:    total,
        page:     page,
        per_page: PER_PAGE,
        q:        q,
        sort:     sort
      }
    end

    private

    def build_scope(q)
      cutoff = RANGE_30D.ago

      # 必须用两个独立子查询 LEFT JOIN 进来，**不要** 同时 join
      # users → tours 和 users → conversations → messages —— 那会产生笛卡尔积
      # （tour_count × message_count 倍放大 SUM），用户有 2 个 Tour 时消息和成本都翻倍。
      message_stats_sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL.squish, cutoff])
        SELECT
          c.user_id,
          COUNT(DISTINCT m.id) AS messages_30d,
          COALESCE(SUM(COALESCE(m.tokens_in, 0) + COALESCE(m.tokens_out, 0)), 0) AS tokens_30d,
          COALESCE(SUM(m.cost_cents), 0) AS cost_30d_cents
        FROM messages m
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE m.role = 1
          AND m.tokens_out IS NOT NULL
          AND m.created_at > ?
        GROUP BY c.user_id
      SQL

      tours_count_sql = <<~SQL.squish
        SELECT author_id AS user_id, COUNT(*) AS tours_count
        FROM tours
        GROUP BY author_id
      SQL

      base = User
        .select(<<~COLS.squish)
          users.*,
          COALESCE(ms.messages_30d, 0)   AS messages_30d,
          COALESCE(ms.tokens_30d, 0)     AS tokens_30d,
          COALESCE(ms.cost_30d_cents, 0) AS cost_30d_cents,
          COALESCE(tc.tours_count, 0)    AS tours_count
        COLS
        .joins("LEFT JOIN (#{message_stats_sql}) ms ON ms.user_id = users.id")
        .joins("LEFT JOIN (#{tours_count_sql}) tc ON tc.user_id = users.id")

      base = base.where("users.name ILIKE :q OR users.email ILIKE :q", q: "%#{q}%") if q.present?
      base
    end

    def order_clause(sort)
      {
        "cost_desc"     => Arel.sql("cost_30d_cents DESC NULLS LAST"),
        "cost_asc"      => Arel.sql("cost_30d_cents ASC NULLS LAST"),
        "tokens_desc"   => Arel.sql("tokens_30d DESC NULLS LAST"),
        "messages_desc" => Arel.sql("messages_30d DESC NULLS LAST"),
        "created_desc"  => Arel.sql("users.created_at DESC"),
        "created_asc"   => Arel.sql("users.created_at ASC")
      }.fetch(sort, Arel.sql("cost_30d_cents DESC NULLS LAST"))
    end

    def serialize_user_row(u)
      {
        id:             u.id,
        name:           u.name,
        email:          u.email,
        role:           u.role,
        created_at:     u.created_at.iso8601,
        tours_count:    u.tours_count.to_i,
        messages_30d:   u.messages_30d.to_i,
        tokens_30d:     u.tokens_30d.to_i,
        cost_30d_cents: u.cost_30d_cents.to_i
      }
    end
  end
end
```

**安全提示**：
- `cutoff` 通过 `ActiveRecord::Base.sanitize_sql_array` 参数绑定，不是字符串拼接
- `q` 用 bind（`:q` 占位符）
- 两个子查询内没有任何用户输入 —— 结构是硬编码的
- 不要扩展 `build_scope` 时把其它用户输入拼进 SQL

- [ ] **Step 4: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/users_controller_spec.rb
```

Expected: PASS (4 examples)

- [ ] **Step 5: 实现 UsersIndex 前端**

Create `app/javascript/pages/Admin/UsersIndex.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { usePage, router, Link } from '@inertiajs/react'
import {
  Container, Title, Stack, Table, TextInput, Group, Pagination,
  Text, Anchor, Badge,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useDebouncedValue } from '@mantine/hooks'
import AdminShell from '../../components/admin/AdminShell'

function fmtCost(cents) { return `¥${(cents / 100).toFixed(2)}` }
function fmtNum(n)      { return n.toLocaleString() }
function fmtDate(iso)   { return new Date(iso).toLocaleDateString('zh-CN') }

const SORT_COLUMNS = [
  { key: 'created',  label: '注册时间' },
  { key: 'messages', label: '30d 消息' },
  { key: 'tokens',   label: '30d token' },
  { key: 'cost',     label: '30d 成本' },
]

export default function UsersIndex() {
  const { url, props } = usePage()
  const { users, total, page, per_page, q, sort } = props

  const [search, setSearch] = useState(q)
  const [debounced] = useDebouncedValue(search, 300)

  useEffect(() => {
    if (debounced !== q) {
      router.get('/admin/users',
        { q: debounced, sort, page: 1 },
        { preserveState: true, preserveScroll: true })
    }
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const setSort = (col, dir) => {
    router.get('/admin/users',
      { q, sort: `${col}_${dir}`, page: 1 },
      { preserveState: true, preserveScroll: true })
  }

  const setPage = (p) => {
    router.get('/admin/users',
      { q, sort, page: p },
      { preserveState: true, preserveScroll: true })
  }

  const totalPages = Math.max(1, Math.ceil(total / per_page))

  return (
    <AdminShell currentPath={url.split('?')[0]}>
      <Container size="xl" px={0}>
        <Stack gap="md">
          <Title order={2}>用户</Title>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="搜索姓名或邮箱"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Table highlightOnHover stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>姓名</Table.Th>
                <Table.Th>邮箱</Table.Th>
                <Table.Th>角色</Table.Th>
                <SortHeader sort={sort} col="created" label="注册" setSort={setSort} />
                <Table.Th>Tour 数</Table.Th>
                <SortHeader sort={sort} col="messages" label="30d 消息" setSort={setSort} />
                <SortHeader sort={sort} col="tokens"   label="30d token" setSort={setSort} />
                <SortHeader sort={sort} col="cost"     label="30d 成本" setSort={setSort} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td>{u.id}</Table.Td>
                  <Table.Td>
                    <Anchor component={Link} href={`/admin/users/${u.id}`}>{u.name}</Anchor>
                  </Table.Td>
                  <Table.Td>{u.email}</Table.Td>
                  <Table.Td>
                    <Badge color={u.role === 'admin' ? 'red' : 'gray'} variant="light">
                      {u.role}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{fmtDate(u.created_at)}</Table.Td>
                  <Table.Td>{u.tours_count}</Table.Td>
                  <Table.Td>{fmtNum(u.messages_30d)}</Table.Td>
                  <Table.Td>{fmtNum(u.tokens_30d)}</Table.Td>
                  <Table.Td>{fmtCost(u.cost_30d_cents)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">共 {total} 条</Text>
            <Pagination value={page} onChange={setPage} total={totalPages} />
          </Group>
        </Stack>
      </Container>
    </AdminShell>
  )
}

function SortHeader({ sort, col, label, setSort }) {
  const [curCol, curDir] = sort.split('_')
  const active = curCol === col
  const dir    = active && curDir === 'desc' ? 'asc' : 'desc'
  return (
    <Table.Th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => setSort(col, dir)}
    >
      {label}{active ? (curDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </Table.Th>
  )
}
```

- [ ] **Step 6: 跑全量 test**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/
npm test
```

Expected: 全绿

- [ ] **Step 7: Commit**

```bash
git add app/controllers/admin/users_controller.rb app/javascript/pages/Admin/UsersIndex.jsx spec/requests/admin/users_controller_spec.rb
git commit -m "feat(admin): users list with search/sort/paginate"
```

---

### Task 11: 用户详情页

**Files:**
- Modify: `app/controllers/admin/users_controller.rb`（加 `show`）
- Create: `app/javascript/pages/Admin/UsersShow.jsx`
- Test: `spec/requests/admin/users_controller_spec.rb`（追加 show 用例）

- [ ] **Step 1: 追加 users#show spec**

在 `spec/requests/admin/users_controller_spec.rb` 里追加：

```ruby
describe "GET /admin/users/:id" do
  it "returns profile, lifetime stats, tours, recent messages" do
    user = create(:user, name: "Carol", email: "carol@ex.com")
    tour = create(:tour, author: user, title: "Xinjiang")
    create(:tour_membership, user: user, tour: create(:tour))
    conv = create(:conversation, tour: tour, user: user)
    create(:message, conversation: conv, role: :user, content: "hi")
    create(:message, conversation: conv, role: :assistant, content: "hello",
                      tokens_in: 10, tokens_out: 20, cost_cents: 5)

    get "/admin/users/#{user.id}", headers: { "X-Inertia" => "true" }
    props = JSON.parse(response.body).fetch("props")

    expect(props["profile"]).to include("id" => user.id, "name" => "Carol")
    expect(props["lifetime_stats"]).to include(
      "total_tours", "total_messages", "total_tokens", "total_cost_cents"
    )
    expect(props["authored_tours"].first).to include("title" => "Xinjiang")
    expect(props["joined_tours"].size).to eq(1)
    expect(props["recent_messages"]).to be_an(Array)
    expect(props["recent_messages"].size).to be >= 2
  end

  it "returns 404 for non-existent user" do
    get "/admin/users/999999", headers: { "X-Inertia" => "true" }
    expect(response).to have_http_status(:not_found)
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/users_controller_spec.rb
```

Expected: FAIL（show action 不存在）

- [ ] **Step 3: 实现 UsersController#show**

在 `app/controllers/admin/users_controller.rb` 的 public 区域追加：

```ruby
def show
  user = User.find(params[:id])
  render inertia: "Admin/UsersShow", props: {
    profile:         serialize_profile(user),
    lifetime_stats:  lifetime_stats(user),
    authored_tours:  authored_tours(user),
    joined_tours:    joined_tours(user),
    recent_messages: recent_messages(user)
  }
rescue ActiveRecord::RecordNotFound
  raise ActionController::RoutingError.new("Not Found")
end
```

在 private 区域追加：

```ruby
def serialize_profile(user)
  {
    id:         user.id,
    name:       user.name,
    email:      user.email,
    role:       user.role,
    created_at: user.created_at.iso8601,
    avatar_url: user.display_avatar_url,
    oauth_providers: user.oauth_identities.pluck(:provider)
  }
end

def lifetime_stats(user)
  msgs = Message.billable.joins(conversation: :user).where(users: { id: user.id })
  {
    total_tours:      user.tours.count + user.tour_memberships.count,
    total_messages:   msgs.count,
    total_tokens:     msgs.sum("COALESCE(tokens_in,0) + COALESCE(tokens_out,0)").to_i,
    total_cost_cents: msgs.sum(:cost_cents).to_i
  }
end

def authored_tours(user)
  user.tours.order(updated_at: :desc).limit(20).map do |t|
    { id: t.id, title: t.title, day_count: t.days.count, updated_at: t.updated_at.iso8601 }
  end
end

def joined_tours(user)
  TourMembership.includes(:tour).where(user: user).limit(20).map do |m|
    {
      id:         m.tour.id,
      title:      m.tour.title,
      role:       m.role,
      joined_at:  m.created_at.iso8601,
      updated_at: m.tour.updated_at.iso8601
    }
  end
end

def recent_messages(user)
  Message.joins(conversation: :user)
         .where(users: { id: user.id })
         .order(created_at: :desc).limit(20)
         .map do |m|
    {
      id:         m.id,
      role:       m.role,
      content:    m.content.to_s.first(200),
      tokens_in:  m.tokens_in,
      tokens_out: m.tokens_out,
      cost_cents: m.cost_cents,
      created_at: m.created_at.iso8601
    }
  end
end
```

- [ ] **Step 4: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/users_controller_spec.rb
```

Expected: PASS

- [ ] **Step 5: 实现 UsersShow 前端**

Create `app/javascript/pages/Admin/UsersShow.jsx`:

```jsx
import { usePage, Link } from '@inertiajs/react'
import {
  Container, Stack, Title, Card, Group, Text, Badge, SimpleGrid,
  Tabs, Table, Avatar, Anchor,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import AdminShell from '../../components/admin/AdminShell'

function fmtCost(cents) {
  if (cents == null) return '—'
  return `¥${(cents / 100).toFixed(2)}`
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString() }
function fmtDate(iso) { return new Date(iso).toLocaleString('zh-CN') }

function StatCard({ label, value }) {
  return (
    <Card withBorder padding="md" radius="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Title order={3} mt={4}>{value}</Title>
    </Card>
  )
}

export default function UsersShow() {
  const { url, props } = usePage()
  const { profile, lifetime_stats, authored_tours, joined_tours, recent_messages } = props

  return (
    <AdminShell currentPath="/admin/users">
      <Container size="lg" px={0}>
        <Stack gap="md">
          <Anchor component={Link} href="/admin/users">
            <Group gap={4}><IconArrowLeft size={14} /><Text size="sm">返回用户列表</Text></Group>
          </Anchor>

          {/* Profile */}
          <Card withBorder padding="md" radius="md">
            <Group>
              <Avatar src={profile.avatar_url} size="xl" radius="xl" />
              <Stack gap={4}>
                <Group gap="xs">
                  <Title order={3}>{profile.name}</Title>
                  <Badge color={profile.role === 'admin' ? 'red' : 'gray'} variant="light">
                    {profile.role}
                  </Badge>
                </Group>
                <Text size="sm">{profile.email}</Text>
                <Text size="xs" c="dimmed">
                  ID #{profile.id} · 注册 {fmtDate(profile.created_at)}
                  {profile.oauth_providers.length > 0 &&
                    ` · ${profile.oauth_providers.join(', ')}`}
                </Text>
              </Stack>
            </Group>
          </Card>

          {/* Lifetime */}
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <StatCard label="总 Tour 数" value={lifetime_stats.total_tours} />
            <StatCard label="总消息数" value={fmtNum(lifetime_stats.total_messages)} />
            <StatCard label="总 token" value={fmtNum(lifetime_stats.total_tokens)} />
            <StatCard label="总成本" value={fmtCost(lifetime_stats.total_cost_cents)} />
          </SimpleGrid>

          {/* Tours tabs */}
          <Card withBorder padding="md" radius="md">
            <Tabs defaultValue="authored">
              <Tabs.List>
                <Tabs.Tab value="authored">我的 Tour ({authored_tours.length})</Tabs.Tab>
                <Tabs.Tab value="joined">参与的 Tour ({joined_tours.length})</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="authored" pt="md">
                <TourList items={authored_tours} showRole={false} />
              </Tabs.Panel>
              <Tabs.Panel value="joined" pt="md">
                <TourList items={joined_tours} showRole />
              </Tabs.Panel>
            </Tabs>
          </Card>

          {/* Recent messages */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">最近 20 条消息</Title>
            {recent_messages.length === 0 ? (
              <Text c="dimmed">暂无消息</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>时间</Table.Th>
                    <Table.Th>Role</Table.Th>
                    <Table.Th>内容（前 200 字）</Table.Th>
                    <Table.Th>Token</Table.Th>
                    <Table.Th>成本</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recent_messages.map((m) => (
                    <Table.Tr key={m.id}>
                      <Table.Td>{fmtDate(m.created_at)}</Table.Td>
                      <Table.Td><Badge variant="light">{m.role}</Badge></Table.Td>
                      <Table.Td>{m.content}</Table.Td>
                      <Table.Td>
                        {m.tokens_in != null ? `${m.tokens_in} / ${m.tokens_out}` : '—'}
                      </Table.Td>
                      <Table.Td>{fmtCost(m.cost_cents)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Stack>
      </Container>
    </AdminShell>
  )
}

function TourList({ items, showRole }) {
  if (items.length === 0) return <Text c="dimmed">暂无</Text>
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>标题</Table.Th>
          {showRole && <Table.Th>角色</Table.Th>}
          <Table.Th>Day 数</Table.Th>
          <Table.Th>更新时间</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((t) => (
          <Table.Tr key={t.id}>
            <Table.Td>
              <Anchor component={Link} href={`/admin/tours/${t.id}`}>{t.title}</Anchor>
            </Table.Td>
            {showRole && <Table.Td>{t.role}</Table.Td>}
            <Table.Td>{t.day_count ?? '—'}</Table.Td>
            <Table.Td>{fmtDate(t.updated_at)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
```

- [ ] **Step 6: 跑全量 test**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/
npm test
```

Expected: 全绿

- [ ] **Step 7: Commit**

```bash
git add app/controllers/admin/users_controller.rb app/javascript/pages/Admin/UsersShow.jsx spec/requests/admin/users_controller_spec.rb
git commit -m "feat(admin): user detail page with lifetime stats + tours + recent messages"
```

---

### Task 12: Tour 列表

**Files:**
- Create: `app/controllers/admin/tours_controller.rb`
- Create: `app/javascript/pages/Admin/ToursIndex.jsx`
- Test: `spec/requests/admin/tours_controller_spec.rb`

- [ ] **Step 1: 写 tours#index spec**

Create `spec/requests/admin/tours_controller_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "Admin::ToursController", type: :request do
  let(:admin) { create(:user, role: :admin) }
  before { post "/login_test", params: { user_id: admin.id } }

  describe "GET /admin/tours" do
    it "returns list with pagination props" do
      3.times { create(:tour) }
      get "/admin/tours", headers: { "X-Inertia" => "true" }
      props = JSON.parse(response.body).fetch("props")
      expect(props).to include("tours", "total", "page", "per_page", "q", "sort")
      expect(props["tours"].size).to be >= 3
    end

    it "filters by ?q=" do
      match = create(:tour, title: "北疆独库 11 天")
      create(:tour, title: "华东 5 天")
      get "/admin/tours?q=独库", headers: { "X-Inertia" => "true" }
      props = JSON.parse(response.body).fetch("props")
      ids = props["tours"].map { |t| t["id"] }
      expect(ids).to include(match.id)
      expect(ids.size).to eq(1)
    end

    it "defaults to sort=updated_desc" do
      newer = create(:tour, title: "Newer", updated_at: 1.hour.ago)
      older = create(:tour, title: "Older", updated_at: 2.days.ago)
      get "/admin/tours", headers: { "X-Inertia" => "true" }
      props = JSON.parse(response.body).fetch("props")
      ids = props["tours"].map { |t| t["id"] }
      expect(ids.index(newer.id)).to be < ids.index(older.id)
    end
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/tours_controller_spec.rb
```

Expected: FAIL

- [ ] **Step 3: 实现 ToursController#index**

Create `app/controllers/admin/tours_controller.rb`:

```ruby
module Admin
  class ToursController < BaseController
    PER_PAGE = 25

    def index
      page = [params[:page].to_i, 1].max
      q    = params[:q].to_s.strip
      sort = params[:sort].presence || "updated_desc"

      rel = build_scope(q)
      total = rel.count
      rows  = rel.order(order_clause(sort)).limit(PER_PAGE).offset((page - 1) * PER_PAGE)

      render inertia: "Admin/ToursIndex", props: {
        tours:    rows.map { |t| serialize_row(t) },
        total:    total,
        page:     page,
        per_page: PER_PAGE,
        q:        q,
        sort:     sort
      }
    end

    private

    def build_scope(q)
      rel = Tour.includes(:author, :days, :activities, :tour_memberships)
      rel = rel.where("tours.title ILIKE ?", "%#{q}%") if q.present?
      rel
    end

    def order_clause(sort)
      {
        "updated_desc" => { updated_at: :desc },
        "updated_asc"  => { updated_at: :asc },
        "created_desc" => { created_at: :desc },
        "created_asc"  => { created_at: :asc }
      }.fetch(sort, { updated_at: :desc })
    end

    def serialize_row(t)
      {
        id:             t.id,
        title:          t.title,
        author_name:    t.author.name,
        author_email:   t.author.email,
        author_id:      t.author.id,
        members_count:  1 + t.tour_memberships.size,
        day_count:      t.days.size,
        activity_count: t.activities.size,
        created_at:     t.created_at.iso8601,
        updated_at:     t.updated_at.iso8601
      }
    end
  end
end
```

- [ ] **Step 4: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/tours_controller_spec.rb
```

Expected: PASS

- [ ] **Step 5: 实现 ToursIndex 前端**

Create `app/javascript/pages/Admin/ToursIndex.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { usePage, router, Link } from '@inertiajs/react'
import {
  Container, Title, Stack, Table, TextInput, Group, Pagination,
  Text, Anchor,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useDebouncedValue } from '@mantine/hooks'
import AdminShell from '../../components/admin/AdminShell'

function fmtDate(iso) { return new Date(iso).toLocaleDateString('zh-CN') }

export default function ToursIndex() {
  const { url, props } = usePage()
  const { tours, total, page, per_page, q, sort } = props

  const [search, setSearch] = useState(q)
  const [debounced] = useDebouncedValue(search, 300)

  useEffect(() => {
    if (debounced !== q) {
      router.get('/admin/tours',
        { q: debounced, sort, page: 1 },
        { preserveState: true, preserveScroll: true })
    }
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  const setPage = (p) => {
    router.get('/admin/tours',
      { q, sort, page: p },
      { preserveState: true, preserveScroll: true })
  }

  const totalPages = Math.max(1, Math.ceil(total / per_page))

  return (
    <AdminShell currentPath={url.split('?')[0]}>
      <Container size="xl" px={0}>
        <Stack gap="md">
          <Title order={2}>Tour</Title>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="搜索标题"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Table highlightOnHover stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>标题</Table.Th>
                <Table.Th>作者</Table.Th>
                <Table.Th>成员数</Table.Th>
                <Table.Th>Day 数</Table.Th>
                <Table.Th>Activity 数</Table.Th>
                <Table.Th>创建</Table.Th>
                <Table.Th>最近更新</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tours.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>{t.id}</Table.Td>
                  <Table.Td>
                    <Anchor component={Link} href={`/admin/tours/${t.id}`}>{t.title}</Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Anchor component={Link} href={`/admin/users/${t.author_id}`}>
                      {t.author_name}
                    </Anchor>
                    <Text size="xs" c="dimmed">{t.author_email}</Text>
                  </Table.Td>
                  <Table.Td>{t.members_count}</Table.Td>
                  <Table.Td>{t.day_count}</Table.Td>
                  <Table.Td>{t.activity_count}</Table.Td>
                  <Table.Td>{fmtDate(t.created_at)}</Table.Td>
                  <Table.Td>{fmtDate(t.updated_at)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">共 {total} 条</Text>
            <Pagination value={page} onChange={setPage} total={totalPages} />
          </Group>
        </Stack>
      </Container>
    </AdminShell>
  )
}
```

- [ ] **Step 6: 跑全量 test**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/
npm test
```

Expected: 全绿

- [ ] **Step 7: Commit**

```bash
git add app/controllers/admin/tours_controller.rb app/javascript/pages/Admin/ToursIndex.jsx spec/requests/admin/tours_controller_spec.rb
git commit -m "feat(admin): tours list with search/paginate"
```

---

### Task 13: Tour 详情页

**Files:**
- Modify: `app/controllers/admin/tours_controller.rb`（加 `show`）
- Create: `app/javascript/pages/Admin/ToursShow.jsx`
- Test: `spec/requests/admin/tours_controller_spec.rb`（追加 show 用例）

- [ ] **Step 1: 追加 tours#show spec**

在 `spec/requests/admin/tours_controller_spec.rb` 里追加：

```ruby
describe "GET /admin/tours/:id" do
  it "returns tour profile + members + days + conversation stats" do
    author = create(:user, name: "Alex")
    tour   = create(:tour, author: author, title: "T1")
    member = create(:user, name: "Bob")
    create(:tour_membership, tour: tour, user: member, role: :editor)
    day1   = create(:day, tour: tour, day_index: 1)
    create(:activity, tour: tour, day: day1)
    conv   = create(:conversation, tour: tour, user: author)
    create(:message, conversation: conv, role: :assistant,
                      tokens_in: 10, tokens_out: 20, cost_cents: 5)

    get "/admin/tours/#{tour.id}", headers: { "X-Inertia" => "true" }
    props = JSON.parse(response.body).fetch("props")

    expect(props["tour"]).to include("id" => tour.id, "title" => "T1")
    expect(props["tour"]["author"]).to include("name" => "Alex")
    expect(props["members"].map { |m| m["name"] }).to include("Bob")
    expect(props["days"].size).to eq(1)
    expect(props["days"].first["activity_count"]).to eq(1)
    expect(props["conversation_stats"]).to include(
      "total_messages" => 1, "total_cost_cents" => 5
    )
  end

  it "returns 404 for non-existent tour" do
    get "/admin/tours/999999", headers: { "X-Inertia" => "true" }
    expect(response).to have_http_status(:not_found)
  end
end
```

- [ ] **Step 2: 跑 spec，确认红**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/tours_controller_spec.rb
```

Expected: FAIL

- [ ] **Step 3: 实现 ToursController#show**

在 `app/controllers/admin/tours_controller.rb` 的 public 区域追加：

```ruby
def show
  tour = Tour.includes(:author, :days, :activities, tour_memberships: :user, conversations: :messages).find(params[:id])

  render inertia: "Admin/ToursShow", props: {
    tour:               serialize_tour(tour),
    members:            members_list(tour),
    days:               days_summary(tour),
    conversation_stats: conversation_stats(tour)
  }
rescue ActiveRecord::RecordNotFound
  raise ActionController::RoutingError.new("Not Found")
end
```

在 private 区域追加：

```ruby
def serialize_tour(t)
  {
    id:         t.id,
    title:      t.title,
    start_date: t.try(:start_date)&.iso8601,
    end_date:   t.try(:end_date)&.iso8601,
    created_at: t.created_at.iso8601,
    updated_at: t.updated_at.iso8601,
    author: {
      id:    t.author.id,
      name:  t.author.name,
      email: t.author.email
    }
  }
end

def members_list(t)
  [{
    user_id:   t.author.id,
    name:      t.author.name,
    email:     t.author.email,
    role:      "author",
    joined_at: t.created_at.iso8601
  }] + t.tour_memberships.map do |m|
    {
      user_id:   m.user.id,
      name:      m.user.name,
      email:     m.user.email,
      role:      m.role,
      joined_at: m.created_at.iso8601
    }
  end
end

def days_summary(t)
  activity_by_day = t.activities.group_by(&:day_id)
  t.days.order(:day_index).map do |d|
    {
      id:             d.id,
      day_index:      d.day_index,
      date:           d.try(:date)&.iso8601,
      activity_count: activity_by_day[d.id]&.size || 0,
      updated_at:     d.updated_at.iso8601
    }
  end
end

def conversation_stats(t)
  msgs = Message.billable.where(conversation_id: t.conversations.select(:id))
  {
    total_messages:   msgs.count,
    total_tokens:     msgs.sum("COALESCE(tokens_in,0) + COALESCE(tokens_out,0)").to_i,
    total_cost_cents: msgs.sum(:cost_cents).to_i,
    last_message_at:  msgs.maximum(:created_at)&.iso8601
  }
end
```

- [ ] **Step 4: 跑 spec，确认绿**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/tours_controller_spec.rb
```

Expected: PASS

- [ ] **Step 5: 实现 ToursShow 前端**

Create `app/javascript/pages/Admin/ToursShow.jsx`:

```jsx
import { usePage, Link } from '@inertiajs/react'
import {
  Container, Stack, Title, Card, Group, Text, Badge, SimpleGrid, Table, Anchor,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import AdminShell from '../../components/admin/AdminShell'

function fmtCost(cents) {
  if (cents == null) return '—'
  return `¥${(cents / 100).toFixed(2)}`
}
function fmtNum(n) { return n == null ? '—' : n.toLocaleString() }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('zh-CN') : '—' }

function Stat({ label, value }) {
  return (
    <Card withBorder padding="sm" radius="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Title order={4} mt={4}>{value}</Title>
    </Card>
  )
}

export default function ToursShow() {
  const { props } = usePage()
  const { tour, members, days, conversation_stats: stats } = props

  return (
    <AdminShell currentPath="/admin/tours">
      <Container size="lg" px={0}>
        <Stack gap="md">
          <Anchor component={Link} href="/admin/tours">
            <Group gap={4}><IconArrowLeft size={14} /><Text size="sm">返回 Tour 列表</Text></Group>
          </Anchor>

          {/* Tour profile */}
          <Card withBorder padding="md" radius="md">
            <Title order={3}>{tour.title}</Title>
            <Text size="sm" mt={4}>
              作者：
              <Anchor component={Link} href={`/admin/users/${tour.author.id}`}>
                {tour.author.name}
              </Anchor>
              {' '}<Text span c="dimmed">{tour.author.email}</Text>
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              ID #{tour.id} · 创建 {fmtDate(tour.created_at)} · 更新 {fmtDate(tour.updated_at)}
              {tour.start_date && ` · ${tour.start_date} → ${tour.end_date || '—'}`}
            </Text>
          </Card>

          {/* Members */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">成员 ({members.length})</Title>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>姓名</Table.Th>
                  <Table.Th>邮箱</Table.Th>
                  <Table.Th>角色</Table.Th>
                  <Table.Th>加入时间</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {members.map((m) => (
                  <Table.Tr key={m.user_id}>
                    <Table.Td>
                      <Anchor component={Link} href={`/admin/users/${m.user_id}`}>{m.name}</Anchor>
                    </Table.Td>
                    <Table.Td>{m.email}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={m.role === 'author' ? 'grape' : 'gray'}>
                        {m.role}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{fmtDate(m.joined_at)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>

          {/* Days */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">Days ({days.length})</Title>
            {days.length === 0 ? (
              <Text c="dimmed">暂无 Day</Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Day</Table.Th>
                    <Table.Th>日期</Table.Th>
                    <Table.Th>Activity 数</Table.Th>
                    <Table.Th>更新时间</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {days.map((d) => (
                    <Table.Tr key={d.id}>
                      <Table.Td>Day {d.day_index}</Table.Td>
                      <Table.Td>{d.date || '—'}</Table.Td>
                      <Table.Td>{d.activity_count}</Table.Td>
                      <Table.Td>{fmtDate(d.updated_at)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>

          {/* Conversation stats */}
          <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">对话统计</Title>
            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <Stat label="消息数" value={fmtNum(stats.total_messages)} />
              <Stat label="总 token" value={fmtNum(stats.total_tokens)} />
              <Stat label="总成本" value={fmtCost(stats.total_cost_cents)} />
              <Stat label="最后发言" value={fmtDate(stats.last_message_at)} />
            </SimpleGrid>
          </Card>
        </Stack>
      </Container>
    </AdminShell>
  )
}
```

- [ ] **Step 6: 跑全量 test**

Run:
```bash
mise exec -- bundle exec rspec spec/requests/admin/
npm test
```

Expected: 全绿

- [ ] **Step 7: Commit**

```bash
git add app/controllers/admin/tours_controller.rb app/javascript/pages/Admin/ToursShow.jsx spec/requests/admin/tours_controller_spec.rb
git commit -m "feat(admin): tour detail page with members + days + conversation stats"
```

---

### Task 14: Final verification — lint + 全量测试 + 手工验收

**Files:** 无（只跑命令）

- [ ] **Step 1: Rubocop (CI-matching format)**

Run:
```bash
bin/rubocop -f github
```

Expected: 0 offenses。有的话根据 STYLE.md 修（不要 auto-correct，逐条看）

- [ ] **Step 2: Brakeman**

Run:
```bash
bin/brakeman --no-pager
```

Expected: `No warnings found`。特别注意 `users_controller.rb` 的 SQL 字符串拼接 —— 如果 brakeman 误报，用 `# brakeman:ignore:SQLInjection` 标注理由（拼接的是受控 iso8601 字符串，不是用户输入）

- [ ] **Step 3: 全量 RSpec**

Run:
```bash
mise exec -- bundle exec rspec
```

Expected: 全绿。关注新增的 4 个 request spec + 3 个 model spec + 1 个 job spec + 1 个 task spec

- [ ] **Step 4: 全量 Vitest**

Run:
```bash
npm test
```

Expected: 全绿（新增 1 个 AdminShell test）

- [ ] **Step 5: npm audit**

Run:
```bash
npm audit
```

Expected: 0 vulnerabilities。`@mantine/charts` + `recharts` 新增，有风险版本就 `npm audit fix` 或换版本

- [ ] **Step 6: 手工验收**

启动 worktree dev server：

```bash
# 在 worktree 根目录
cd /Users/drewlee/work/personal/one-tour/.claude/worktrees/admin-m1-observability
bin/worktree-dev up
```

把本地第一个 user 设为 admin：

```bash
mise exec -- bundle exec rails runner 'User.first.update!(role: :admin)'
```

打开 worktree dev server 的 URL（9100+ 端口之一），逐项验收：

- [ ] 非 admin 登录访问 `/admin` → 404（开小号测试或暂时 revoke）
- [ ] admin 登录访问 `/admin` → Dashboard 展示 6 KPI + 时间 Tab 切换生效
- [ ] 如果有消息数据，趋势图画出来；无数据显示"暂无"占位
- [ ] `/admin/users` 列表按 30d 成本降序；搜索框输入 300ms 后刷新
- [ ] 列表排序列（注册/消息/token/成本）点击切换方向，URL 的 sort 参数变
- [ ] 分页点击第 2 页，用户列表换数据
- [ ] 点击用户名进详情：Profile / Lifetime / Tours Tabs / Recent messages 都渲染
- [ ] `/admin/tours` 列表按更新时间降序；搜索"独库"之类能筛到
- [ ] 点击 Tour 进详情：Tour 卡 / 成员 / Day / 对话统计 都渲染
- [ ] 侧栏导航高亮随页面切换
- [ ] 顶部"返回前台"跳到 `/`

- [ ] **Step 7: 关 dev server**

```bash
bin/worktree-dev down
```

- [ ] **Step 8: 无需额外 commit**（本任务只跑检查，没有文件改动）

---

## Self-Review 检查清单

本 plan 的 self-review 结果（见 plan 末尾"Post-Plan Review"节）。Implementer 执行时**不需要**重跑 self-review。

---

## Execution Notes

**运行环境提示（CLAUDE.md 摘录）：**

- 本项目的 `bundle exec` 可能因 shebang 解析到系统 Ruby 2.6 而炸；**一律用 `mise exec -- bundle exec ...`** 前缀
- 数据库迁移只跑 primary；`db/cache_migrate` / `db/queue_migrate` / `db/cable_migrate` 是另外的 schema，本 plan 不碰
- dev server 在 worktree 里用 `bin/worktree-dev up`/`down`，不要用 `bin/dev`
- CI 只跑 rubocop / brakeman / npm audit，**不跑测试** —— 本地必须跑过才能 push

**关于 rubocop 的提示：**

看 `STYLE.md` — 项目的 rubocop 有项目专属规则（如方法排序），新增文件可能触发。优先手动按现有代码风格写，而不是依赖 `rubocop -A`。

**关于 SQL 注入防御（Task 10 users controller）：**

- 两个子查询的时间参数通过 `sanitize_sql_array` bind，不拼接
- `q` 用 `:q` 占位符 bind
- 子查询结构本身无用户输入（表名/列名硬编码）
- 若 brakeman 对 `joins("LEFT JOIN (...) ...")` 的字符串 join 报 warning，检查拼入 join 的都是 `sanitize_sql_array` 产出 —— 没有就忽略误报

**关于 `@mantine/charts` 的 API 漂移：**

Plan 中用的 `<LineChart>` 双 Y 轴 API（`withRightYAxis` + `series[].yAxisId`）基于当前 @mantine/charts 文档。实施时若版本有差异，看 gem 文档调整。若真写不出双轴，退到单轴 + 在工具提示里同时显示成本/消息数也能满足 M1 需求。
