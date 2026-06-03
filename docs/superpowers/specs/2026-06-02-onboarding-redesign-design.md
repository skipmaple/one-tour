# Onboarding 重构设计（子项目① / P0）

日期：2026-06-02
分支：claude/strange-noyce-4e5387
来源：PM 新用户视角评估的 P0（拆分为 3 子项目中的第①个）

## 背景

新用户首次创建行程时，落地即撞上一面**强制、不可关、23 条仿公文体的《本程宪法》**：规划器被半透明遮罩 `cursor:not-allowed` 锁死，宪法抽屉 ×/ESC/点外全被禁用，必须读完点「同意」才能动。在拿到任何价值前先签"合同"，是激活漏斗的反模式。

同时，接受宪法后出现**双重引导冲突**：绿 toast「旅程已启动 · 从左侧候选池加点」（让你手动加点）与 AI 面板自动开聊（4 问 onboarding）同时发生，给新人两个矛盾指令。

本子项目按已确认方向重构（不动宪法正文、不动违反显示逻辑——后者属子项目③）：

- **落地形态**：保留两步设置抽屉，但**可跳过 + 可关**（去墙）。
- **AI 主引导**：AI 主动开场作为唯一主提示，去掉冲突 toast。
- **日期摊到每天**（P1-5）：setup 填的日期范围自动写到每天。
- **唯一默认程名**：留空不再都叫「未命名旅程」。

实现取**方案 A：就地最小改**——改现有 `ConstitutionDrawer` + `Show.jsx` 的 gate 逻辑 + `Tour` 模型，复用两步抽屉。（否决 B 新建 FirstRun 组件 / C 服务端 onboarding 状态机，均过度。）

## 锁定决策

1. 落地形态：**保留两步设置但可跳过**（不新建独立组件）。
2. AI：**主动开场**（自动展开 + 发开场），删冲突 toast。
3. express 留空**不强制**任何字段。
4. 关闭语义二分：**「用推荐设置开始」= 接受默认（durable，写 `constitution_accepted`）**；**×/ESC/点外 = 稍后再说（仅写本地 `onboarded` 标记）**。两者都落 planner 并触发 AI 开场。
5. 唯一默认程名：**后端兜底**，日期式 `未命名旅程 MM-DD` + 撞同日 ` (N)` 后缀，作者维度唯一。
6. 日期范围**只摊到每天**，不联动改天数（范围→天数联动为非目标）。

## 设计

### 1. 宪法抽屉可关（去墙）

- `ConstitutionDrawer`：`canDismiss` 由 `isOnboarded(tour)` 改为**恒 `true`**。连带放开：× 按钮（当前 `{canDismiss && …}` 在第 298 行）、ESC（第 171 行 `if (!canDismiss) return`）、移动端 Drawer `closeOnEscape={canDismiss}` / `closeOnClickOutside={canDismiss}`（第 518-519 行）。
- `Show.jsx`：
  - **删除锁死遮罩**（第 531-546 行 `{inOnboarding && <div … cursor:not-allowed/>}` 整块移除）。
  - 桌面抽屉（第 489 行）`withCloseButton` / `closeOnEscape` / `closeOnClickOutside` 由 `{!inOnboarding}` 改为恒 `true`。
  - `inOnboarding`（第 393 行 `constOpen && !tour.constitution_accepted`）**保留**，仅用于抽屉标题（「设置这次旅程」vs「出行宪法」）与"是否处于两步设置流"的判断，**不再用于锁交互**。
- 结果：抽屉仍首屏自动弹（Effect A 第 349-355 行不变），但用户可随时关；planner 始终可交互。

### 2. 「用推荐设置开始」express（Step1 增次按钮）

- Step1 在「下一步 →」（第 462 行）旁加次按钮 **「用推荐设置开始」**。
- handler `startWithDefaults()`：
  1. 复用 `saveStep1` 的持久化（PATCH tour 元数据 + constitution 参数；**程名/日期均不强制**，留空交给后端兜底）。
  2. 执行 day 批量创建 + 日期摊（见 §4）。
  3. **直接 POST `/tours/:id/constitution/accept`**（跳过 Step2 阅读，等价于接受默认）→ 写 `constitution_accepted=true`（durable）。
  4. 写本地 `onboarded` 标记，关抽屉，触发 AI 开场（见 §3）。
- 与「下一步」的区别：「下一步」进 Step2 阅读后再 accept；express 一键跳过阅读。两者最终都 accept。

### 3. 关闭语义 + AI 主动开场（解双重冲突）

- **两种离开方式**：
  - 「用推荐设置开始」/「同意并开始规划」→ accept（写 `constitution_accepted`，跨设备持久）。
  - ×/ESC/点外 → **skip**：只写本地 `localStorage['onboarded:tour:<id>']='1'`（不写服务端 accepted），日后可从 header「宪法」按钮正式设置。
- **AI 开场触发改为"首次离开 onboarding 抽屉时"**：accept / express / skip 任一路径关闭抽屉后，若 `canEdit && 空行程 && 空对话`，`setPendingChatPrompt(ONBOARDING_SENTINEL)`。
  - 用 `aiOnboardingStartedRef` 防重复（每次页面加载至多触发一次）。
  - 保留 mount 时的触发（第 337-344 行）以覆盖"此前已 onboarded、刷新空行程"场景，但与关闭触发共用同一 ref 守卫，避免双发。
- **删除冲突 toast**：`ConstitutionDrawer` 第 249 行 `'旅程已启动 · 从左侧候选池加点'` **整条移除、不加替代**（AI 主动开场 + 解锁的 planner 已是足够反馈；不再给与 AI 并行的"手动加点"指令）。

### 4. 日期摊到每天（P1-5）

- `saveStep1` 与 `startWithDefaults` 中，在确保 N 天存在后：**若 `dateRange` 有起点**，对每一天（现有 + 新建）PATCH `date = 起点 +（day_index - 1）天`，按 `day_index` 升序。
- 计算用纯日期加法（`new Date(start); d.setDate(d.getDate()+i)` 或既有 date 工具），格式化为 `YYYY-MM-DD`。
- **不联动天数**：`天数` 字段仍独立；若 `天数` 与范围长度不一致，超出的天按 `起点+offset` 继续顺延（用户的不一致由用户负责）。
- 日期工具若已存在于 `tourSetupHelpers.js` 则复用；否则在该文件加一个纯函数 `dayDatesFromRange(startISO, count)` 便于单测。

### 5. 唯一默认程名（后端兜底）

- `app/models/tour.rb` 加：
  ```ruby
  before_validation :assign_default_title, if: -> { title.blank? }

  def assign_default_title
    d = (created_at || Time.current).to_date
    base = "未命名旅程 #{d.strftime('%m-%d')}"
    taken = author.tours.where.not(id: id)
                  .where("title LIKE ?", "#{base}%").pluck(:title)
    self.title =
      if taken.exclude?(base)
        base
      else
        n = 2
        n += 1 while taken.include?("#{base} (#{n})")
        "#{base} (#{n})"
      end
  end
  ```
  - 作者维度唯一；删除留空隙安全（取首个未占用，从 base→`(2)`→`(3)`…）。
  - 覆盖建程时（`+新建旅程` 那次空 title）、express 留空、下一步留空、skip 未填——任何路径持久化的 title 都非空且唯一。
  - `created_at` 在 create 前为 nil → 用 `Time.current.to_date`（= 创建当日）；update 时用既有 `created_at`，日期反映创建日。
- 前端：抽屉程名输入框预填当前 title（建程已赋「未命名旅程 06-02」），**可直接改**。`Show.jsx` 等处的 `title || '未命名旅程'` 显示兜底退化为防御性（正常 title 永不为空）。

## 涉及文件

- `app/models/tour.rb` — `assign_default_title`（§5）。
- `app/javascript/components/planner/ConstitutionDrawer.jsx` — `canDismiss` 恒真；「用推荐设置开始」按钮 + `startWithDefaults`；日期摊（§4）；删 toast（§3）。
- `app/javascript/pages/Tour/Show.jsx` — 删锁死遮罩；抽屉恒可关；AI 触发移到关闭时 + ref 守卫；skip 写本地标记。
- `app/javascript/components/planner/tourSetupHelpers.js` —（如需）`dayDatesFromRange` 纯函数。

## 测试

- `spec/models/tour_spec.rb`：空 title → `未命名旅程 MM-DD`；同作者同日第二个空 → ` (2)`；删 `(2)` 再建 → 取首个空位；填了 title 不被覆盖；不同作者互不影响。
- `ConstitutionDrawer.test.jsx`：× / ESC / 点外可关（canDismiss）；「用推荐设置开始」触发 accept + 关闭；填了日期范围时按天 PATCH date（mock 网络，断言每天 date）；accept 成功不再出现「从左侧候选池加点」文案。
- `Show.test.jsx`：无 `onboarding-backdrop` 锁死元素（或其不再 `cursor:not-allowed`）；首次关闭抽屉后在空行程+空对话下触发 `ONBOARDING_SENTINEL`；重复关闭不重复触发（ref 守卫）。
- `dayDatesFromRange` 纯函数单测（若新增）。

## 边界与非目标

- 不改《本程宪法》正文，不改宪法参数本身。
- 不改违反（软/硬提示）显示逻辑——空行程的「机动日」误报属**子项目③**。
- 不做"日期范围→天数"联动。
- 不改 AI onboarding 对话脚本（`ChatStreamJob`/sentinel 行为）本身，只改"何时触发"。
- 读者（reader）权限维持现状（不被 onboarding 拦）。
