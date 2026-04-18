# 用户昵称 / 头像编辑

## Context

当前新用户通过邮箱验证码登录时，`User#name` 由 `email.split("@").first` 自动生成（比如 `skipmaple`），用户无法修改；OAuth 登录的用户虽然 provider 带回了 `name` 和 `avatar_url`，但同样无法事后编辑。需求是给登录用户一个入口，自行修改昵称和上传头像。

本次范围为**纯 opt-in 设置**：不做首次登录引导，也不改现有注册流程（除数据归一化之外）。

**当前用户规模**：5 个 OAuth 用户。数据迁移影响可忽略。

---

## 决策摘要

| 维度 | 选择 |
|---|---|
| 交互形态 | 顶栏头像菜单加"个人设置"，点击打开 Mantine Modal |
| 昵称字段 | 直接复用 `User#name` 列，不新增 `nickname` |
| 昵称字符集 | `/\A[A-Za-z0-9\p{Han}]+\z/`（字母、数字、中文） |
| 昵称长度 | 1–30 字符 |
| 头像存储 | Active Storage `has_one_attached :avatar` → R2（沿用现有 `:cloudflare` service） |
| 头像兜底链 | 自传 attachment → 现有 `avatar_url` 列（OAuth 带回的图）→ initials |
| 头像格式 | `image/jpeg`, `image/png`, `image/webp` |
| 头像大小 | ≤ 5 MB |
| 头像变体 | `resize_to_limit: [512, 512]`，懒生成 |
| 头像删除 | 独立 REST 端点 `DELETE /profile/avatar`（purge_later） |
| 无审核 | 保存即生效 |

---

## 数据模型

### `app/models/user.rb`

新增内容：

```ruby
class User < ApplicationRecord
  has_one_attached :avatar

  has_many :oauth_identities, dependent: :destroy
  has_many :guidebooks, foreign_key: :author_id, dependent: :destroy
  has_many :guidebook_memberships, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :name, presence: true,
                   length: { in: 1..30 },
                   format: { with: /\A[A-Za-z0-9\p{Han}]+\z/,
                             message: "只能包含字母、数字或中文" }
  validates :email, presence: true, uniqueness: true
  validate  :avatar_format_and_size, if: -> { avatar.attached? }

  def display_avatar_url
    if avatar.attached?
      Rails.application.routes.url_helpers.rails_representation_url(
        avatar.variant(resize_to_limit: [ 512, 512 ]),
        only_path: true
      )
    else
      avatar_url
    end
  end

  def has_custom_avatar?
    avatar.attached?
  end

  private
    def avatar_format_and_size
      unless %w[image/jpeg image/png image/webp].include?(avatar.content_type)
        errors.add(:avatar, "格式不支持")
      end
      if avatar.byte_size > 5.megabytes
        errors.add(:avatar, "不能超过 5MB")
      end
    end
end
```

### 不做的事

- **不新增 DB 列**：`has_one_attached` 复用已有的 `active_storage_*` 表；`avatar_url` 字符串列保留作 OAuth 兜底，不动。
- **不动 `config/storage.yml`**：R2 的 `request_checksum_calculation: when_required` 配置已到位（见 [config/storage.yml:20-21](config/storage.yml:20)），新 feature 沿用。

---

## 路由

```ruby
# config/routes.rb
resource :profile, only: [ :update ] do
  resource :avatar, only: [ :destroy ]
end
```

产生：

- `PATCH  /profile` → 改昵称 / 上传头像
- `DELETE /profile/avatar` → 清除自传头像、回落到 `avatar_url` / initials

**为什么不要 `show`**：Modal 初始状态直接从 `usePage().props.current_user` 读取，已经通过 `inertia_share` 全局暴露，不需要额外的 GET。

**为什么头像删除是独立资源**：STYLE.md 第 138 行 CRUD 准则——不映射 CRUD 动词的 action 用新资源替代，避免 `POST /profile/remove_avatar` 式自定义动作。

---

## Controller

### `app/controllers/profiles_controller.rb`（新）

```ruby
class ProfilesController < ApplicationController
  before_action :require_login

  def update
    if current_user.update(profile_params)
      redirect_back_or_to(root_path, notice: "已保存")
    else
      redirect_back_or_to(root_path, inertia: { errors: current_user.errors.to_hash(true) })
    end
  end

  private
    def profile_params
      params.require(:user).permit(:name, :avatar)
    end
end
```

### `app/controllers/profiles/avatars_controller.rb`（新）

```ruby
class Profiles::AvatarsController < ApplicationController
  before_action :require_login

  def destroy
    current_user.avatar.purge_later
    redirect_back_or_to(root_path, notice: "已恢复默认头像")
  end
end
```

**设计要点**：

- 控制器直接打模型，符合 STYLE.md "thin controllers" 原则。
- `purge_later` 走 ActiveJob，响应不阻塞文件清理。
- `redirect_back_or_to(root_path)`：Inertia patch/delete 需要服务端重定向以触发 props 刷新；fallback 到 `root_path` 保证未知 referrer 也安全。
- 无 `profile_params` 为空时的特殊处理——Rails 的 `update({})` 在 params 缺失时返回 true，对前端是幂等的 no-op。
- **inertia_rails 3.20 错误回传 API**：`redirect_back_or_to(path, inertia: { errors: ... })` 是 gem 官方支持的写法，错误自动走 `flash[:inertia_errors]` 在下次页面 props 里显现。实现时若 gem 语法有偏差（不同小版本），按 `inertia_rails` 3.20 的官方示例对齐即可。

---

## Inertia 共享 props 扩展

### `app/controllers/application_controller.rb`

```ruby
inertia_share current_user: -> {
  next unless current_user
  current_user.as_json(only: [ :id, :name, :email ])
              .merge(
                "avatar_url"        => current_user.display_avatar_url,
                "has_custom_avatar" => current_user.has_custom_avatar?
              )
}
```

### 决策解释

- **`avatar_url` 的 key 不改名**：现有 [AppLayout.jsx:19](app/javascript/layouts/AppLayout.jsx:19) 读的就是这个字段，其它 UI 组件也可能直接读——保持 key 稳定，值从"列字面量"切成"fallback 链结果"，所有显示点零改动自动生效。
- **新增 `has_custom_avatar`**：让 Modal 精确判断是否显示"使用默认头像"按钮，避免"点了但后端没可 purge 的 attachment"的空操作。

---

## 现存数据迁移与 OAuth 路径修复

加 `name` 的 regex 校验会炸所有 name 里含空格、连字符、标点的现存 OAuth 用户——Rails 默认每次 `save` 跑全部校验，未来任何一次 user update 都会失败。**必须在同一次部署里一起解决**。

### ① Backfill 迁移

`db/migrate/<ts>_sanitize_existing_user_names.rb`：

```ruby
class SanitizeExistingUserNames < ActiveRecord::Migration[8.0]
  def up
    User.find_each do |u|
      clean = u.name.to_s.gsub(/[^A-Za-z0-9\p{Han}]/, "")[0, 30]
      clean = "user#{u.id}" if clean.empty?
      u.update_columns(name: clean)
    end
  end

  def down
    # 不可逆 —— 原始 name 无法恢复
  end
end
```

`update_columns` 跳过 validations 和 callbacks；此时新 validation 尚未生效（因为迁移运行在 kamal deploy 的 pre-boot 阶段、应用还没重启），也不会自我阻塞，顺序天然安全。

### ② OAuth / 邮件验证码创建路径 sanitize

`app/controllers/sessions_controller.rb`：

```ruby
private
  def find_or_create_user_by_email(raw_email)
    email = EmailVerification.normalize_email(raw_email)
    User.find_by(email: email) || User.create!(
      email: email,
      name:  sanitize_name(email.split("@").first, fallback: "user")
    )
  end

  def find_or_create_user(auth)
    email = auth.info.email.presence || fallback_email(auth)
    if user = User.find_by(email: email)
      user
    else
      User.create!(
        email: email,
        name:  sanitize_name(auth.info.name.presence || auth.info.nickname, fallback: "user"),
        avatar_url: auth.info.image
      )
    end
  end

  def sanitize_name(raw, fallback:)
    cleaned = raw.to_s.gsub(/[^A-Za-z0-9\p{Han}]/, "")[0, 30]
    cleaned.presence || fallback
  end
```

### 为什么不加条件校验（`if: :name_changed?`）

因为 Rails 在多种 save 路径下会隐式触发 user 校验（autosave 关联、concern 的 after_save 等），单靠条件规避太脆弱。**一次性 backfill + 无条件严格校验** 是可维护性最好的选择。现存 5 个 OAuth 用户的破坏性归一化已经在 brainstorming 中被明确接受。

---

## 前端

### 入口：`app/javascript/layouts/AppLayout.jsx`

在现有 Menu.Dropdown 内、退出之前加一项：

```jsx
import { IconUserCircle, IconLogout } from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import ProfileSettingsModal from '../components/ProfileSettingsModal'

// 组件内：
const [opened, { open, close }] = useDisclosure(false)

<Menu.Divider />
<Menu.Item leftSection={<IconUserCircle size={14} />} onClick={open}>
  个人设置
</Menu.Item>
<Menu.Item leftSection={<IconLogout size={14} />} component={Link} href="/logout" method="delete" as="button">
  退出
</Menu.Item>
// ...
<ProfileSettingsModal opened={opened} onClose={close} />
```

### 新组件：`app/javascript/components/ProfileSettingsModal.jsx`

```jsx
import { Modal, Stack, TextInput, FileInput, Button, Group, Avatar, Anchor } from '@mantine/core'
import { useForm, usePage, router } from '@inertiajs/react'
import { useMemo } from 'react'

const NAME_RE = /^[A-Za-z0-9\u4e00-\u9fff]+$/

export default function ProfileSettingsModal({ opened, onClose }) {
  const { current_user } = usePage().props
  const form = useForm({ name: current_user.name, avatar: null })

  const previewUrl = useMemo(() => {
    if (form.data.avatar) return URL.createObjectURL(form.data.avatar)
    return current_user.avatar_url || null
  }, [form.data.avatar, current_user.avatar_url])

  const clientNameError = (() => {
    const v = form.data.name.trim()
    if (v.length === 0) return '昵称不能为空'
    if (v.length > 30)  return '昵称不能超过 30 字符'
    if (!NAME_RE.test(v)) return '只能包含字母、数字或中文'
    return null
  })()

  function submit(e) {
    e.preventDefault()
    if (clientNameError) return
    form.patch('/profile', { forceFormData: true, preserveScroll: true, onSuccess: onClose })
  }

  function removeAvatar() {
    router.delete('/profile/avatar', { preserveScroll: true })
  }

  const showRemoveAvatar = current_user.has_custom_avatar && !form.data.avatar

  return (
    <Modal opened={opened} onClose={onClose} title="个人设置" centered>
      <form onSubmit={submit}>
        <Stack>
          <Group>
            <Avatar src={previewUrl} size={72} radius="xl">
              {current_user.name?.[0]?.toUpperCase()}
            </Avatar>
            <Stack gap={4} style={{ flex: 1 }}>
              <FileInput
                placeholder="选择图片 (JPG/PNG/WebP, ≤5MB)"
                accept="image/jpeg,image/png,image/webp"
                value={form.data.avatar}
                onChange={(f) => form.setData('avatar', f)}
                error={form.errors.avatar}
                size="xs"
              />
              {showRemoveAvatar && (
                <Anchor component="button" type="button" size="xs" c="dimmed" onClick={removeAvatar}>
                  使用默认头像
                </Anchor>
              )}
            </Stack>
          </Group>

          <TextInput
            label="昵称"
            value={form.data.name}
            onChange={(e) => form.setData('name', e.currentTarget.value)}
            error={form.errors.name || clientNameError}
            maxLength={30}
            required
          />

          <TextInput label="邮箱" value={current_user.email} readOnly disabled />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>取消</Button>
            <Button type="submit" loading={form.processing} disabled={Boolean(clientNameError)}>
              保存
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
```

### 决策解释

- **Inertia `useForm` + `forceFormData: true`**：CLAUDE.md 明确要求走 Inertia；`forceFormData` 保证 `File` 对象走 multipart 而非 JSON 序列化丢失。
- **`onSuccess: onClose`**：服务端 `redirect_back` 带回新的 `current_user` props，顶栏头像、聊天、成员列表自动刷新——无需手动同步。
- **客户端预校验 + 服务端权威**：前端正则阻止无效提交以减少往返；服务端仍是真理。JS 侧用 `\u4e00-\u9fff`（CJK 基本区，BMP）与 Ruby 的 `\p{Han}`（包括扩展区 A/B/C 等罕见字符）存在理论差异，但扩展区字符在昵称场景极罕见，且客户端收紧不会导致服务端拒绝（反向安全）。实现时若想完全一致，可把 Ruby 侧也改为 `/\A[A-Za-z0-9\u4e00-\u9fff]+\z/`。
- **`URL.createObjectURL` 预览**：选了文件立即看到效果，`useMemo` 防止 re-render 时重建 URL。
- **`preserveScroll`**：Inertia 默认刷新后滚回顶部，Modal 场景不希望页面抖动。
- **`showRemoveAvatar`**：`has_custom_avatar` 取自 props（后端判定），且当前表单里没有待上传的新文件——避免"点了按钮但什么都没 purge"的空操作。

### 零改动的传播点

- [AppLayout.jsx:19](app/javascript/layouts/AppLayout.jsx:19) 读 `current_user.avatar_url`，后端 `display_avatar_url` 的返回值透明接管，顶栏头像自动切换。
- 其它读 `user.name` 的组件（ChatPanel、TourSettingsModal 等）在 Inertia 下次带 props 时自动更新。

---

## 测试

### Model specs — `spec/models/user_spec.rb` 扩展

```
描述: name validations
  - 拒绝含空格的名字（"Drew Lee"）
  - 拒绝含连字符的名字（"drew-lee"）
  - 拒绝含 emoji 的名字
  - 拒绝超过 30 字符
  - 拒绝空白
  - 接受纯 ASCII 字母数字
  - 接受纯中文
  - 接受字母数字 + 中文混合

描述: #display_avatar_url
  - 有 attached avatar 时返回 rails_representation_url 路径
  - 无 attached 但有 avatar_url 列时返回 avatar_url
  - 两者皆无时返回 nil

描述: #has_custom_avatar?
  - attached 时 true
  - 未 attached 时 false

描述: avatar format / size validation
  - 拒绝非图片 content_type
  - 拒绝 > 5MB 文件
  - 接受 JPEG/PNG/WebP 且 ≤ 5MB
```

fixture：`spec/fixtures/files/avatar.png`（1×1 PNG，~70 字节）。

### Request specs

**`spec/requests/profiles_spec.rb`**：

- 未登录 `PATCH /profile` → 重定向到 `/login`
- 已登录 + 合法 name → 302/303，`user.reload.name` 已更新
- 已登录 + 非法 name → 重定向带 `inertia: { errors: { name: [...] } }`
- 已登录 + 合法头像文件 → `user.avatar.attached?` 为 true
- 已登录 + 超大文件 → errors 带 `:avatar`

**`spec/requests/profiles/avatars_spec.rb`**：

- 未登录 `DELETE /profile/avatar` → 重定向到 `/login`
- 已登录 + 有自传头像 → 用 `have_enqueued_job(ActiveStorage::PurgeJob)` 断言入队
- 已登录 + 无自传头像 → 不崩，返回 302（幂等）

登录沿用项目约定：`post "/login_test", params: { user_id: user.id }`。

### 数据迁移 spec — `spec/migrations/sanitize_existing_user_names_spec.rb`（可选）

如果团队惯例有就加，否则手动验证一次即可。核心断言：

- `"Drew Lee"` → `"DrewLee"`
- `"drew-lee"` → `"drewlee"`
- `"😀"` → `"user<id>"`（清空后走 fallback）

### JS 测试 — `app/javascript/components/__tests__/ProfileSettingsModal.test.jsx`

```
- 空昵称时禁用保存按钮
- emoji 昵称显示错误、禁用保存按钮
- 选了新文件后，previewUrl 为 blob URL
- has_custom_avatar 为 false 时不渲染"使用默认头像"
- has_custom_avatar 为 true 且未选新文件时渲染"使用默认头像"
```

### 手动浏览器回归

`bin/worktree-dev up` 后：

1. 登录 → 顶栏头像菜单 → 点"个人设置"
2. 改昵称为合法值 → 保存 → 菜单 Label 立即变化
3. 改昵称为 `"bad name"`（含空格）→ 内联错误显示，保存按钮禁用
4. 传 200KB PNG → 预览出现 → 保存 → 顶栏头像变新图
5. 有自传头像后出现"使用默认头像" → 点 → 头像回落到 OAuth 默认或 initials
6. 传 6MB JPG → 服务端返回 `:avatar` 错误

### CI 本地运行（CLAUDE.md 要求）

```sh
mise exec -- bundle exec rspec
npm test
bin/rubocop -f github
bin/brakeman --no-pager
npm audit
```

---

## 动变文件清单

**新增**：

- `app/controllers/profiles_controller.rb`
- `app/controllers/profiles/avatars_controller.rb`
- `app/javascript/components/ProfileSettingsModal.jsx`
- `db/migrate/<ts>_sanitize_existing_user_names.rb`
- `spec/requests/profiles_spec.rb`
- `spec/requests/profiles/avatars_spec.rb`
- `spec/fixtures/files/avatar.png`
- `app/javascript/components/__tests__/ProfileSettingsModal.test.jsx`

**修改**：

- `app/models/user.rb`
- `app/controllers/application_controller.rb`
- `app/controllers/sessions_controller.rb`
- `app/javascript/layouts/AppLayout.jsx`
- `config/routes.rb`
- `spec/models/user_spec.rb`

**明确不改动**：

- `config/storage.yml`（R2 配置已就绪）
- `.env.production`、`.kamal/secrets`（无新 env var）
- `db/schema.rb`（`active_storage_*` 表已存在）

---

## 部署

Kamal 部署标准流程：`kamal deploy`。数据迁移会在新镜像启动前自动执行（顺序：拉取镜像 → 运行 `db:migrate` → 启动应用）。无需额外人工步骤，无新 env var。

## 风险与兜底

- **R2 可用性**：头像上传依赖 R2。若 R2 不可用，上传操作 raise；Active Storage 不会污染 DB（因为 attachment 记录是在 blob 写入成功后才创建）。
- **变体首次生成延迟**：第一次显示头像会触发 resize，需 200–500ms。对顶栏小图可接受；若未来放到"大头像"场景（个人主页、评论列表），再引入 pre-warm 任务。
- **迁移不可逆**：backfill 后原始 name 丢失。5 个用户已评估接受。
