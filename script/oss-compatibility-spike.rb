#!/usr/bin/env ruby
# OSS HK 与 aws-sdk-s3 的兼容性 spike — 跑这个之前先确认 RAM 子账号
# 至少有 PutObject / GetObject / ListObjects 权限(backup 子账号即可)。
#
# 验证 Active Storage S3Service 上 OSS HK 的关键路径:
#   1. SigV4 签名能通过(基本 put/get)
#   2. Multipart upload(视频/大图场景)
#   3. Presigned PUT URL(浏览器 Direct Upload)
#   4. Presigned GET URL(下载/查看)
#
# 用法:
#   OSS_BUCKET=one-tour-backups \
#   OSS_ENDPOINT=https://oss-cn-hongkong.aliyuncs.com \
#   OSS_ACCESS_KEY_ID=... \
#   OSS_ACCESS_KEY_SECRET=... \
#   bundle exec ruby script/oss-compatibility-spike.rb
#
# 测试对象前缀默认 spike/<random>/ — 跑完会留在 bucket 里,因为 backup
# RAM 子账号没有 DeleteObject 权限。可以手动在控制台删,或配 lifecycle
# 规则让 spike/ 路径 1 天后自动清。

require "aws-sdk-s3"
require "net/http"
require "tempfile"
require "securerandom"

BUCKET = ENV.fetch("OSS_BUCKET")
ENDPOINT = ENV.fetch("OSS_ENDPOINT", "https://oss-cn-hongkong.aliyuncs.com")
REGION = ENV.fetch("OSS_REGION", "cn-hongkong")
PREFIX = ENV.fetch("SPIKE_PREFIX", "spike/#{SecureRandom.hex(4)}/")

puts "OSS spike"
puts "  bucket:   #{BUCKET}"
puts "  endpoint: #{ENDPOINT}"
puts "  region:   #{REGION}"
puts "  prefix:   #{PREFIX}"
puts

CLIENT = Aws::S3::Client.new(
  region: REGION,
  endpoint: ENDPOINT,
  access_key_id: ENV.fetch("OSS_ACCESS_KEY_ID"),
  secret_access_key: ENV.fetch("OSS_ACCESS_KEY_SECRET"),
)

@results = []

def t(name)
  print "  #{name.ljust(42)} "
  yield
  puts "✅"
  @results << [ name, true, nil ]
rescue => e
  puts "❌ #{e.class}: #{e.message}"
  e.backtrace.first(2).each { |l| puts "      #{l}" }
  @results << [ name, false, "#{e.class}: #{e.message}" ]
end

# ── [1] 基础读写 ─────────────────────────────────────────
puts "[1] 基础 PutObject / GetObject (验证 SigV4 签名)"

small_key = "#{PREFIX}small.txt"
small_body = "hello oss\n"

t("PutObject (small)") do
  CLIENT.put_object(bucket: BUCKET, key: small_key, body: small_body, content_type: "text/plain")
end

t("HeadObject") do
  resp = CLIENT.head_object(bucket: BUCKET, key: small_key)
  raise "size mismatch (#{resp.content_length} vs #{small_body.bytesize})" \
    unless resp.content_length == small_body.bytesize
end

t("GetObject") do
  resp = CLIENT.get_object(bucket: BUCKET, key: small_key)
  body = resp.body.read
  raise "body mismatch: #{body.inspect}" unless body == small_body
end

t("ListObjectsV2 (with prefix)") do
  resp = CLIENT.list_objects_v2(bucket: BUCKET, prefix: PREFIX, max_keys: 10)
  raise "expected at least 1 key, got 0" if resp.contents.empty?
end

# ── [2] Multipart 大文件 ──────────────────────────────────
puts
puts "[2] Multipart upload (视频/大图场景, 12 MB)"

large_size = 12 * 1024 * 1024
large_file = Tempfile.new("oss-spike-large")
large_file.binmode
12.times { large_file.write(SecureRandom.bytes(1024 * 1024)) }
large_file.rewind
large_key = "#{PREFIX}large.bin"

t("Object#upload_file (auto multipart)") do
  obj = Aws::S3::Object.new(bucket_name: BUCKET, key: large_key, client: CLIENT)
  obj.upload_file(large_file.path, multipart_threshold: 5 * 1024 * 1024)
end

t("HeadObject (large, verify size)") do
  resp = CLIENT.head_object(bucket: BUCKET, key: large_key)
  raise "size mismatch (#{resp.content_length} vs #{large_size})" \
    unless resp.content_length == large_size
end

# ── [3] Presigned URL (Direct Upload 关键路径) ────────────
puts
puts "[3] Presigned URLs (浏览器 Direct Upload)"

signer = Aws::S3::Presigner.new(client: CLIENT)
direct_key = "#{PREFIX}direct.txt"
direct_body = "uploaded via presigned PUT from #{Time.now.utc.iso8601}"
put_url = nil
get_url = nil

t("Presign PutObject URL") do
  put_url = signer.presigned_url(:put_object, bucket: BUCKET, key: direct_key, expires_in: 600)
  raise "url empty" if put_url.nil? || put_url.empty?
end

t("HTTP PUT to presigned URL (no SDK)") do
  uri = URI(put_url)
  req = Net::HTTP::Put.new(uri)
  req.body = direct_body
  req["Content-Type"] = "text/plain"
  resp = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |h| h.request(req) }
  raise "status #{resp.code}: #{resp.body[0, 300]}" unless (200..299).cover?(resp.code.to_i)
end

t("Verify PUT actually persisted (GetObject)") do
  resp = CLIENT.get_object(bucket: BUCKET, key: direct_key)
  body = resp.body.read
  raise "body mismatch: got #{body.inspect}" unless body == direct_body
end

t("Presign GetObject URL") do
  get_url = signer.presigned_url(:get_object, bucket: BUCKET, key: direct_key, expires_in: 600)
end

t("HTTP GET via presigned URL (no SDK)") do
  uri = URI(get_url)
  resp = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") { |h| h.get(uri.request_uri) }
  raise "status #{resp.code}" unless (200..299).cover?(resp.code.to_i)
  raise "body mismatch" unless resp.body == direct_body
end

# ── 总结 ────────────────────────────────────────────────
large_file.close!
total = @results.size
passed = @results.count { |_, ok, _| ok }

puts
puts "─" * 55
puts "结果: #{passed}/#{total}"
if passed < total
  puts
  puts "失败:"
  @results.reject { |_, ok, _| ok }.each do |name, _, err|
    puts "  - #{name}"
    puts "    #{err}"
  end
  puts
  puts "→ Active Storage 上 OSS 之前必须先解决以上问题"
  exit 1
else
  puts "→ aws-sdk-s3 对 OSS HK 兼容性 OK,Active Storage 可以放心配 OSS service"
  puts
  puts "下一步:"
  puts "  1. config/storage.yml 加 aliyun_oss service(参考 cloudflare 那块)"
  puts "  2. RAILS_ENV=production 跑一个最小的 Active Storage upload 验证"
  puts "  3. 如果都通过,可以进入 Track B 的 rclone 迁移"
end
puts
puts "测试对象留在: oss://#{BUCKET}/#{PREFIX}"
puts "(backup RAM 子账号无 DeleteObject 权限,需手动在控制台清,或配 lifecycle)"
