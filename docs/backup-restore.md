# Postgres 备份与恢复

每日备份 `one_tour_production` → 阿里云 OSS 香港 bucket。30 天滚动保留。

只备份 primary。`_cache` / `_queue` / `_cable` 是 SolidCache / SolidQueue / SolidCable 的临时数据,首次启动会自动建表,**不需要备份**。

## 在生产服务器上初次安装

### 1. 安装 ossutil

```sh
curl -fsSL https://gosspublic.alicdn.com/ossutil/v2/2.0.7/ossutil-2.0.7-linux-amd64.zip -o /tmp/ossutil.zip
unzip -j /tmp/ossutil.zip -d /tmp/
install -m 0755 /tmp/ossutil /usr/local/bin/ossutil
ossutil version
```

### 2. 创建 RAM 子账号(最小化:仅给备份 bucket 必要权限)

阿里云控制台 → RAM 访问控制 → 创建用户(`one-tour-backup`),勾选"OpenAPI 调用访问",拿到 AccessKey ID / Secret。

授权策略(粘贴到自定义策略,把 `<bucket>` 换成实际名):

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:<bucket>",
        "acs:oss:*:*:<bucket>/*"
      ]
    }
  ]
}
```

只含写入(`PutObject`)、列举(`ListObjects`,用于 `ossutil ls`)、读取(`GetObject`,用于恢复)。**不含 `DeleteObject`**——保留期由 OSS lifecycle 规则管理,脚本和恢复流程都不需要删权限,泄露面更小。

把这条策略授权给 `one-tour-backup` 用户。

### 3. 写配置文件

```sh
sudo tee /etc/one-tour-backup.env > /dev/null <<'EOF'
OSS_BUCKET=one-tour-backups
OSS_ENDPOINT=https://oss-cn-hongkong.aliyuncs.com
OSS_ACCESS_KEY_ID=<RAM AccessKey ID>
OSS_ACCESS_KEY_SECRET=<RAM AccessKey Secret>
EOF
sudo chmod 600 /etc/one-tour-backup.env
```

### 4. 部署脚本到服务器

```sh
# 从本地 push 到服务器
scp bin/backup-postgres root@<server>:/usr/local/bin/backup-postgres
ssh root@<server> chmod +x /usr/local/bin/backup-postgres
```

### 5. 配置 OSS 生命周期规则(30 天滚动)

控制台 → 对象存储 → 你的 bucket → 数据管理 → 生命周期 → 创建规则:

- 策略名:`postgres-30d`
- 匹配前缀:`postgres/`
- 文件过期天数:30 天后删除
- 应用范围:**当前版本**

这条规则配好后,旧备份 OSS 自动清理,脚本不用管。

### 6. 添加 cron(每日 UTC 03:00 = 北京 11:00)

```sh
sudo crontab -e
```

加下面两行,显式按 UTC 解释 cron 时间(阿里云国内 ECS 默认 `Asia/Shanghai`,不显式声明会偏移 8 小时):

```cron
TZ=UTC
0 3 * * * /usr/local/bin/backup-postgres >> /var/log/one-tour-backup.log 2>&1
```

## 手动跑一次

在服务器上:

```sh
/usr/local/bin/backup-postgres
```

预期输出:

```
[2026-04-25T03:00:00Z] pg_dump one_tour_production via container one-tour-db
[2026-04-25T03:00:04Z] dump complete: 4382912 bytes
[2026-04-25T03:00:05Z] uploading to oss://one-tour-backups/postgres/2026/04/25/one_tour_production-20260425-030000Z.dump
[2026-04-25T03:00:08Z] ok: oss://one-tour-backups/postgres/2026/04/25/one_tour_production-20260425-030000Z.dump
```

## 列出已有备份

```sh
ossutil ls oss://one-tour-backups/postgres/
```

## 恢复(DR 演练 / 真灾难)

### 本地演练(推荐先在本地 docker 跑一次)

```sh
# 1. 拉某个备份到本地
ossutil cp oss://one-tour-backups/postgres/2026/04/25/one_tour_production-XXXX.dump /tmp/restore.dump

# 2. 起一个干净的 postgres 容器
docker run -d --name one-tour-restore-test \
  -e POSTGRES_USER=one_tour \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=one_tour_production \
  -p 5433:5432 \
  postgres:18

# 等几秒等它起来
sleep 5

# 3. 把 dump 拷进容器并恢复
docker cp /tmp/restore.dump one-tour-restore-test:/tmp/restore.dump
docker exec one-tour-restore-test \
  pg_restore --username=one_tour --clean --if-exists --no-owner \
  --dbname=one_tour_production /tmp/restore.dump

# 4. 抽样检查
docker exec one-tour-restore-test \
  psql -U one_tour -d one_tour_production -c "SELECT count(*) FROM users;"

# 5. 清理
docker rm -f one-tour-restore-test
```

### 生产恢复(真出事时)

> ⚠️ 生产恢复会**清空当前数据库**。先确认现有数据真的丢了 / 损坏了,**不要在还能挽回的时候盲目恢复**。

```sh
# 1. 在生产服务器上拉备份
ossutil cp oss://one-tour-backups/postgres/<path>.dump /tmp/restore.dump

# 2. 停应用容器(避免写入冲突)
kamal app stop

# 3. 拷进 postgres accessory 容器
docker cp /tmp/restore.dump one-tour-db:/tmp/restore.dump

# 4. 恢复
docker exec one-tour-db \
  pg_restore --username=one_tour --clean --if-exists --no-owner \
  --dbname=one_tour_production /tmp/restore.dump

# 5. 启动应用
kamal app start

# 6. 抽样验证
kamal app exec --reuse "bin/rails runner 'puts User.count'"
```

## 监控备份是否在跑

简单方案:看 cron 日志

```sh
tail -50 /var/log/one-tour-backup.log
```

进阶:每次成功后可以加一行 `curl https://hc-ping.com/<uuid>` 上报到 [healthchecks.io](https://healthchecks.io)(免费)。备份失败 / 漏跑会发邮件告警。等出行后再加。

## 排错

| 现象 | 检查 |
|---|---|
| `ossutil: command not found` | ossutil 没装上 / 不在 PATH。重跑安装步骤。 |
| `ERROR: dump file is X bytes, refusing to upload` | pg_dump 出问题。手动跑 `docker exec one-tour-db pg_dump --username=one_tour --dbname=one_tour_production` 看报错。 |
| `OSS_BUCKET required` | `/etc/one-tour-backup.env` 没读到。检查路径和权限。 |
| `403 InvalidAccessKey` | RAM AccessKey 失效或权限不对。重新生成 + 检查策略。 |
| 上传慢 | OSS 在同 region(HK)且 bucket 内网 endpoint 应该很快。如果慢,看 `OSS_ENDPOINT` 是否是 HK。 |
