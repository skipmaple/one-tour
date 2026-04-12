# Create a seed user
user = User.find_or_create_by!(email: "admin@example.com") do |u|
  u.name = "Admin"
end

# Read the existing markdown guidebook from the sibling content repo
source_dir = File.expand_path("../../tour-of-xinjiang", __dir__)
markdown_path = File.join(source_dir, "伊犁自驾路书-20260613.md")

if File.exist?(markdown_path)
  markdown_content = File.read(markdown_path)

  # Prepend frontmatter to the existing markdown
  frontmatter = <<~YAML
    ---
    title: 新疆伊犁 9 日自驾路书
    date_range: "2026-06-13/2026-06-21"
    vehicle: 理想 L8
    team_size: 5
    total_km: 1300
    route_coordinates:
      - [43.83, 87.62]
      - [44.32, 84.87]
      - [44.22, 85.16]
      - [43.59, 84.38]
      - [43.24, 84.05]
      - [42.85, 83.42]
      - [43.16, 82.08]
      - [43.15, 81.13]
      - [42.73, 81.05]
      - [43.21, 80.43]
      - [44.02, 80.87]
      - [44.60, 81.38]
      - [43.92, 81.32]
    days:
      - day: 1
        date: "2026-06-13"
        title: 抵达乌鲁木齐
        intensity: green
        km: 0
        coordinates: [43.83, 87.62]
        highlights:
          - name: 新疆国际大巴扎
            coordinates: [43.79, 87.61]
      - day: 2
        date: "2026-06-14"
        title: 乌鲁木齐 → 独库公路 → 乔尔玛
        intensity: red
        km: 460
        coordinates: [43.59, 84.38]
        highlights:
          - name: 安集海大峡谷
            coordinates: [44.22, 85.16]
          - name: 哈希勒根达坂
            coordinates: [43.73, 84.57]
      - day: 3
        date: "2026-06-15"
        title: 乔尔玛 → 唐布拉百里画廊 → 那拉提
        intensity: green
        km: 120
        coordinates: [43.24, 84.05]
        highlights:
          - name: 唐布拉百里画廊
            coordinates: [43.45, 83.85]
          - name: 仙女湖
            coordinates: [43.40, 83.70]
      - day: 4
        date: "2026-06-16"
        title: 那拉提景区全天
        intensity: green
        km: 0
        coordinates: [43.24, 84.05]
        highlights:
          - name: 空中草原
            coordinates: [43.18, 84.00]
          - name: 河谷草原
            coordinates: [43.22, 84.08]
      - day: 5
        date: "2026-06-17"
        title: 那拉提 → 特克斯 → 喀拉峻
        intensity: yellow
        km: 180
        coordinates: [42.85, 83.42]
        highlights:
          - name: 特克斯八卦城
            coordinates: [43.22, 81.83]
      - day: 6
        date: "2026-06-18"
        title: 喀拉峻全天
        intensity: green
        km: 0
        coordinates: [42.85, 83.42]
        highlights:
          - name: 东喀拉峻
            coordinates: [42.83, 83.50]
          - name: 阔克苏大峡谷
            coordinates: [42.80, 83.35]
      - day: 7
        date: "2026-06-19"
        title: 特克斯 → 昭苏 → 夏塔
        intensity: yellow
        km: 210
        coordinates: [43.15, 81.13]
        highlights:
          - name: 夏塔古道
            coordinates: [42.87, 81.02]
      - day: 8
        date: "2026-06-20"
        title: 昭苏 → 伊昭公路 → 霍城薰衣草 → 赛里木湖
        intensity: yellow
        km: 280
        coordinates: [44.60, 81.38]
        highlights:
          - name: 伊昭公路
            coordinates: [43.50, 80.90]
          - name: 霍城薰衣草
            coordinates: [44.02, 80.87]
          - name: 赛里木湖
            coordinates: [44.60, 81.18]
      - day: 9
        date: "2026-06-21"
        title: 赛里木湖 → 伊宁 → 还车
        intensity: green
        km: 100
        coordinates: [43.92, 81.32]
        highlights:
          - name: 赛里木湖日出
            coordinates: [44.60, 81.18]
    ---
  YAML

  content = frontmatter + "\n" + markdown_content

  Guidebook.find_or_create_by!(title: "新疆伊犁 9 日自驾路书") do |g|
    g.author = user
    g.content = content
    g.published = true
  end

  puts "Seeded guidebook: 新疆伊犁 9 日自驾路书"
else
  puts "Source markdown not found at #{markdown_path}, skipping seed."
end
