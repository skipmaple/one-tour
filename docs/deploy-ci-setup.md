# Deploy CI 一次性配置

`.github/workflows/deploy.yml` 的 secrets / environments / SSH 配置 runbook。
做完之后:**push 到 `main` 自动部署 staging,staging 成功后 GitHub UI 卡门
等你点 Approve 才进 prod**。

## 1. SSH key

CI runner 需要 ssh into Vultr(staging,45.63.23.136)+ 阿里云(prod,
43.103.50.22)。生成专属 deploy key:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/onetour_deploy -N ''

# 公钥追加到两台 host root authorized_keys
cat ~/.ssh/onetour_deploy.pub | ssh root@45.63.23.136 'cat >> ~/.ssh/authorized_keys'
cat ~/.ssh/onetour_deploy.pub | ssh root@43.103.50.22 'cat >> ~/.ssh/authorized_keys'

# known_hosts 抓一下,后面要填进 GH secret
ssh-keyscan 45.63.23.136
ssh-keyscan 43.103.50.22
```

## 2. GitHub Repo Secrets(staging + prod 共用)

GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|---|---|
| `DEPLOY_SSH_PRIVATE_KEY` | 上面 `~/.ssh/onetour_deploy` 私钥**整个文件内容** |
| `RAILS_MASTER_KEY` | `cat config/master.key` 输出 |

## 3. GitHub Environments

GitHub repo → Settings → Environments → New environment

### 3a. `staging` environment

不开 Required reviewers(merge 即自动跑)。

**Environment secrets**:

| Secret | Value |
|---|---|
| `STAGING_ENV_FILE` | `cat .env.staging` 全文(2 行:`ONE_TOUR_DATABASE_PASSWORD=...` + `STAGING_LOGIN_SECRET=...`) |
| `PROD_ENV_FILE` | `cat .env.production` 全文(.kamal/staging/secrets 读 AMAP key 等共享值要从这文件 grep) |
| `STAGING_KNOWN_HOSTS` | `ssh-keyscan 45.63.23.136` 输出 |

### 3b. `production` environment

**Required reviewers**: 把你自己加进去 ← 这是 prod 卡门。

**Optional**:
- Wait timer = 0(立即触发审批,无强制等待)
- Deployment branches → Protected branches only(只允许 main)

**Environment secrets**:

| Secret | Value |
|---|---|
| `PROD_ENV_FILE` | `cat .env.production` 全文 |
| `PROD_KNOWN_HOSTS` | `ssh-keyscan 43.103.50.22` 输出 |

## 4. 用 gh CLI 一次性导入(替代手动 GH UI 点)

```bash
# repo-level
gh secret set DEPLOY_SSH_PRIVATE_KEY < ~/.ssh/onetour_deploy
gh secret set RAILS_MASTER_KEY < config/master.key

# staging environment
gh secret set STAGING_ENV_FILE --env staging < .env.staging
gh secret set PROD_ENV_FILE --env staging < .env.production
ssh-keyscan 45.63.23.136 | gh secret set STAGING_KNOWN_HOSTS --env staging

# production environment
gh secret set PROD_ENV_FILE --env production < .env.production
ssh-keyscan 43.103.50.22 | gh secret set PROD_KNOWN_HOSTS --env production
```

(`gh secret set --env <name>` 要求该 environment 已在 repo Settings 里创建过。
"Required reviewers" 必须在 GH UI 里设,gh CLI 不暴露。)

## 5. 验证一次

```bash
# 任一 no-op commit 推 main 触发(或 Actions tab → Deploy → Run workflow)
git commit --allow-empty -m "ci: trigger deploy"
git push origin main

# 在 Actions tab 看:
# 1. deploy-staging 跑(~5-10 min)
# 2. 成功后 deploy-production 显示 "Waiting for review"
# 3. 点 "Review deployments" → 选 production → "Approve and deploy"
# 4. deploy-production 跑(~5-10 min)
```

后续每次 merge to main 自动重复这流程。

## 6. 跟本地 `kamal deploy` 共存

CI 接管之后本地仍能 `bin/kamal deploy` / `scripts/kamal-staging.sh deploy`
(应急直发用)。两套独立 — CI 用 GH secrets,本地用 `.env.{production,staging}`。
