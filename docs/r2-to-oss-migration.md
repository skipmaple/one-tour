# R2 → OSS HK 数据迁移

完整的端到端 runbook,从 Cloudflare R2 把所有 Active Storage blob 迁到阿里云 OSS HK。

参见 [xinjiang-trip-architecture.md](xinjiang-trip-architecture.md) Track B/C。

## 概览

```
R2 (cloudflare service)              OSS HK (aliyun_oss service)
  · 当前主存储                          · 迁移目标
  · 暂留 30 天回滚保险           ──→   · 切换日起新主存储
                                       · 同 region 与 SWAS HK
```

**两阶段操作**:

1. **预热**(Day 0–N,应用仍在 R2 跑):rclone 把 R2 全量复制到 OSS,反复跑增量同步,慢慢追赶
2. **切换日**(5–10 分钟停机):停应用 → 最后一次增量 sync → DB UPDATE → 切 production.rb → 部署 → 验证

R2 在切换后**继续保留 30 天**作为只读回滚源。

## 前置条件

按顺序确认 5 项:

- [ ] 阿里云已创建主存储 bucket `one-tour-assets`(HK,私有,与 `one-tour-backups` 分离)
- [ ] 创建 RAM 子账号 `one-tour-app`(独立于 `one-tour-backup`),最小权限策略覆盖 `one-tour-assets` 的 PutObject / GetObject / ListObjects / **DeleteObject**(Active Storage 需要 Delete)
- [ ] `.env.production` 已加 5 个 `OSS_*` 变量(见架构文档,与 `.kamal/secrets` 字段对应)
- [ ] `config/storage.yml` 已有 `aliyun_oss` service(已提交,commit 5cd6300)
- [ ] OSS 兼容性 spike 通过(已完成,11/11 ✅)

RAM 策略示例(`one-tour-app` 用):

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:ListObjects",
        "oss:DeleteObject",
        "oss:GetBucket"
      ],
      "Resource": [
        "acs:oss:*:*:one-tour-assets",
        "acs:oss:*:*:one-tour-assets/*"
      ]
    }
  ]
}
```

## 选择 rclone 运行位置

| 选项 | 优势 | 劣势 |
|---|---|---|
| 🏆 **新 SWAS HK** | R2 → SWAS 跨境一次,SWAS → OSS 同 region 极快 | 需要 SWAS 已初始化 + 装 rclone |
| 🥈 **本地 Mac / Linux** | 即开即用 | R2 → Mac 跨境 + Mac → OSS 跨境**两次跨境**,速度看本地网络 |
| ❌ Vultr NJ | 不推荐 | NJ → OSS HK 跨太平洋,慢且不稳定 |

**推荐**:等 Track A 第 4 步把 SWAS 初始化后,在 SWAS 上跑 rclone。**临时方案**:如果你想先在本地试一遍验证流程,Mac 也可以。

## Step 1:安装 rclone

### macOS

```sh
brew install rclone
```

### Ubuntu(Vultr / SWAS)

```sh
sudo apt-get update && sudo apt-get install -y rclone

# 或者装最新版(apt 版本可能略老但不影响 S3 同步功能):
# curl https://rclone.org/install.sh | sudo bash
```

验证:

```sh
rclone version
```

## Step 2:配置 rclone

不用 `rclone config` 交互式,直接写配置文件:

```sh
mkdir -p ~/.config/rclone
cat > ~/.config/rclone/rclone.conf <<'EOF'
[r2-source]
type = s3
provider = Cloudflare
access_key_id = <R2_ACCESS_KEY_ID>
secret_access_key = <R2_SECRET_ACCESS_KEY>
endpoint = <R2_ENDPOINT>
acl = private

[oss-dest]
type = s3
provider = Alibaba
access_key_id = <OSS_ACCESS_KEY_ID>
secret_access_key = <OSS_ACCESS_KEY_SECRET>
endpoint = oss-cn-hongkong.aliyuncs.com
acl = private
EOF

chmod 600 ~/.config/rclone/rclone.conf
```

**手动替换 4 处占位符**(R2 凭证从 `.env.production` 拿,OSS 用 `one-tour-app` 子账号的凭证)。

注意:
- `r2-source` 用的是 R2 的端点(从 `.env.production` 的 `R2_ENDPOINT` 复制,通常形如 `https://<account-id>.r2.cloudflarestorage.com`)
- `oss-dest` 端点**不带 `https://`**(rclone 自己加),且**不要**用 `-internal` 后缀(用公网端点,SWAS 上跑也能用)

测试两边都通:

```sh
rclone lsd r2-source:           # 列出 R2 上的 buckets
rclone lsd oss-dest:            # 列出 OSS 上的 buckets

# 看每个 bucket 内的文件数和总大小
rclone size r2-source:<R2_BUCKET>
rclone size oss-dest:one-tour-assets   # 应该是 0 或没创建
```

## Step 3:初次全量同步

R2 → OSS,这是耗时大头。30GB 数据按典型跨境带宽 1–5 MB/s 估算 1–8 小时。

**强烈建议在 tmux / screen 里跑**(SSH 断了不会中断):

```sh
# 启动 tmux session
tmux new -s rclone-migration

# 在 tmux 里跑(R2_BUCKET 替换成 .env.production 里的实际名字)
rclone copy r2-source:<R2_BUCKET> oss-dest:one-tour-assets \
  --progress \
  --transfers 8 \
  --checkers 16 \
  --s3-chunk-size 10M \
  --stats 30s \
  --log-file=/tmp/rclone-migration.log \
  --log-level INFO

# detach: Ctrl-b d
# attach: tmux attach -t rclone-migration
```

参数说明:
- `copy`(**不是** `sync`):只增不删,确保 OSS 不会删 R2 没有的东西(虽然 OSS 这时是空的)
- `--transfers 8`:并发 8 个文件
- `--checkers 16`:并发 16 个 HEAD 检查
- `--s3-chunk-size 10M`:大文件分片 10 MB(适合视频)
- `--stats 30s`:每 30s 打印进度
- `--log-file`:留 log 排错

**期间可以做的事**:
- 阿里云 OSS 控制台看 `one-tour-assets` 文件数增长
- 不要修改任何 ActiveStorage 内容(否则需要再多跑一次增量)

## Step 4:校验完整性

跑完后立即校验:

```sh
rclone check r2-source:<R2_BUCKET> oss-dest:one-tour-assets \
  --size-only \
  --log-file=/tmp/rclone-check.log
```

`--size-only` 只比 size(快),不下载内容比 hash。R2 和 OSS 都返回标准 size,可信。

**预期输出**:`0 differences found`。

如果有差异,log 里会写明哪些 key 缺失。重新跑一次 `rclone copy`(它会跳过已经一致的)。

辅助交叉验证(用 DB 数 vs OSS 实物数):

```sh
# DB 里所有 R2 blob 的数量
bin/rails runner 'puts ActiveStorage::Blob.where(service_name: "cloudflare").count'

# OSS 上的对象数(可能多于 DB,因为 ActiveStorage Variant 也存)
rclone size oss-dest:one-tour-assets
```

DB 数应**小于或等于** OSS 数(变体不在 `active_storage_blobs` 表)。如果反过来,有 blob 没迁,需排查。

## Step 5:切换日操作

⚠️ **应用停机 5–10 分钟**。建议挑没人用的时段(深夜)。

### 5.1 停应用容器

```sh
kamal app stop
```

应用此时返回 502 / connection refused,但 Postgres 仍在跑。

### 5.2 最后一次增量 sync(catch up)

```sh
rclone copy r2-source:<R2_BUCKET> oss-dest:one-tour-assets \
  --progress \
  --update \
  --transfers 8 \
  --checkers 16 \
  --log-file=/tmp/rclone-catchup.log
```

`--update` 只复制 R2 新于 OSS 的、或 OSS 没有的。停机后这次应该很快(分钟级)。

### 5.3 DB:UPDATE service_name

```sh
# 先 dry-run 看影响范围
kamal app exec --reuse "bin/rails storage:migrate_service_name FROM=cloudflare TO=aliyun_oss"

# 确认数量符合预期后,APPLY
kamal app exec --reuse "bin/rails storage:migrate_service_name FROM=cloudflare TO=aliyun_oss APPLY=1"
```

输出会显示 `✔ Updated N rows`。

### 5.4 切默认 service

```ruby
# config/environments/production.rb:25
- config.active_storage.service = :cloudflare
+ config.active_storage.service = :aliyun_oss
```

提交并推:

```sh
git add config/environments/production.rb
git commit -m "feat(storage): cutover to aliyun_oss"
git push
```

### 5.5 部署

```sh
kamal deploy
```

应用重启,新流量走 OSS。

### 5.6 重启应用(如果 deploy 没自动起)

```sh
kamal app start
```

## Step 6:验证生产

切换后立即验证(不要等):

1. **登录 + 看 guidebook 现有图片**——能正常显示 → blob 从 OSS 取到了
2. **上传一张新图片**——能上传,刷新后能看到 → 写路径走 OSS
3. **删一张旧图片**(如果方便) → DeleteObject 权限通
4. **看应用日志** `kamal app logs` → 没有 NoSuchKey / Forbidden

如果 1–4 全过,**切换成功** 🎉。

## Step 7:回滚程序(切换日 5 分钟内回滚)

如果第 6 步发现问题(比如读不到旧 blob),立即回滚:

```sh
# 1. revert production.rb
git revert HEAD       # 或手动改回 :cloudflare
git push

# 2. 重新 UPDATE service_name(反向)
kamal app exec --reuse "bin/rails storage:migrate_service_name FROM=aliyun_oss TO=cloudflare APPLY=1"

# 3. 重新部署
kamal deploy

# 4. 验证应用回到 R2,用户没察觉
```

时间窗口:旧 R2 数据没动,完全可用。**切换日的关键是不要在迁移后立即写 R2,否则切回来时 OSS 上的新 blob 找不到**。这就是为什么 Step 5 完成后要立刻验证;一旦发现问题,5 分钟内回滚是最安全的。

## Step 8:观察与清理

### 切换后 48 小时

- 看 Sentry 是否有 NoSuchKey / Forbidden 报错
- 看 OSS 控制台账单(流量,确认数量级符合预期)
- 看应用响应时间是否变化(应该更快,因为同 region)

### 切换后 7 天

- 旧 Vultr NJ 服务器销毁(已无业务)
- Vultr 关停账单

### 切换后 30 天

- R2 bucket 清空
- R2 凭证作废,从 `.env.production` 移除 R2_* 变量
- `config/storage.yml` 删 `cloudflare` service
- `.kamal/secrets` 删 R2_* 引用
- `config/deploy.yml` env.secret 删 R2_*

提交一个收尾 PR:`chore(storage): retire R2 service after 30-day rollback window`。

## 附录 A:rclone 命令参考

```sh
# 列出远端 buckets
rclone lsd <remote>:

# 看 bucket 总大小和文件数
rclone size <remote>:<bucket>

# 列文件(深度遍历)
rclone ls <remote>:<bucket>

# 列文件(只看顶层目录)
rclone lsd <remote>:<bucket>

# 单个文件 sync
rclone copyto <remote>:<bucket>/<key> <other-remote>:<bucket>/<key>

# 清空一个目录前缀
rclone delete <remote>:<bucket>/<prefix>

# 完整性校验(快,只比 size)
rclone check <src> <dst> --size-only

# 完整性校验(慢,下载比对 hash)
rclone check <src> <dst>

# 估算传输时间(dry-run)
rclone copy <src> <dst> --dry-run --progress
```

## 附录 B:故障排查

| 现象 | 原因 | 解 |
|---|---|---|
| `Failed to copy: SignatureDoesNotMatch` | R2 endpoint 写错 / AK 错 | 复核 `.env.production` 与 rclone.conf |
| `Failed to copy: SecondLevelDomainForbidden` | OSS 必须 virtual-style | rclone 默认就是 virtual,不会撞这条;若撞了检查 endpoint 拼写 |
| 速度极慢(< 100 KB/s) | 跨境网络瓶颈 | 换运行位置(SWAS HK 最佳) |
| `Failed to copy: connection reset` | R2 偶发断连 | rclone 自动重试,无需干预;持续失败检查防火墙 |
| `rclone check` 报 `differences` | 极少数文件未同步 | 重跑 `rclone copy`,跳过已一致的 |
| 切换后用户看不到旧图片 | service_name 没全 UPDATE,或 rclone catch-up 漏 | 反向验证:`SELECT count(*) FROM active_storage_blobs WHERE service_name='cloudflare'` 应该是 0 |
| 切换后新上传图片访问 403 | OSS RAM 子账号缺权限 | 检查 `one-tour-app` 策略含 PutObject/GetObject |
| `kamal app exec` 报 service 不认识 | 镜像还是旧版本 | `kamal deploy` 后再跑 |

## 附录 C:估算时长

| 阶段 | 估算 | 备注 |
|---|---|---|
| Step 1 安装 rclone | 1 分钟 | apt / brew |
| Step 2 配置 | 2 分钟 | 写 conf 文件 |
| Step 3 初次全量同步 | 1–8 小时 | 30 GB 数据,看带宽 |
| Step 4 校验 | 5–15 分钟 | size-only 较快 |
| **Step 5 切换日(停机)** | **5–10 分钟** | 关键路径 |
| Step 6 验证 | 5–10 分钟 | 手工点几下 |
| Step 7 回滚(if needed) | 5 分钟 | 已彩排 |

**净停机时间约 5–10 分钟**,选个深夜窗口,5 人小队几乎察觉不到。
