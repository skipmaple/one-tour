# Activity 创建参与人 + 备注轻量富文本

**Date**: 2026-04-22
**Status**: Implemented (PR #40)

## Background

`ActivityDrawer` 当前两个摩擦点：

1. **创建新行时无法选参与人**。编辑态有 "参与人" tab，但 create 模式只能走"空 AP → 默认全员"的兜底。想改就得先保存、再切编辑、再去 tab——三步点击。
2. **备注（`desc`）仅是 plain text**。`<Textarea>` 编辑、`<Text whiteSpace="pre-wrap">` 展示。用户想加粗、列表、链接等轻量格式都做不到。

同时基础 tab 的 "类型细节" 一开就占满屏，新建时视觉噪音大。

本 spec 解决以上三点，聚焦在 `ActivityDrawer` + `CommonFields` + `ActivityDetailDrawer` 三个组件 + 后端原子创建。

## Goals

1. 在 `ActivityDrawer` 的"基础" tab 内嵌参与人选择（默认折叠），create/edit 模式下都生效
2. `POST /activities` 原子地接受可选 `user_ids`，一次事务内写入 Activity + ActivityParticipants
3. 把"类型细节"也改为默认折叠（有已填值时默认展开），降低基础 tab 初始视觉噪音
4. 备注字段支持轻量 Markdown：工具栏最小集（粗体/斜体/无序列表/链接/H3）+ 服务端 50 KB 上限；展示端用 `react-markdown` 渲染
5. 不引入 WYSIWYG 编辑器（Tiptap 等），仅新增一个依赖：`remark-breaks`

## Non-Goals

- 不新增 `desc_format` 区分列；不对存量 plain-text desc 做迁移或转义
- 不支持任务列表、代码块、表格、图片嵌入等 "大集" markdown 特性
- 不改 `effective_participant_ids` / `isFullRoster` 约定
- 不改 `Tour#show` controller payload 形状（`participant_user_ids` 已在 payload 里）
- **保留** 独立的 `PUT /activities/:id/participants` 端点（AI 工具链及未来可能的独立参与人编辑场景用，降低 blast radius）
- 不改 Day 模型的 desc 字段（`generateMarkdownBody.js:56-57` 引用的是 `day.desc`，不在本次范围）

## Feature 1 — 创建/编辑参与人 + 基础 tab 视觉瘦身

### UX

基础 tab 底部自上而下三段：

1. **备注**（保持展开 — 主要输入，改造为 Markdown 工具栏 + textarea，见 §Feature 2）
2. **类型细节**（`CollapsibleSection`，默认折叠；edit 模式下若已有任一字段填值则默认展开）
3. **参与人**（`CollapsibleSection`，默认折叠；edit 模式下若 `participant_user_ids` 非空则默认展开）

Collapsible header 右侧显示 dimmed summary：
- 类型细节："3 项已填" / "未填写"
- 参与人："默认全员 · N 人" / "N 人参与"

### 新组件

`app/javascript/components/activity-editor/CollapsibleSection.jsx`

```
Props: { title: string, summary?: string, defaultOpen?: boolean, children }
```

- Header 行：点击整行切换开关；右侧箭头 icon 旋转（`IconChevronDown` + transform）+ summary 文本（dimmed）
- Body 走 Mantine `<Collapse>`
- `defaultOpen` 只决定初始态；用户手动操作后，后续 re-render 不重置（用 `useState` 管本地 open state）
- 无受控 `open` prop（简化 API；当前三个调用点都不需要受控）

### 表单状态

`ActivityDrawer`:

```
const [participantUserIds, setParticipantUserIds] = useState(null)
// null = 默认全员（提交时不发该字段，服务端保持 "空 AP = 默认全员"）
// [1, 2, 3] = 显式名单
```

开抽屉时初始化：

- create → `null`
- edit → `activity.participant_user_ids?.length ? activity.participant_user_ids : null`

取消勾选导致一个都没剩时，保底回落到 `null`（不允许 `[]` 显式空）——语义是"没人选就走默认全员"。

### ParticipantsSection 组件（从原 ParticipantsTab 解耦）

把 `ActivityDrawer.jsx` 尾部的 `ParticipantsTab` 内部 UI 抽成 `ParticipantsSection`（或直接内联到 `CommonFields`），签名：

```
Props: { author, members, canEdit, value, onChange }
// value: null | number[]
// onChange(next: null | number[])
```

原 `PUT /activities/:id/participants` 的网络调用**移除**；改由 `ActivityDrawer#handleSave` 统一提交。

### 独立编辑 tab 的处理

`ActivityDrawer` 原来的 `<Tabs.Tab value="participants">` **移除**——基础 tab 内嵌版在 edit 模式下也覆盖。

如果用户对某些场景（比如有大量成员的行程）仍想要独立大空间编辑参与人，可后续补一个直接展开的 link；本 spec 不纳入。

### API

`app/controllers/activities_controller.rb`:

```ruby
def create
  if params[:day_id]
    day = Day.find(params[:day_id])
    tour = day.tour
  else
    tour = Tour.find(params[:tour_id])
    day = nil
  end
  head :forbidden and return unless tour.editable_by?(current_user)

  ActiveRecord::Base.transaction do
    @activity = tour.activities.create!(
      activity_params.merge(day: day, position: next_position(tour, day))
    )
    @activity.assign_participants!(params[:user_ids]) if params.key?(:user_ids)
  end

  respond_to do |format|
    format.json { render json: { id: @activity.id, position: @activity.position } }
    format.html { redirect_to @activity.tour }
  end
end

def update
  activity = Activity.find(params[:id])
  head :forbidden and return unless activity.tour.editable_by?(current_user)
  ActiveRecord::Base.transaction do
    activity.update!(activity_params)
    activity.assign_participants!(params[:user_ids]) if params.key?(:user_ids)
  end
  redirect_to activity.tour
end
```

**协议语义**（CREATE + UPDATE 一致）:

- `params.key?(:user_ids)` 决定是否触碰 APs——不传就完全不动 APs（兼容 AI 工具或其他只改 attrs 的调用方）
- 传 `user_ids: []` → 显式清空 APs → 落回"默认全员"语义
- 传 `user_ids: [1,2]` → 以此列表为准（`delete_all` + `upsert_all`）

前端 `ActivityDrawer` 每次保存都带 `user_ids`（`null` 序列化为 `[]`），CREATE 和 UPDATE 共用一套逻辑。

### 抽出共享 participant 分配逻辑

原 `ActivityParticipantsController#update` 里的锁 + 白名单 + `delete_all` + `upsert_all` 逻辑抽成 model 方法：

`app/models/activity.rb`:

```ruby
# Assign explicit participants. Pass `[]` (or nil) to clear APs (restores 默认全员
# via isFullRoster convention). See ActivityParticipantsController for concurrency
# rationale (SELECT FOR UPDATE serializes concurrent PUTs on the same activity).
def assign_participants!(requested_user_ids)
  with_lock do
    fresh_member_ids = Tour.find(tour_id).member_user_ids
    ids = Array(requested_user_ids).map(&:to_i).uniq & fresh_member_ids

    activity_participants.delete_all
    return if ids.empty?
    now = Time.current
    rows = ids.map { |uid|
      { activity_id: id, user_id: uid, created_at: now, updated_at: now }
    }
    ActivityParticipant.upsert_all(rows, unique_by: %i[activity_id user_id])
  end
end
```

- `ActivitiesController#create` 与 `#update` 都调用 `@activity.assign_participants!(params[:user_ids])`（当 `params.key?(:user_ids)`）
- `ActivityParticipantsController#update` 改为调用 `@activity.assign_participants!(params[:user_ids])` 一行
- 相同的并发安全和白名单语义——controller 间不再复制业务

### 前端 API 调用

`ActivityDrawer#handleSave` — create 与 edit 两个分支都把 `user_ids` 放进 payload：

```js
const payload = {
  activity: { ...form.values, details: cleanDetails, /* etc. */ },
  user_ids: participantUserIds ?? [], // null (默认全员) 序列化为 []
}
```

- create: `POST /tours/:id/days/:day_id/activities` 或 `POST /tours/:id/backlog_activities`
- edit: `PATCH /activities/:id`

两端均由 `ActivitiesController` 同一套 `assign_participants!` 处理，参与人修改与其他 attrs 在同一事务内落库。

### Undo

- create 的 undo 已是 `DELETE /activities/:id`；`Activity has_many :activity_participants, dependent: :destroy` 会清掉 APs，无需改
- edit 的 undo 已经 snapshot 了所有 activity attrs，但**没** snapshot 参与人。当前 edit undo 不保证参与人回滚——**已知缺口**，本 spec 不修（保持 parity；后续单独补）

## Feature 2 — 备注轻量富文本

### 编辑器 `MarkdownEditor`

`app/javascript/components/activity-editor/MarkdownEditor.jsx`

```
Props: { value: string, onChange: (next: string) => void, maxLength: number = 50_000 }
```

**UI 结构**:

```
┌─ 工具栏 (ActionIcon x 5) ──────┐
│ [B] [I] [•] [🔗] [H] │
├────────────────────────────────┤
│ <Textarea autosize              │
│   minRows={3} maxRows={30}      │
│   maxLength={50_000}            │
│   value={value} onChange=.../>  │
│                                 │
│  …                    1234/50000│
└─────────────────────────────────┘
```

- Tabler 图标：`IconBold`、`IconItalic`、`IconList`、`IconLink`、`IconHeading`
- `ActionIcon` size="sm" variant="subtle"
- 右下字符计数（超 45_000 变 `c="orange"`，超 50_000 变 `c="red"` 且按钮不阻止——服务端会拒，前端只是提示）

**文本操作**（通过原生 textarea API，不引入编辑器框架）:

- 抓 `textareaRef.current`，读 `selectionStart`/`selectionEnd`
- 用 `textarea.setRangeText(insertText, start, end, 'select')` 替换选区并维持可撤销（浏览器原生 undo stack）
- 改完立刻 `onChange(textarea.value)` 通知上层 form
- 插入规则：
  - **Bold**：`**` 包裹选区；若无选区，插入 `**粗体**` 并把 `粗体` 选中
  - **Italic**：`*` 包裹；同上
  - **List**：选区跨多行 → 每行前加 `- `；单行 → 行首加 `- `
  - **Link**：有选区 `[选区](url)`、光标落在 `url`；无选区 `[](url)`、光标落 `[` 和 `]` 之间
  - **Heading**：行首加 `### ` (H3)；已有 `### ` 切换为去除（toggle）

### 展示 `MarkdownView`

`app/javascript/components/MarkdownView.jsx`

```
Props: { source: string }
```

```jsx
<ReactMarkdown
  remarkPlugins={[remarkGfm, remarkBreaks]}
  components={{
    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
    h1: ({ children }) => <Text fw={600} size="md">{children}</Text>,
    h2: ({ children }) => <Text fw={600} size="sm">{children}</Text>,
    h3: ({ children }) => <Text fw={600} size="sm">{children}</Text>,
    p:  ({ children }) => <Text size="sm" my={2}>{children}</Text>,
    ul: ({ children }) => <Text component="ul" size="sm" my={2} pl="md">{children}</Text>,
    li: ({ children }) => <Text component="li" size="sm">{children}</Text>,
  }}
>
  {source}
</ReactMarkdown>
```

- **不用 `rehype-raw`**——任意 HTML 转义，杜绝 XSS
- `remarkGfm`：GFM 语法
- `remarkBreaks`：回车即换行，贴合中文用户习惯

### 替换位置

- `CommonFields.jsx`：原 `<Textarea label="备注">` → `<MarkdownEditor value={form.values.desc} onChange={(v) => form.setFieldValue('desc', v)} />`
- `ActivityDetailDrawer.jsx` 的 `DetailDescSection`：原 `<Text whiteSpace="pre-wrap">{activity.desc}</Text>` → `<MarkdownView source={activity.desc} />`

### 后端验证

`app/models/activity.rb`:

```ruby
DESC_MAX_BYTES = 50_000

validate :desc_size_within_limit

private

def desc_size_within_limit
  return if desc.blank?
  return if desc.bytesize <= DESC_MAX_BYTES
  errors.add(:desc, "备注过长（上限 #{DESC_MAX_BYTES} 字节）")
end
```

- 按字节数计算（与 `DETAILS_MAX_BYTES` 风格一致；中文 3 字节/字，50 KB 约可容纳 16K 汉字，充裕）
- `activity_params` 已 permit `:desc`，无需改

### 依赖

- **新增**：`remark-breaks`
- **已在**：`react-markdown`、`remark-gfm`、`rehype-raw`、`@tabler/icons-react`
- **不新增**：Tiptap / Mantine RichTextEditor / turndown / CodeMirror markdown

## 文件变更清单

### 新增
- `app/javascript/components/activity-editor/CollapsibleSection.jsx`
- `app/javascript/components/activity-editor/MarkdownEditor.jsx`
- `app/javascript/components/MarkdownView.jsx`
- 对应三份 `__tests__/*.test.jsx`

### 修改
- `app/javascript/components/activity-editor/ActivityDrawer.jsx` — 新增 `participantUserIds` 状态；删除 `participants` Tab；create/edit 都把 `user_ids` 合并进 payload（`null → []`）；移除独立 `PUT` 调用；原 `ParticipantsTab` 子组件改名为 `ParticipantsSection` 并接收 `value`/`onChange` props（不再内部调 router）
- `app/javascript/components/activity-editor/CommonFields.jsx` — 接收 `participantsProps`；把 `DetailsFields`、`ParticipantsSection` 包进 `CollapsibleSection`；备注用 `MarkdownEditor`
- `app/javascript/components/activity-editor/DetailsFields.jsx` — 删除内部 `<Title>"类型细节"</Title>`（下放到 `CollapsibleSection` header）
- `app/javascript/components/planner/ActivityDetailDrawer.jsx` — `DetailDescSection` 用 `MarkdownView`
- `app/controllers/activities_controller.rb` — `create`/`update` 接受并调用 `assign_participants!`；事务包裹
- `app/controllers/activity_participants_controller.rb` — `update` 改为一行调用 `@activity.assign_participants!(params[:user_ids])`
- `app/models/activity.rb` — 新增 `DESC_MAX_BYTES` 常量、`desc_size_within_limit` 校验、`assign_participants!` 方法
- `package.json` — 新增 `remark-breaks`

### 测试
- `spec/models/activity_spec.rb` — desc 长度校验 + `assign_participants!` 行为
- `spec/requests/activities_spec.rb`（若存在；否则建）— `POST /activities` 传 `user_ids` 路径（默认全员 / 显式名单 / 非法 user_id 被白名单过滤）；事务回滚（activity 校验失败不留 AP）
- `spec/requests/activity_participants_spec.rb` — 保持现有覆盖，确保重构后行为一致
- `ActivityDrawer.test.jsx` — collapse 行为（默认态 / summary 文本 / edit 模式下有值时展开）；create 提交带 user_ids；MarkdownEditor 工具栏替换文本
- 新 `MarkdownEditor.test.jsx` — 五个按钮各自插入正确文本；无选区 / 有选区 / 跨多行
- 新 `MarkdownView.test.jsx` — GFM 列表渲染；link 有 `target=_blank`；HTML 被转义（XSS 安全）；breaks 插件生效

## 风险与开放问题

1. **edit 模式 undo 不回滚参与人**——现状如此，本 spec 不修。后续单开 PR 补。
2. **存量 plain-text desc 里的 markdown 元字符**——用户接受"不做迁移"；若实际遇到高频误解析（如中文 `#` 话题标签），再单开补救。
3. **删除 `participants` Tab 的用户可发现性**——基础 tab 内嵌版默认折叠；edit 模式下若已设置非全员则自动展开，用户不会丢失功能入口。

## 验收 Checklist

- [ ] 新建行时在基础 tab 底部能展开参与人、勾选后保存即生效（一次 POST，单事务）
- [ ] 编辑行的基础 tab 显示正确的参与人状态，修改后保存一次生效
- [ ] 类型细节默认折叠；有已填值的 edit 场景默认展开
- [ ] 备注工具栏 5 个按钮行为正确（含无选区/有选区/跨行 list）
- [ ] 备注渲染：粗体、斜体、列表、链接（新标签页）、H3 可见；HTML 被转义
- [ ] 50 KB 超限服务端 422，前端字符计数变红
- [ ] `bin/rubocop` / `bin/brakeman` / `mise exec -- bundle exec rspec` / `npm test` 全绿
