# 新建程体验优化 — 设计文档

> **背景**：以新用户视角完整手动建程后发现两大痛点：Day 管理太原始（需 20+ 次重复点击）、新建行表单信息过载且搜索地点入口不突出。

---

## 模块一：Day 批量创建

### 问题

- 新建程后只有 D1，用户需要逐个点 "+ D{n}" 按钮创建 D2-D7（6 次点击 + 6 次 HTTP 请求）
- 所有 Day 无日期（显示 "—"），用户需逐个进 DayEditModal 手动设日期（7 次操作）
- 无主题，骨架搭完才能开始填内容

### 方案

#### 1. Step 1 加"天数"字段

在宪法 Step 1 的"日期范围"旁边加 `天数` NumberInput：

```
日期范围                    人数        天数
[2026年8月1日-7日]         [3]         [7]
```

- 字段名：`tourDays`
- 默认值：1（当前已有的 D1）
- 范围：1-30
- 位置：与日期范围、人数同一行（`<Group grow>` 三列）

#### 2. proceedToReview 时批量建 Day

在 `proceedToReview` 函数中，保存程元数据和宪法参数后，批量创建 Day：

```
const currentDayCount = (已有的 Day 数，从 tour props 获取或通过 API)
const targetDayCount = tourDays

if (targetDayCount > currentDayCount) {
  for (let i = currentDayCount + 1; i <= targetDayCount; i++) {
    POST /tours/:id/days  { day: { day_index: i } }
  }
}
```

**日期分配**：如果用户填了日期范围且格式可解析（YYYY-MM-DD 或 YYYY年M月D日），按 day_index 逐日分配。否则留空。

具体实现：
- 后端新增 `POST /tours/:id/days/batch` 接口，接受 `{ count: N, start_date: "2026-08-01" }` 参数，一次性创建多个 Day 并分配日期。避免前端循环发 N 个请求。
- 或者：前端循环 POST 也行（简单，Day 数 ≤ 30 不会有性能问题），但需要 `await` 全部完成后再进入 Step 2。

**选择：前端循环 POST**（简单，无需后端新接口）。

#### 3. 不做的

- 不从日期范围字符串智能解析（格式太多样化：`6月10-19日`、`2026.6.10-6.19`、`6/10~6/19`…）。用户填天数即可。
- 不自动生成 Day 主题（留给 AI 助手或用户手动填）。
- 不处理"天数减少"的情况（用户不会在 Step 1 减天数，Step 1 只增）。

---

## 模块二：新建行 Drawer 重构

### 问题

- 搜索地点藏在 12+ 个字段中间，新用户找不到
- 经纬度手动输入暴露给用户，99% 的人不知道坐标
- 表单字段一次性全部展示，信息过载

### 方案

#### 1. Drawer 布局重构为两段式

**第一段：地点定位（始终展示，最醒目）**

```
┌─────────────────────────────────┐
│  搜索地点                         │
│  [🔍 输入地名搜索...]             │  ← 最顶部，Combobox
│    → 稻城亚丁风景区  四川甘孜       │
│    → 稻城亚丁机场    四川甘孜       │
│                                   │
│  名称 *   [稻城亚丁风景区]         │  ← 搜索选中后自动填充，可手动改
│  位置     📍 29.03, 100.30        │  ← 只读，有坐标时显示；无坐标时不显示
│                                   │
│  类型 [景点 ▾]                    │
│  等级 ○一等(核心) ○二等(配角)      │
│       ●三等(可删) ○基础设施(自动)  │
│                                   │
│  开始时间 [10:00]  时长 [480] 分钟 │
├─────────────────────────────────┤
│  ▾ 更多设置                       │  ← 折叠区域
│  ┌ 描述  [                  ]    │
│  │ 贴士  [                  ]    │
│  │ 类型细节（最佳光线/海拔/…）     │
│  └                               │
└─────────────────────────────────┘
│           [保存]  [取消]           │
│  编辑模式：[移回候选池]  [删除]     │
```

#### 2. 文件改动

**`CommonFields.jsx` 重构：**

将字段分为两组：

```jsx
// 核心字段（始终展示）
<Stack gap="sm">
  <PoiSearchCombobox onPick={onPoiPick} />          {/* 搜到顶部 */}
  <TextInput label="名称" required ... />
  {(lat || lng) && (                                  {/* 有坐标才显示，只读 */}
    <Text size="xs" c="dimmed">📍 {lat}, {lng}</Text>
  )}
  <Group grow>
    <Select label="类型" ... />
  </Group>
  <Radio.Group label="公民等级" ... />
  <Group grow>
    <TextInput label="开始时间" ... />
    <TextInput label="时长 (分钟)" ... />
  </Group>
</Stack>

// 折叠字段
<Collapse in={moreOpen}>
  <Textarea label="描述" ... />
  <Textarea label="贴士" ... />
  <DetailsFields ... />
</Collapse>
<Button variant="subtle" onClick={toggle}>
  {moreOpen ? '▴ 收起' : '▾ 更多设置'}
</Button>
```

**`ActivityDrawer.jsx` 改动：**

- `PoiSearchCombobox` 从 ActivityDrawer 移到 CommonFields 内部（或通过 prop 传入）
- `handlePoiPick` 逻辑不变：填充 name、lat、lng
- 移除 CommonFields 中的 `纬度`/`经度` TextInput（改为只读 Text 展示）

**`PoiSearchCombobox.jsx` 改动：**

- 无结构改动，仅 label 从 "搜索地点" 改为更醒目的样式（可加 placeholder 提示）

#### 3. 经纬度处理

- 经纬度字段从 `<TextInput type="number">` 改为 **只读展示**
- form 的 `lat` / `lng` 仍然存在（隐藏字段），由 `handlePoiPick` 填充
- 显示格式：`📍 29.03, 100.30`（有值时显示，无值时不显示任何内容）
- 编辑模式下如果已有坐标，也只读展示

#### 4. 折叠区域

使用 React state `moreOpen` 控制折叠：

```jsx
const [moreOpen, setMoreOpen] = useState(false)
```

折叠内容包括：
- 描述（Textarea）
- 贴士（Textarea）
- 类型细节（DetailsFields 组件 — 根据 kind 动态渲染）

#### 5. 不做的

- 不改 `handlePoiPick` 的填充逻辑（已经 work：填充 name + lat + lng）
- 不根据 POI 类型自动推测"行的类型"（高德返回的 type 分类和我们的 kind 不匹配）
- 不改 PoiSearchCombobox 的搜索逻辑（已有 debounce + 高德 API 调用）

---

## 涉及文件

**模块一（Day 批量创建）：**
- 修改：`app/javascript/pages/Tour/Constitution.jsx` — 加天数字段 + proceedToReview 循环建 Day
- 修改：`app/javascript/pages/Tour/__tests__/Constitution.test.jsx` — 加天数字段测试

**模块二（Drawer 重构）：**
- 修改：`app/javascript/components/activity-editor/CommonFields.jsx` — 重构布局（搜索到顶部、经纬度只读、折叠区）
- 修改：`app/javascript/components/activity-editor/ActivityDrawer.jsx` — PoiSearch 传递方式调整
- 修改：`app/javascript/components/activity-editor/__tests__/ActivityDrawer.test.jsx` — 适配新布局

**不改：**
- `PoiSearchCombobox.jsx` — 组件本身无需改动
- 后端 — 无需新接口

---

## 验收标准

### 模块一
1. Step 1 表单有"天数"字段，默认 1，可改为 1-30
2. 用户设天数为 7 → 点下一步 → 进入规划页后看到 D1-D7
3. 每个 Day 有正确的 day_index
4. 现有程（已有 Day）不受影响

### 模块二
1. 新建行 Drawer 打开时，搜索地点是第一个字段
2. 搜索"稻城亚丁" → 选中 → 名称自动填充，经纬度自动填充
3. 经纬度不以 input 形式暴露，而是 "📍 29.03, 100.30" 只读文本
4. "描述""贴士""类型细节"在"更多设置"折叠区内
5. 现有编辑模式不受影响（打开已有行时所有字段正确填充）
