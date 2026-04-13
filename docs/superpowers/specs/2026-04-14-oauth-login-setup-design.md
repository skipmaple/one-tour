# OAuth 四种登录方式配置

## Context

代码侧已完全就绪（omniauth gem、initializer、env var 占位符、UI 按钮全部实现）。  
这是一个纯平台注册 + 凭据管理任务，无需改动任何代码。

**生产域名**：`tour.skipmaple.com`

---

## 方案：C — 实用分离

| Provider | 策略 | 原因 |
|---|---|---|
| GitHub | dev app + prod app（各一个） | GitHub OAuth App 每个只允许一个 callback URL |
| Google | 一个 app，两个 redirect URI | Google 支持多 URI，一套凭据两个环境共用 |
| Feishu | 一个 app，两个 redirect URI | 同上 |
| WeChat | 一个 app，仅生产域名 | 需要公开 HTTPS 域名；本地用 Developer Login |

---

## Provider 注册细节

### GitHub

**入口**：`https://github.com/settings/applications/new`

创建两个 OAuth App：

| 字段 | Dev App | Prod App |
|---|---|---|
| Application name | `Tour Xinjiang (dev)` | `Tour Xinjiang` |
| Homepage URL | `http://localhost:3000` | `https://tour.skipmaple.com` |
| Authorization callback URL | `http://localhost:3000/auth/github/callback` | `https://tour.skipmaple.com/auth/github/callback` |

---

### Google

**入口**：`https://console.cloud.google.com`

1. 创建 Project
2. APIs & Services → OAuth consent screen → External
   - 添加 scope：`email`、`profile`
   - 添加自己为 Test user
   - 保持 "Testing" 状态（个人项目无需提交 Google 审核）
3. Credentials → Create OAuth 2.0 Client ID → Web application
4. Authorized redirect URIs：
   - `http://localhost:3000/auth/google_oauth2/callback`
   - `https://tour.skipmaple.com/auth/google_oauth2/callback`

---

### Feishu（飞书）

**入口**：`https://open.feishu.cn/app`

1. 创建自建应用
2. 安全设置 → 重定向 URL：
   - `http://localhost:3000/auth/feishu/callback`
   - `https://tour.skipmaple.com/auth/feishu/callback`
3. 权限管理 → 开启：
   - `contact:user.base`
   - `contact:user.email:readonly`
4. 版本管理 → 创建版本 → 申请发布（必须发布才能使用 OAuth）

---

### WeChat（微信开放平台）

**入口**：`https://open.weixin.qq.com`

1. 注册个人开发者账号（实名认证：身份证 + 手机号）
2. 管理中心 → 网站应用 → 创建网站应用
3. 授权回调域：`tour.skipmaple.com`
4. 提交审核（约 1-7 个工作日）

> 本地开发：WeChat 留空，按钮点击报错属于预期行为。

---

## 环境变量

### 本地 `.env`

```bash
# GitHub — dev app 凭据
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# Google — 两个环境共用
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Feishu — 两个环境共用
FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx

# WeChat — 本地留空
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

### 生产 `.env`（`kamal env push` 推送）

```bash
# GitHub — prod app 凭据（不同于 dev）
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# Google / Feishu — 同 dev
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx

# WeChat — 填入生产凭据
WECHAT_APP_ID=xxx
WECHAT_APP_SECRET=xxx
```

---

## 验证

### 本地（GitHub + Google + Feishu）

1. `bin/dev` 启动
2. 访问 `http://localhost:3000/login`
3. 依次点击 GitHub / Google / Feishu → OAuth 授权 → 跳回首页，显示用户名
4. WeChat 按钮 → 报错（预期）
5. Developer Login → 正常

### 生产（部署后，全部 4 个）

1. 访问 `https://tour.skipmaple.com/login`
2. 依次测试 4 个按钮
3. 用两个 provider 登录同一邮箱 → 确认合并为同一 User（`oauth_identities` 有两条记录，同一 `user_id`）
