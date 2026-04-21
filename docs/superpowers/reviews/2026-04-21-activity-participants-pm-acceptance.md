# 产品验收报告：Activity 参与人功能

**验收人**: 资深产品经理 subagent
**验收日期**: 2026-04-21
**实现版本**: HEAD `afb7d36` (post Task 12, pre fix commit)
**环境**: `http://localhost:9104` (bin/worktree-dev up)

## 1. TL;DR

**放行有条件。** 功能核心逻辑通顺（默认全员、减人、卡片头像组、账单预填），整体方向正确。但有 **1 个阻断级 bug**（参与人头像在卡片上被 `overflow:hidden` 裁剪，完全不可见），**1 个重要级后端 bug**（重复 user_id 时 `create!` 抛 500 没有降级），以及若干体验打磨点。先修这两项再上线。

---

## 2. 总体印象

**"默认全员 + 减人"的设计选得正确。** 旅行场景的基准假设是"所有人都参与"，若要走"默认无人 + 加人"，编辑需要为每个活动主动点选成员，认知负担高且容易遗漏。当前设计把阻力放在"排除某人"这个少见操作上，符合心理模型。Alert 文案"默认全员参与。取消勾选某人即切换为…"清晰地传达了这个模型——是到位的。

---

## 3. 发现（按严重程度）

### 🔴 阻断

**发现 1：活动卡片上参与人头像组完全不可见（overflow:hidden 裁剪）**

- **现象**：`.ac-card` 设置了 `height: 60px; overflow: hidden`。Avatar.Group 渲染在 `MetaGrid` 之后，顶部恰好落在 `cardBottom=337.59px`，而卡片底部也是 `337.59px`，导致 avatars 被完全裁掉。截图 e2e-pm-8.png 显示卡片外观与"没有参与人限制"时完全相同。
- **复现**：Alice 登录 → Test Lake → 参与人 tab → 取消勾选 Bob → 保存 → 回到日程视图，卡片上无任何 avatar 显示（无论 1 人或 3 人）。
- **影响**：所有参与了部分人的活动，卡片无法传达"这个活动只有部分人参与"的信息，核心信息点完全丢失。
- **建议**：`.ac-card` 高度改为 `min-height: 60px`（去掉固定高 height），让 Avatar.Group 出现时卡片自然撑高。或者在 MetaGrid 内为 avatar 预留固定行高（如 `height: 76px` 时有参与人）。

截图：e2e-pm-8.png（卡片无头像），e2e-pm-7b.png（卡片截图本身也看不到）。

> **已修（commit `7605649`）**：迁出 `.ac-body`，`position: absolute; bottom: 6px; right: 8px`，has-thumb 时 `right: 60px` 让位封面图。保留卡片 60px 高。

---

### 🟡 重要

**发现 2：ActivityParticipantsController#update 在重复 user_id 时返回 500 Rails 错误页**

- **现象**：控制器做 `destroy_all` 后逐条 `create!`，若前端同时提交含重复 ID 的请求，Rails 抛出 `ActiveRecord::RecordInvalid: Validation failed: User has already been taken`，直接渲染了 Rails 错误页而不是产品化错误提示。截图 e2e-pm-19.png。
- **复现**：在参与人 tab 中，JS 批量触发 checkbox onChange 事件导致多次并发 PUT 请求，或边界情况下重复提交同一 user_id。
- **影响**：虽然正常用户操作很难触发，但若发生则看到裸 500 页面，非常不友好。
- **建议**：控制器改用 `find_or_create_by`（去重），或前端在保存前去重 user_ids；同时将 controller 异常降级为 422 + JSON 错误提示。

> **已修（commit `7605649`）**：`create!` → `find_or_create_by!`，并发写入幂等，不会再撞 unique index。

---

**发现 3：切换到"参与人"tab 后，关闭 drawer 再重开，默认回到"基础"tab**

- **现象**：每次打开活动编辑器均从"基础"tab 开始，不记忆上次激活的 tab。
- **影响**：如果用户连续编辑多个活动的参与人，每次都需要手动切到第 4 个 tab，操作路径无谓加长。
- **建议**：Drawer 内 tab 状态维持在 React state（在 drawer 单次打开生命周期内保留，跨次可以不记忆）；或者在参与人有非默认值时，以 drawer 打开状态为"参与人"tab（类似 deep link 到具体 tab）。

*未修——follow-up candidate。*

---

**发现 4：部分选中状态时，Alert 提示文案消失**

- **现象**：当 3 人全选时有 Alert（蓝色）说"默认全员参与…"。但一旦取消任何一人的勾选，Alert 立即消失（截图 e2e-pm-4.png），仅显示 checkbox 列表，没有任何提示说明当前处于"仅限部分成员"模式。
- **影响**：用户在部分选中时不知道"这里的勾选就是最终分账的人"，可能误以为是暂存草稿；也没有"如何恢复全员"的提示。
- **建议**：部分选中时 Alert 改为"仅以下成员参与此活动。全部勾选即恢复全员模式。"（状态指示 + 恢复路径同时给出）。

*未修——follow-up candidate。*

---

**发现 5：8 个成员使用相同英文首字母时头像组无法区分**

- **现象**：Extra1~Extra5 均显示"E"初始字母头像。在 3 人 Avatar.Group 上可能显示 3 个相同的"E"，完全无法辨别是谁。
- **影响**：行程成员使用相近名字（例如 Extra/Elizabeth/Elena）时，卡片头像组失去信息价值。
- **建议**：Tooltip 悬浮显名（代码中已有 `<Tooltip label={u.name}>`），确保 hover 可辨别；另考虑 avatar 底色按 user_id hash 区分，即使首字母相同也能视觉区分。

*未修——follow-up candidate。*

---

### 🟢 建议

**发现 6：参与人 tab 位于最后，可发现性低**

- **现象**：4 个 tab 顺序为"基础 / 图片 / 路线 / 参与人"，参与人是最后一个，且没有角标/红点提示"已定制"。
- **建议**：当活动存在非默认参与人时，tab 标签旁加小圆点或数字角标（如"参与人 2"）。这样作者无需打开 tab 就能知道哪些活动是定制人员的。

**发现 7：Reader（只读）权限对自身定位不透明**

- **现象**：Cindy（reader）看到活动卡片，但不可点击，无任何提示说明"你是只读权限"。
- **建议**：hover 时显示 tooltip "你是只读成员，无法编辑活动"；或者 reader 可以点开只读的 drawer 查看参与人（包括自己是否在参与人列表中），只是保存按钮禁用。

**发现 8：取消拖拽误触时 drawer 无法用常规方式打开（编辑者的操作体验）**

- **现象**：编辑者（Bob）的卡片是 `<div role="button">` 包在 DnD 层，Playwright 的标准 click() 无法触发 drawer 打开，需要先 pointerdown+pointerup+click 才能激活（模拟真实手势）。
- **影响**：DnD 与点击的事件边界可能在某些触摸设备或快速点击时出现 misfire（拖拽被识别为点击，或点击被当作拖拽开始）。
- **建议**：测试 DnD 激活阈值，确保 ≤5px 移动量视为点击，不触发拖拽模式。

**发现 9：账单预填场景覆盖正确，但新建 vs 编辑 expense 未验证**

- **现象**：新建 expense 时"选哪几个人平分"正确按活动参与人预填（Alice+Cindy，不含 Bob）。截图 e2e-pm-17.png 验证了这点。但已有 expense 的编辑模式没有验证不会被错误重置。
- **建议**：dev 需补一个 spec：编辑已有 expense 时，分账人不应被活动参与人覆盖。

---

## 4. 通过的项

- **零人防护**：取消最后一个勾选时，系统自动恢复全员状态（所有人重新勾上，Alert 恢复）。不可能保存"0 人参与"状态。✓
- **状态持久化**：关闭 drawer 再重开，参与人勾选状态正确保留（Alice ✓, Cindy ✓, Bob ✗）。✓
- **卡片 aria 树一致性**：accessibility snapshot 中 button 的 name 包含参与人首字母（"Test Lake A C"），screen reader 可感知。✓
- **移动端可用性**：375px 宽度下 drawer 全屏渲染，参与人 tab 可访问，checkbox 可操作。截图 e2e-pm-15.png。✓
- **账单预填正确性**：活动设置 Alice+Cindy 后，新建 expense 预填"选谁平分"与之一致。✓
- **Editor 权限正确**：Bob（editor）可打开活动 drawer，可修改参与人，可保存。✓
- **Alert 文案**：全选时 Alert "默认全员参与。取消勾选某人即切换为…"语义准确。✓
- **作者标签**：候选人列表中 Alice 显示"（作者）"标签，成员不显示，信息对称合理。✓
- **8 人列表不溢出**：8 个成员的 checkbox 列表在 drawer 内完整显示，不需要滚动。✓
- **头像 +N 折叠**：代码中 `participantUsers.slice(0, 3)` + `+N` 逻辑正确（实际渲染受 overflow:hidden 遮蔽，逻辑本身无误）。✓

---

## 5. 还原状态

**DB 修改内容：**
1. 创建了 5 个临时用户（extra1~extra5@e2e.test）并添加为 tour 1 的 reader —— **已删除**。
2. 在验收过程中将 Activity 1 的参与人设为 Alice+Cindy —— **已通过 SQL `ActivityParticipant.where(activity_id: 1).destroy_all` 还原为空（全员默认）**。
3. 验收结束时 DB 状态：用户 3 人（Alice/Bob/Cindy），tour 1 memberships 2 条（Bob=editor, Cindy=reader），Activity 1 participants 为空（= 全员默认）。与验收前一致。

**截图文件（均在工作目录下）：**
e2e-pm-1.png 到 e2e-pm-21.png（共 21 张，含 e2e-pm-7b.png）。

---

## 修复追踪

| 发现 | 严重度 | 处理 |
|---|---|---|
| 1. Avatar overflow 裁剪 | 🔴 | ✅ 已修 (commit `7605649`) |
| 2. Controller 并发 500 | 🟡 | ✅ 已修 (commit `7605649`) |
| 3. Tab 不记忆 | 🟡 | follow-up |
| 4. 部分选中无 Alert | 🟡 | follow-up |
| 5. 同首字母头像无区分 | 🟡 | follow-up |
| 6. Tab 发现性角标 | 🟢 | follow-up |
| 7. Reader tooltip | 🟢 | follow-up |
| 8. DnD 点击边界 | 🟢 | follow-up（超出本功能范围，另审） |
| 9. 编辑 expense 预填 spec | 🟢 | follow-up（补 spec） |
