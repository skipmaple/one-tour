# Phase 2 切换日:Vultr → SWAS 总迁移

一次性切换 4 个维度:**服务器位置 + 数据库 + 存储 + DNS**。

参见 [xinjiang-trip-architecture.md](xinjiang-trip-architecture.md) 路线图;前置见 [r2-to-oss-migration.md](r2-to-oss-migration.md) 与 [backup-restore.md](backup-restore.md)。

## TL;DR

| 维度 | 从 | 到 |
|---|---|---|
| 服务器 | Vultr NJ (45.63.23.136) | SWAS HK (43.103.50.22) |
| 数据库 | Vultr 上 Postgres accessory | SWAS 上 Postgres accessory(数据从最新 backup 恢复) |
| 存储 | Cloudflare R2(redirect 模式) | 阿里云 OSS HK(**proxy 模式 + 内网 endpoint**,见"已知陷阱") |
| DNS | tour.skipmaple.com → Vultr IP | tour.skipmaple.com → SWAS IP |

**净停机时间** 5–10 分钟。**回滚窗口** 切换后 30 分钟内可一键回。**用户感知** 5 人小队基本无感(挑深夜窗口)。

## 前置(切换日前 24 小时)

### 1. 降低 DNS TTL

切换日前一天,Cloudflare DNS:
- `tour.skipmaple.com` 的 TTL 从 Auto 改为 **60s** 或 **120s**
- 这样切换日 DNS 缓存最多 60s 就刷新

### 2. 通知 5 人窗口期

微信群通知:"今晚 X 点–X+30 点系统升级,期间 App 可能短暂不可访问"。

### 3. 提前确认 SSL 证书会自动签

Phase 1 已经验证:Kamal 2 + Let's Encrypt 在 SWAS 上自动签 `onetour.skipmaple.com`。切换日 `tour.skipmaple.com` 的证书会同样自动签——**前提是 DNS 已经切到 SWAS IP**(顺序!)。

### 4. Vultr 上跑一次完整 backup,确认 OSS 上有最新数据

```sh
ssh root@45.63.23.136 /usr/local/bin/backup-postgres
```

确认 OSS `one-tour-backups/postgres/<今天>/...dump` 存在。

## 切换日步骤(执行顺序很关键)

### 阶段 A:停 prod,锁数据(2 分钟)

```sh
# 1. 停 Vultr 应用容器(用户开始看到 502 / connection refused)
bin/kamal app stop  # 默认 destination = Vultr

# 2. Vultr 上跑最后一次 backup(此时 prod 已停,DB 数据已 frozen)
ssh root@45.63.23.136 /usr/local/bin/backup-postgres
```

记下输出里的 dump 文件路径:`postgres/YYYY/MM/DD/one_tour_production-XXXXX.dump`。

### 阶段 B:数据搬到 SWAS(3 分钟)

```sh
# 3. SWAS 上拉这个 backup,恢复进 Postgres accessory
ssh root@43.103.50.22 '
  source /etc/one-tour-backup.env
  export AWS_ACCESS_KEY_ID="$OSS_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$OSS_ACCESS_KEY_SECRET"
  export AWS_DEFAULT_REGION=cn-hongkong

  LATEST_KEY=$(aws s3api list-objects-v2 \
    --bucket one-tour-backups --prefix postgres/ \
    --endpoint-url $OSS_ENDPOINT \
    --query "reverse(sort_by(Contents, &LastModified))[0].Key" \
    --output text)
  echo "Restoring from: $LATEST_KEY"

  aws s3 cp "s3://one-tour-backups/$LATEST_KEY" /tmp/restore.dump \
    --endpoint-url $OSS_ENDPOINT

  docker cp /tmp/restore.dump one-tour-db:/tmp/restore.dump
  docker exec one-tour-db pg_restore \
    --username=one_tour --clean --if-exists --no-owner \
    --dbname=one_tour_production /tmp/restore.dump

  rm /tmp/restore.dump

  # 抽样校验
  docker exec one-tour-db psql -U one_tour -d one_tour_production -c "
    SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM tours) AS tours,
      (SELECT count(*) FROM activities) AS activities;
  "
'
```

预期 SELECT 输出与切换前 Vultr 一致(比如 `9 / 5 / 137`)。

### 阶段 C:存储 catch-up(1 分钟)

```sh
# 4. SWAS 上跑 R2 → OSS 增量 sync(此时 R2 已无写入,catch up 应该极快)
ssh root@43.103.50.22 '
  rclone copy r2-source:one-tour-storage oss-dest:one-tour-assets \
    --update --progress
'

# 5. 校验
ssh root@43.103.50.22 '
  rclone check r2-source:one-tour-storage oss-dest:one-tour-assets --size-only
'
```

期望 `0 differences found`。

### 阶段 D:DB UPDATE service_name(1 分钟)

通过 staging destination(目前唯一在 SWAS 上跑的应用)执行 rake:

```sh
# 6. dry run(确认数量)
bin/kamal app exec -d staging --reuse \
  "bin/rails storage:migrate_service_name FROM=cloudflare TO=aliyun_oss"
# 看 matched: 11 rows(或当前实际 blob 数)

# 7. APPLY
bin/kamal app exec -d staging --reuse \
  "bin/rails storage:migrate_service_name FROM=cloudflare TO=aliyun_oss APPLY=1"
# 看 ✔ Updated 11 rows
```

### 阶段 E:代码改动 + 推送(2 分钟)

本地编辑这几处文件。**前两处是必须的核心切换**,后两处是踩过坑总结的最佳实践(见"已知陷阱"章节):

**a) `config/environments/production.rb` Active Storage**

```diff
- # Store uploaded files on Cloudflare R2 (see config/storage.yml).
- config.active_storage.service = :cloudflare
+ # Store uploaded files on Aliyun OSS HK (see config/storage.yml).
+ config.active_storage.service = :aliyun_oss
+
+ # Proxy mode: blob fetch goes server-side, browsers never see OSS URLs.
+ # Required because OSS SigV4 doesn't correctly validate AWS-style presigned
+ # URLs that include `response-content-disposition`/`response-content-type`
+ # query params (Active Storage always adds them).
+ config.active_storage.resolve_model_to_route = :rails_storage_proxy
```

**b) `config/deploy.yml`**

```diff
 servers:
   web:
-    - 45.63.23.136
+    - 43.103.50.22

 proxy:
   ssl: true
-  host: tour.skipmaple.com
+  hosts:
+    - tour.skipmaple.com
+    - onetour.skipmaple.com

 accessories:
   db:
     image: postgres:18
-    host: 45.63.23.136
+    host: 43.103.50.22
```

> 用 `hosts:` 数组(Kamal 2 支持),让新 prod 同时响应两个域名。

**c) `config/storage.yml`** — OSS endpoint 优先用内网

```diff
 aliyun_oss:
   service: S3
   access_key_id:     <%= ENV["OSS_ACCESS_KEY_ID"] %>
   secret_access_key: <%= ENV["OSS_ACCESS_KEY_SECRET"] %>
-  endpoint:          <%= ENV["OSS_ENDPOINT"] %>
+  endpoint:          <%= ENV["OSS_ENDPOINT_INTERNAL"].presence || ENV["OSS_ENDPOINT"] %>
   bucket:            <%= ENV["OSS_BUCKET"] %>
   region:            <%= ENV["OSS_REGION"] || "cn-hongkong" %>
```

**d) `.env.production`(本地)添加 OSS 内网 endpoint**

```
OSS_ENDPOINT_INTERNAL=https://oss-cn-hongkong-internal.aliyuncs.com
```

也对应在 `.kamal/secrets-common` 加 `OSS_ENDPOINT_INTERNAL` 行,`config/deploy.yml` 的 `env.secret` 加 `OSS_ENDPOINT_INTERNAL`。

提交并推送:

```sh
git add config/environments/production.rb config/deploy.yml \
        config/storage.yml .kamal/secrets-common
git commit -m "feat: cutover to SWAS HK + OSS HK (proxy mode + internal endpoint)"
git push origin main  # 或当前分支
```

### 阶段 F:DNS 切换(关键时刻)

⚠️ **顺序严格**:DNS 必须先切,Kamal deploy 后跑——否则 Let's Encrypt 验证 `tour.*` 时会失败(因为 cert 申请时 DNS 还指 Vultr)。

```
8. Cloudflare DNS:
   - tour.skipmaple.com 的 A 记录:45.63.23.136 → 43.103.50.22
   - 仍保持仅 DNS(灰云,不要开代理)
   - 保存

9. 监控 DNS 传播
```

```sh
# 反复 dig 直到看到新 IP
while true; do
  dig tour.skipmaple.com +short
  sleep 5
done
# 看到 43.103.50.22 即可 Ctrl-C
```

### 阶段 G:Kamal 部署到 SWAS(3-5 分钟)

```sh
# 10. setup 默认 destination 到 SWAS(首次,确保 accessory + proxy 就位)
#     由于 accessory 是 staging 共享的 one-tour-db,setup 会跳过(已存在)
bin/kamal setup

# 11. 部署应用
bin/kamal deploy
```

Kamal 会:
- 重新构建镜像(包含新的 production.rb)
- push 到 Docker Hub
- SWAS 上启动新的 prod 应用容器(**与 staging 容器共存**)
- kamal-proxy 现在路由 `tour.*` 到 prod 容器,`onetour.*` 仍路由到 staging 容器
- Let's Encrypt 给 `tour.skipmaple.com` 自动签新证书

## 阶段 H:验证(必做,5 分钟)

浏览器打开 `https://tour.skipmaple.com`,逐项验证:

- [ ] **登录页能加载**(SSL 证书绿锁)
- [ ] **邮箱验证码登录成功**
- [ ] **看到自己的 guidebook 列表**(数据已恢复)
- [ ] **打开 guidebook 内**已有图片**能显示**(从 OSS 拉,关键!)
- [ ] **创建 test guidebook + 上传新图**——上传成功 + 刷新后能看到(写路径走 OSS)
- [ ] **删除 test guidebook**——成功(DeleteObject 权限对)
- [ ] **看 Sentry**——不应该有 NoSuchKey / Forbidden / OSS 相关 error

如果 1–6 全过 → 切换成功 🎉。

## 阶段 I:扫尾(切换后立即)

```sh
# 12. 删除 staging destination(不再需要)
bin/kamal app remove -d staging

# 13. 删除 staging 配置
git rm config/deploy.staging.yml
git commit -m "chore: 移除 staging destination,SWAS 已转正"
git push

# 14. (可选)Cloudflare DNS 删除 onetour.skipmaple.com
#     如果不删,作为开发后门保留
```

## 切换后保留期

| 时间 | 动作 |
|---|---|
| 切换 + 0h | DNS 切换完成,验证通过 |
| 切换 + 24h | 二次 smoke test,Sentry 检查无新增 error |
| 切换 + 48h | DNS TTL 改回 Auto |
| 切换 + 7 天 | **销毁 Vultr 实例**(节省 $10/月) |
| 切换 + 30 天 | **R2 bucket 清空,从配置移除 R2_* env**(参考 [r2-to-oss-migration.md Step 8](r2-to-oss-migration.md)) |

## 回滚程序(切换后 30 分钟内可用)

如果阶段 H 验证失败,**5 分钟回滚到 Vultr**:

```sh
# 1. revert production.rb 和 deploy.yml
git revert HEAD
git push

# 2. 反向 UPDATE service_name(把 SWAS 上 staging 的 DB 也改回去)
bin/kamal app exec -d staging --reuse \
  "bin/rails storage:migrate_service_name FROM=aliyun_oss TO=cloudflare APPLY=1"

# 3. DNS 切回 Vultr
#    Cloudflare → tour.skipmaple.com → 45.63.23.136

# 4. 重启 Vultr 应用
bin/kamal deploy   # 此时 deploy.yml 已 revert,部署回 Vultr

# 5. 验证 https://tour.skipmaple.com 回到 Vultr 状态
```

⚠️ **回滚的关键约束**:**回滚必须在切换后 30 分钟内做**。理由:
- 切换后用户在 SWAS 写入的新数据不会出现在 Vultr DB
- 切换后用户上传的新图只在 OSS,R2 没有
- 时间越长,回滚后丢失的数据越多

为最小化风险,**切换日选在 5 人都没在用的深夜窗口**。

## 故障排查

| 现象 | 原因 | 解 |
|---|---|---|
| `kamal deploy` 报 `KAMAL_REGISTRY_PASSWORD not found` | secrets-common 没读到 | 确认 `.env.production` 在本地存在 |
| `kamal app remove -d staging` 报 `Specify one of 'host' or 'hosts', not both` | Kamal 2 destination 合并 deploy.yml + deploy.staging.yml,host / hosts 字段冲突 | 让 deploy.staging.yml 也用 `hosts:` 数组语法,与 deploy.yml 统一 |
| `kamal deploy` 报 `Error: host settings conflict with another service` | 两个 destination 同时认领同一个 host | 先 `kamal app remove -d staging` 释放,再 deploy 默认 destination |
| Let's Encrypt `unable to find solver` / 超时 | DNS 没切 / 没传播 | 等 5 分钟重试,`dig` 看 DNS 已切 |
| `kamal deploy` 完后访问 502 | kamal-proxy 没识别新 host | `bin/kamal proxy logs` 查 |
| 旧图片显示不出来(404) | service_name UPDATE 没全 / OSS 缺数据 | 检查 `SELECT count(*) FROM active_storage_blobs WHERE service_name='cloudflare'`(应该 0)+ rclone check |
| **图片显示 400 Bad Request / curl 403 "no right to access this object because of bucket acl"** | **OSS SigV4 对 presigned URL 中 `response-content-disposition`/`response-content-type` 参数验签不一致**(详见"已知陷阱") | **改 Active Storage 走 proxy mode** |
| 新上传图片报 403 | OSS RAM 子账号没 PutObject | 控制台检查 `one-tour-app` 策略,确认 Resource 含 `acs:oss:*:*:bucket/*`(对象级)|
| 数据库报 `relation does not exist` | pg_restore 没成功 | 重跑 pg_restore,检查 dump 完整性 |
| accessory `one-tour-db` 不响应 | accessory 没起 / 连接错 | `bin/kamal accessory logs db` |

## 时长估算

| 阶段 | 估算 | 累计 |
|---|---|---|
| A. 停 prod + 最后 backup | 2 min | 2 |
| B. 恢复 SWAS DB | 3 min | 5 |
| C. rclone catch-up | 1 min | 6 |
| D. UPDATE service_name | 1 min | 7 |
| E. 代码 + push | 2 min | 9 |
| F. DNS 切换 + 传播 | 2 min | 11 |
| G. kamal deploy | 5 min | 16 |
| H. 验证 | 5 min | 21 |

**净停机** = 阶段 A 开始到阶段 G 完成 ≈ **15 分钟**。

**用户层面停机**(从他们看到 502 到能访问新站)= 阶段 A 到 G + DNS 缓存刷新(最多 60s) ≈ **15-17 分钟**。

挑深夜窗口,5 人感知接近零。

---

## 🚨 已知陷阱与设计决策

切换日实战踩到的坑,沉淀下来给后续基于 OSS 的项目避坑。

### 陷阱 1:OSS SigV4 不正确验证 Active Storage 风格的 presigned URL

**症状**:
- `config/storage.yml` 配 OSS service,production.rb 设 `:aliyun_oss`,kamal deploy 后:
- 后端日志显示 "Redirected to https://<bucket>.oss-cn-hongkong.aliyuncs.com/...?response-content-disposition=...&X-Amz-Signature=..."
- 浏览器拿到 redirect URL,GET 请求**返回 400 Bad Request**
- `curl` 同一个 URL 返回 **403 Forbidden** + 错误消息:`You have no right to access this object because of bucket acl`

**误导性**:错误消息说 "bucket acl",让人以为是 RAM 策略 / bucket ACL 配置错。实际**不是** ACL 问题:
- 用同一个 RAM 凭证 `aws s3 cp` 直连下载 → ✅ 成功
- 用 spike 脚本生成不带 `response-content-*` 参数的 presigned URL → ✅ 成功

**根因**:OSS 的 SigV4 实现处理 `response-content-disposition` / `response-content-type` 这两个 query 参数时,验签逻辑**与 AWS S3 不一致**。Active Storage 的 `S3Service` 内部**总是**给 presigned GET URL 加这两个参数(用于控制浏览器显示文件名 + content-type),触发 OSS 拒绝。

**验证方式**(在切换前 spike 阶段就该跑):

```ruby
# 用 aws-sdk-s3 Presigner 生成两种 URL,curl 对比
signer = Aws::S3::Presigner.new(client: oss_client)

clean_url = signer.presigned_url(:get_object, bucket:, key:, expires_in: 600)
# 期望 curl 这个 → 200

active_storage_style = signer.presigned_url(:get_object, bucket:, key:,
  expires_in: 600,
  response_content_disposition: 'inline; filename="x.jpg"',
  response_content_type: 'image/jpeg')
# 实际 curl 这个 → 403 (OSS) / 200 (S3)
```

**修复方案 (推荐):Active Storage proxy mode**

```ruby
# config/environments/production.rb
config.active_storage.resolve_model_to_route = :rails_storage_proxy
```

效果:
- `image_tag(blob)` 生成 `/rails/active_storage/blobs/proxy/...` 这种 Rails 内部路由
- 浏览器请求 → Rails 后端 → OSS 内部读取 → 流式转发给浏览器
- **浏览器永远不直接访问 OSS**,绕开 SigV4 兼容性 bug
- 私有 bucket 不变,安全性保持

**代价**:所有图片流量经过 SWAS。但配合 OSS 内网 endpoint(见陷阱 2),OSS → SWAS 流量免费,只占 SWAS 出向带宽(套餐内不限量)。5 人小用量完全不影响。

### 陷阱 2:OSS 公网 endpoint vs 内网 endpoint(省钱关键)

阿里云 OSS 提供两套 endpoint:

| Endpoint | 适用 | 流量费 |
|---|---|---|
| `oss-cn-hongkong.aliyuncs.com`(公网)| 任何位置访问 | ¥0.5/GB 出站 |
| `oss-cn-hongkong-internal.aliyuncs.com`(内网)| 同 region 阿里云资源访问 | **免费** |

SWAS HK + OSS HK 同 region,**Rails 完全可以用内网 endpoint**——但浏览器在公网,只能用公网。两个矛盾的需求,通过 **proxy mode** 调和:

- **proxy mode** 下浏览器只跟 SWAS 通信,**SWAS 用 OSS 内网 endpoint** → OSS → SWAS 内网传输免费 → SWAS → 浏览器走 SWAS 套餐内不限量出口 → **全程免费**
- **redirect mode** 下浏览器直接访问 OSS,**只能用 OSS 公网 endpoint** → OSS → 浏览器公网出站 → **¥0.5/GB**

实现:`storage.yml` 优先取 `OSS_ENDPOINT_INTERNAL` env 变量,fallback 到 `OSS_ENDPOINT`(公网):

```yaml
endpoint: <%= ENV["OSS_ENDPOINT_INTERNAL"].presence || ENV["OSS_ENDPOINT"] %>
```

`.env.production` 同时设两个变量:

```
OSS_ENDPOINT=https://oss-cn-hongkong.aliyuncs.com
OSS_ENDPOINT_INTERNAL=https://oss-cn-hongkong-internal.aliyuncs.com
```

- SWAS 上 Rails 拿到 INTERNAL → 用内网 → 免流量费
- 本地 Mac dev / spike 测试 INTERNAL 没设 → fallback 到公网 → 正常工作

**对 100 GB/月 图片下载量,直接省 ¥50/月**,而且没有任何代价。

### 陷阱 3:Kamal 2 destination 配置合并

Kamal 2 用 `-d <name>` 选 destination:`config/deploy.<name>.yml` 与 `config/deploy.yml` **合并而非独立**。这意味着两个文件有任一字段冲突会触发验证错:

```
ERROR (Kamal::ConfigurationError): proxy: Specify one of 'host' or 'hosts', not both
```

**最佳实践**:所有 destination 配置文件用相同的字段语法。比如 `proxy.hosts:` 数组在 deploy.yml 和 deploy.staging.yml 都用,不要一边 `host:` 一边 `hosts:`。

### 陷阱 4:host conflict 在 multi-destination 共存期

切换日 `bin/kamal deploy` 报:

```
Error: host settings conflict with another service
```

原因:**两个 destination(staging + 默认 prod)同时认领同一个 host**(`onetour.skipmaple.com`)。kamal-proxy 拒绝重复注册。

**解决顺序**:
1. 先 `bin/kamal app remove -d staging`(释放 staging 占用的 host)
2. 再 `bin/kamal deploy`(prod 平稳认领 host)

切换日 runbook 阶段 G 已经按这个顺序写。

### 陷阱 5:存储切换前必须切 DNS,否则 SSL 签证失败

`bin/kamal setup` / `bin/kamal deploy` 触发 Let's Encrypt 给新 host 签证书,**HTTP-01 挑战**会请求 `http://<host>/.well-known/acme-challenge/...`。如果 DNS 还指向旧服务器,Let's Encrypt 拿不到挑战值 → 签证失败。

**正确顺序**(runbook 阶段 F → G):

1. DNS 切换到新 IP
2. 等 1-5 分钟传播(`dig` 反复查)
3. 然后 `bin/kamal deploy`



- [ ] DNS TTL 已降到 60s(24 小时前做的)
- [ ] 5 人已通知窗口期
- [ ] 本地 `.env.production` 同步到位(R2_* + OSS_* 都齐)
- [ ] Phase 1 staging smoke test 全过
- [ ] 最近一次 backup-postgres 在 OSS 上(< 1 小时新)
- [ ] R2 → OSS rclone check 0 differences
- [ ] config/storage.yml 的 aliyun_oss service 已就绪
- [ ] lib/tasks/storage.rake migration task 已就绪
- [ ] `bin/kamal app stop` / `bin/kamal deploy` 命令本地可跑
- [ ] 屏幕开两个 terminal:一个本地跑 kamal,一个 ssh SWAS
- [ ] 心理准备:遇到问题随时跑回滚,不强行修

10 项全勾就可以开切换日。
