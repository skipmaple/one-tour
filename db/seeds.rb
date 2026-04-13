# Create a seed user
user = User.find_or_create_by!(email: "admin@example.com") do |u|
  u.name = "Admin"
end

# Read the existing markdown guidebook from the sibling content repo
source_dir = File.expand_path("../../tour-of-xinjiang", __dir__)
markdown_path = File.join(source_dir, "伊犁自驾路书-20260613.md")

if File.exist?(markdown_path)
  markdown_content = File.read(markdown_path)

  # Full data model extracted from 伊犁自驾路线图.html
  frontmatter = <<~'YAML'
    ---
    title: "新疆伊犁 9 日自驾路书"
    date_range: "2026-06-13/2026-06-21"
    vehicle: "理想 L8"
    team_size: 5
    total_km: 1300
    trip_style: "🌟 少即是多，以自然景观为主"
    budget_per_person: "~5k"
    type_labels:
      scenic: "📍景点"
      food: "🍜美食"
      fuel: "⛽加油"
      hike: "🥾徒步"
      stay: "🏨住宿"
      city: "🏙️城市"
    route_coordinates:
      - [43.825, 87.617]
      - [44.00, 86.80]
      - [44.15, 86.10]
      - [44.30, 85.50]
      - [44.328, 84.887]
      - [44.22, 85.10]
      - [44.328, 84.887]
      - [44.15, 84.75]
      - [43.95, 84.65]
      - [43.82, 84.63]
      - [43.70, 84.35]
      - [43.58, 84.10]
      - [43.50, 83.75]
      - [43.48, 83.55]
      - [43.38, 83.78]
      - [43.32, 83.78]
      - [43.25, 83.90]
      - [43.30, 83.82]
      - [43.32, 83.78]
      - [43.30, 83.40]
      - [43.25, 82.80]
      - [43.22, 81.84]
      - [43.05, 81.90]
      - [43.08, 82.00]
      - [43.02, 81.85]
      - [43.22, 81.84]
      - [43.16, 81.13]
      - [42.85, 81.20]
      - [43.16, 81.13]
      - [43.00, 81.30]
      - [43.45, 81.20]
      - [43.80, 81.00]
      - [44.05, 80.85]
      - [44.20, 80.90]
      - [44.40, 81.05]
      - [44.60, 81.17]
      - [44.58, 81.08]
      - [44.60, 81.17]
      - [44.48, 81.22]
      - [44.20, 81.25]
      - [43.96, 81.33]
    days:
      - day: 1
        date: "6/13 周六"
        title: "抵达乌鲁木齐"
        intensity: green
        km: "—"
        drive: "—"
        desc: "航班抵达，市区休整，适应时差。逛大巴扎，烤全羊大盘鸡。"
        tags:
          - ["food", "大巴扎美食"]
          - ["stay", "市区酒店"]
        schedule:
          - ["下午", "航班抵达乌鲁木齐天山国际机场"]
          - ["16:00", "打车前往市区酒店，办理入住"]
          - ["19:00", "采购路上零食和水（独库沿线补给少）"]
          - ["20:00", "晚餐：大巴扎附近 — 烤全羊、大盘鸡、椒麻鸡"]
          - ["22:00", "逛大巴扎或早休，为明日蓄力"]
        tips: "今日不取车。新疆实际作息比北京晚2h，天黑约22:30。"
        food: "海尔巴格餐厅（民族风情）、血站大盘鸡"
        stay: "乌鲁木齐市区（红山/大巴扎），280-400元/间"
        ticket: ""
        coordinates: [43.825, 87.617]
        points:
          - name: "乌鲁木齐"
            lat: 43.825
            lng: 87.617
            type: city
      - day: 2
        date: "6/14 周日"
        title: "安集海大峡谷 → 独库公路 → 乔尔玛"
        intensity: red
        km: "460km"
        drive: "7h"
        desc: "早起取车出发。独山子加油后绕行去安集海大峡谷（地球最美伤疤！），再进独库公路北段。翻越哈希勒根达坂(3400m)。"
        tags:
          - ["fuel", "早晨取车加满油"]
          - ["scenic", "🆕安集海大峡谷"]
          - ["scenic", "独库公路"]
          - ["fuel", "⚠️独山子必加油"]
        schedule:
          - ["06:30", "早起取理想L8（确认满油满电）"]
          - ["07:00", "出发，走G30连霍高速"]
          - ["09:30", "抵达独山子，加满油 ⛽（必加！）"]
          - ["09:45", "🆕 前往安集海大峡谷（独山子东北约40km）"]
          - ["10:30-11:15", "🆕 安集海大峡谷观景（彩色岩层，航拍绝佳）"]
          - ["12:00", "返回独山子，进入独库公路北段"]
          - ["13:30", "翻越哈希勒根达坂（海拔3400m）"]
          - ["14:00", "午餐：自带路餐（沿途无餐厅）"]
          - ["15:00", "经过天瀑布，停留拍照"]
          - ["16:30", "抵达乔尔玛，参观烈士纪念碑"]
          - ["19:00", "晚餐：镇上拌面、抓饭"]
        tips: "⚠️ 独山子务必加满油！安集海大峡谷在独山子东北约40km，往返约1.5h。独库全程130km无油站。"
        food: "午餐自带路餐；晚餐乔尔玛镇拌面、抓饭"
        stay: "乔尔玛镇，200-350元/间（旺季紧张提前订）"
        ticket: ""
        coordinates: [44.328, 84.887]
        points:
          - name: "安集海大峡谷"
            lat: 44.22
            lng: 85.10
            type: scenic
          - name: "独山子"
            lat: 44.328
            lng: 84.887
            type: fuel
          - name: "哈希勒根达坂"
            lat: 43.82
            lng: 84.63
            type: scenic
          - name: "乔尔玛"
            lat: 43.58
            lng: 84.10
            type: stay
      - day: 3
        date: "6/15 周一"
        title: "唐布拉百里画廊 → 那拉提"
        intensity: green
        km: "120km"
        drive: "2.5h"
        desc: "唐布拉百里画廊自驾穿行，免门票！途经仙女湖（雪山倒映碧湖）。哈萨克毡房手抓肉午餐。"
        tags:
          - ["scenic", "百里画廊(免费)"]
          - ["scenic", "🆕仙女湖"]
          - ["food", "毡房手抓肉"]
          - ["stay", "那拉提镇"]
        schedule:
          - ["09:00", "乔尔玛出发，沿S315进入唐布拉"]
          - ["09:30-10:30", "百里画廊自驾穿行，随走随停"]
          - ["10:30-11:15", "🆕 仙女湖停留（雪山倒映碧湖，绕湖30min）"]
          - ["11:15-12:00", "继续百里画廊穿行"]
          - ["12:00", "午餐：路边哈萨克毡房手抓肉"]
          - ["13:30", "继续向那拉提行驶"]
          - ["15:00", "抵达那拉提镇，入住"]
          - ["16:00", "自由活动，逛那拉提小镇"]
          - ["20:00", "晚餐：烤羊排、皮辣红"]
        tips: "百里画廊免门票，随时停车拍照。可在河谷段轻徒步1-2h。"
        food: "毡房手抓肉、熏马肉、咸奶茶；晚餐烤羊排"
        stay: "那拉提镇（景区门口），300-500元/间"
        ticket: "百里画廊免费"
        coordinates: [43.50, 83.75]
        points:
          - name: "唐布拉百里画廊"
            lat: 43.50
            lng: 83.75
            type: scenic
          - name: "仙女湖"
            lat: 43.48
            lng: 83.55
            type: scenic
          - name: "那拉提镇"
            lat: 43.32
            lng: 83.78
            type: stay
      - day: 4
        date: "6/16 周二"
        title: "那拉提景区全天"
        intensity: green
        km: "景区内"
        drive: "—"
        desc: "空中草原(海拔2000m+)徒步3-4h，雪山下高山草甸、6月野花盛开。下午河谷草原，巩乃斯河谷云杉光影。"
        tags:
          - ["scenic", "空中草原"]
          - ["scenic", "河谷草原"]
          - ["hike", "草原徒步3-4h"]
          - ["food", "架子肉·卡瓦斯"]
        schedule:
          - ["08:30", "前往那拉提景区大门"]
          - ["09:00", "区间车前往空中草原（海拔2000m+）"]
          - ["09:30-12:00", "空中草原徒步（雪山草甸、野花海）"]
          - ["12:00", "午餐：空中草原毡房奶茶、馕"]
          - ["13:30", "换乘区间车去河谷草原"]
          - ["14:00-16:30", "河谷草原漫步（骑马体验可选）"]
          - ["17:00", "返回镇上"]
          - ["20:00", "晚餐：架子肉、手抓饭、卡瓦斯"]
        tips: "先去空中草原（光线好+避人流）。紫外线极强，SPF50+防晒必涂。"
        food: "毡房奶茶、馕；晚餐架子肉、卡瓦斯"
        stay: "继续住那拉提镇"
        ticket: "套票159元/人（门票95+空中草原区间车40+河谷区间车24）"
        coordinates: [43.25, 83.90]
        points:
          - name: "那拉提·空中草原"
            lat: 43.25
            lng: 83.90
            type: scenic
          - name: "那拉提·河谷草原"
            lat: 43.30
            lng: 83.82
            type: scenic
      - day: 5
        date: "6/17 周三"
        title: "那拉提 → 特克斯 → 喀拉峻"
        intensity: yellow
        km: "180km"
        drive: "3.5h"
        desc: "经特克斯八卦城(无红绿灯)，下午西喀拉峻·鲜花台——'人体草原'，6月野花铺满。"
        tags:
          - ["scenic", "八卦城"]
          - ["scenic", "西喀拉峻·鲜花台"]
          - ["stay", "喀拉峻/特克斯"]
          - ["fuel", "特克斯加油"]
        schedule:
          - ["08:30", "那拉提出发，沿G218向西"]
          - ["11:00", "经过特克斯八卦城，停留拍照"]
          - ["11:30", "午餐：特克斯马肠子、纳仁"]
          - ["13:00", "前往喀拉峻景区（南30km）"]
          - ["14:00-18:00", "西喀拉峻·鲜花台、猎鹰台"]
          - ["19:00", "返回住宿"]
          - ["20:30", "晚餐"]
        tips: "今日先游西喀拉峻，明日全天东喀拉峻+阔克苏。景区毡房夜间5-8°C，带保暖衣。"
        food: "特克斯马肠子、纳仁（手抓肉配面片）"
        stay: "喀拉峻毡房200-400元 或 特克斯县城250-400元"
        ticket: "喀拉峻 140元/人（含门票+区间车）"
        coordinates: [43.22, 81.84]
        points:
          - name: "特克斯八卦城"
            lat: 43.22
            lng: 81.84
            type: scenic
          - name: "喀拉峻·鲜花台"
            lat: 43.05
            lng: 81.90
            type: scenic
      - day: 6
        date: "6/18 周四"
        title: "喀拉峻全天"
        intensity: green
        km: "景区内"
        drive: "—"
        desc: "上午东喀拉峻·五花草甸徒步2-3h，五色野花+雪山背景。下午阔克苏大峡谷，九曲十八弯、鳄鱼湾，含游船。"
        tags:
          - ["scenic", "东喀拉峻·五花草甸"]
          - ["scenic", "阔克苏大峡谷"]
          - ["hike", "草甸徒步2-3h"]
          - ["stay", "特克斯县城"]
        schedule:
          - ["08:30", "区间车前往东喀拉峻"]
          - ["08:30-11:30", "五花草甸徒步（五色野花+雪山）"]
          - ["11:30", "景区内午餐"]
          - ["13:00", "区间车前往阔克苏大峡谷"]
          - ["13:30-16:30", "九曲十八弯、鳄鱼湾（含游船）"]
          - ["17:00", "返回景区门口"]
          - ["17:30", "驱车回特克斯县城"]
          - ["20:00", "晚餐：回族粉汤、烤包子"]
        tips: "峡谷游船有固定班次，注意末班时间。"
        food: "景区简餐；晚餐特克斯回族粉汤、大盘鸡"
        stay: "特克斯县城，250-400元/间"
        ticket: "阔克苏大峡谷 155元/人（门票+区间车+游船）"
        coordinates: [43.08, 82.00]
        points:
          - name: "东喀拉峻·五花草甸"
            lat: 43.08
            lng: 82.00
            type: scenic
          - name: "阔克苏大峡谷"
            lat: 43.02
            lng: 81.85
            type: scenic
      - day: 7
        date: "6/19 周五"
        title: "昭苏 → 夏塔古道轻徒步"
        intensity: yellow
        km: "210km"
        drive: "3.5h"
        desc: "核心徒步日！夏塔古道往返8-10km(3-4h)，正面对望木扎尔特冰川。沿途雪岭云杉、高山草甸、冰川融水。"
        tags:
          - ["hike", "夏塔古道3-4h"]
          - ["scenic", "木扎尔特冰川"]
          - ["food", "昭苏马奶酒"]
          - ["fuel", "昭苏加满油"]
        schedule:
          - ["08:00", "特克斯出发前往昭苏"]
          - ["09:30", "抵达昭苏县城，加油 ⛽"]
          - ["10:00", "前往夏塔景区"]
          - ["11:00", "抵达景区，购票进入"]
          - ["11:30-15:30", "夏塔古道轻徒步（往返8-10km）"]
          - ["12:30", "途中野餐/路餐"]
          - ["16:00", "返回景区门口，驱车回昭苏"]
          - ["20:00", "晚餐：清炖羊肉、马奶酒"]
        tips: "本行程最专业徒步日，穿好徒步鞋。带足水1.5L+/人。古道内无手机信号。温度10-18°C带冲锋衣。"
        food: "午餐自带路餐；晚餐清炖羊肉、薄皮包子、马奶酒"
        stay: "昭苏县城，200-350元/间"
        ticket: "夏塔 80元/人（门票+区间车）"
        coordinates: [43.16, 81.13]
        points:
          - name: "昭苏县城"
            lat: 43.16
            lng: 81.13
            type: city
          - name: "夏塔古道"
            lat: 42.85
            lng: 81.20
            type: scenic
      - day: 8
        date: "6/20 周六"
        title: "伊昭公路 → 薰衣草 → 赛里木湖"
        intensity: yellow
        km: "280km"
        drive: "5h"
        desc: "途经野狼谷，翻越安格列特达坂(3020m)。霍城薰衣草盛花期🌸。赛里木湖环湖自驾+月亮湾日落。"
        tags:
          - ["scenic", "🆕野狼谷"]
          - ["scenic", "伊昭公路·白石峰"]
          - ["scenic", "霍城薰衣草🌸"]
          - ["scenic", "🆕月亮湾日落"]
        schedule:
          - ["08:00", "昭苏出发，进入伊昭公路"]
          - ["09:00", "🆕 途经野狼谷（峡谷路段，停车拍照15min）"]
          - ["09:30", "翻越安格列特达坂（3020m）"]
          - ["10:00", "白石峰观景拍照"]
          - ["12:00", "午餐：察布查尔/伊宁路边"]
          - ["13:30-15:00", "霍城薰衣草花海（盛花期🌸）"]
          - ["15:30", "上G30高速前往赛里木湖"]
          - ["17:00", "抵达赛里木湖"]
          - ["17:30-19:00", "环湖自驾"]
          - ["19:00", "🆕 月亮湾停留（最经典机位，月牙形湖岸+雪山倒影）"]
          - ["20:00-21:30", "湖边漫步，等待日落"]
        tips: "出发前确认伊昭公路是否开放。月亮湾在环湖路西侧，日落时分最美。赛里木湖晚上极冷(5-10°C)。"
        food: "察布查尔锡伯族大饼、花花菜；湖区简餐"
        stay: "赛里木湖蒙古包300-600元 或 清水河镇酒店200-350元"
        ticket: "薰衣草 ~35元/人 + 赛里木湖 145元/人（旺季，含门票+区间车）"
        coordinates: [44.60, 81.17]
        points:
          - name: "野狼谷"
            lat: 43.10
            lng: 81.25
            type: scenic
          - name: "安格列特达坂"
            lat: 43.00
            lng: 81.30
            type: scenic
          - name: "霍城薰衣草"
            lat: 44.05
            lng: 80.85
            type: scenic
          - name: "赛里木湖"
            lat: 44.60
            lng: 81.17
            type: scenic
          - name: "月亮湾"
            lat: 44.58
            lng: 81.08
            type: scenic
      - day: 9
        date: "6/21 周日"
        title: "赛里木湖日出 → 伊宁机场"
        intensity: green
        km: "100km"
        drive: "1.5h"
        desc: "早起看赛里木湖日出🌅，果子沟大桥。伊宁还车，六星街/喀赞其民俗街闲逛，下午飞回。"
        tags:
          - ["scenic", "赛里木湖日出"]
          - ["scenic", "果子沟大桥"]
          - ["food", "伊宁玛丽莎冰淇淋"]
          - ["stay", "伊宁机场✈️"]
        schedule:
          - ["06:00", "赛里木湖日出🌅（提前到湖边）"]
          - ["07:30", "返回住处收拾，早餐"]
          - ["09:00", "出发，沿G30高速前往伊宁"]
          - ["10:00", "途经果子沟大桥"]
          - ["10:30", "抵达伊宁市区"]
          - ["11:00", "还车（确认无违章，拍照留证）"]
          - ["11:30", "逛六星街/喀赞其民俗街"]
          - ["13:00", "午餐：玛丽莎冰淇淋、烤肉"]
          - ["14:30", "前往伊宁机场"]
        tips: "还车前检查车辆拍照。刀具不能上飞机（需快递寄回）。伊宁机场小，安检快。"
        food: "伊宁玛丽莎冰淇淋、烤肉、凉皮"
        stay: ""
        ticket: ""
        coordinates: [44.48, 81.22]
        points:
          - name: "果子沟大桥"
            lat: 44.48
            lng: 81.22
            type: scenic
          - name: "伊宁机场"
            lat: 43.96
            lng: 81.33
            type: city
    route_segments:
      - dayId: 2
        startIdx: 0
        endIdx: 4
        from: "乌鲁木齐"
        to: "独山子"
        km: "250km"
        drive: "3h"
        road: "G30连霍高速"
        desc: "全程高速，路况好。抵达后务必加满油！"
        tip: "独库全程130km无加油站、无手机信号。"
      - dayId: 2
        startIdx: 4
        endIdx: 5
        from: "独山子"
        to: "安集海大峡谷"
        km: "40km"
        drive: "40min"
        road: "省道"
        desc: "独山子东北方向绕行，前往地球最美伤疤。"
        tip: "峡谷边无护栏，注意安全！停留约45min。"
      - dayId: 2
        startIdx: 5
        endIdx: 6
        from: "安集海大峡谷"
        to: "独山子"
        km: "40km"
        drive: "40min"
        road: "原路返回"
        desc: "返回独山子，准备进入独库公路北段。"
        tip: ""
      - dayId: 2
        startIdx: 6
        endIdx: 9
        from: "独山子"
        to: "哈希勒根达坂"
        km: "60km"
        drive: "1.5h"
        road: "独库公路北段"
        desc: "独库最险段！连续发卡弯爬升至3400m，翻越天山分水岭。"
        tip: "限速40km/h。可能有轻微高反，备葡萄糖。"
      - dayId: 2
        startIdx: 9
        endIdx: 11
        from: "哈希勒根达坂"
        to: "乔尔玛"
        km: "70km"
        drive: "1.5h"
        road: "独库公路北段"
        desc: "下山段，经天瀑布可停留拍照。抵达后参观乔尔玛烈士纪念碑。"
        tip: "通行时间9:00-20:00（北京时间），注意别超时。"
      - dayId: 3
        startIdx: 11
        endIdx: 12
        from: "乔尔玛"
        to: "唐布拉百里画廊"
        km: "30km"
        drive: "40min"
        road: "S315省道"
        desc: "进入百里画廊河谷段，雪山+草原+云杉交替出现。"
        tip: "免门票！随时停车拍照。"
      - dayId: 3
        startIdx: 12
        endIdx: 13
        from: "唐布拉百里画廊"
        to: "仙女湖"
        km: "20km"
        drive: "30min"
        road: "S315省道"
        desc: "画廊中段，驶向雪山碧湖仙女湖。"
        tip: "绕湖步行约30min，清晨光线最佳。"
      - dayId: 3
        startIdx: 13
        endIdx: 15
        from: "仙女湖"
        to: "那拉提镇"
        km: "70km"
        drive: "1.5h"
        road: "S315省道"
        desc: "画廊后半段至那拉提。沿途有哈萨克毡房可停留午餐。"
        tip: "路边毡房手抓肉值得一试。"
      - dayId: 4
        startIdx: 15
        endIdx: 16
        from: "那拉提镇"
        to: "空中草原"
        km: "景区内"
        drive: "区间车30min"
        road: "景区道路"
        desc: "区间车上山至海拔2000m+的空中草原，6月野花盛开。"
        tip: "上午光线好+避人流。紫外线极强！"
      - dayId: 4
        startIdx: 16
        endIdx: 18
        from: "空中草原"
        to: "那拉提镇"
        km: "景区内"
        drive: "区间车"
        road: "景区道路"
        desc: "经河谷草原返回镇上。巩乃斯河谷云杉光影。"
        tip: "可选骑马体验约100元/h。"
      - dayId: 5
        startIdx: 18
        endIdx: 21
        from: "那拉提"
        to: "特克斯"
        km: "150km"
        drive: "3h"
        road: "G218国道"
        desc: "伊犁河谷横穿，路况好。特克斯八卦城——全球唯一没有红绿灯的城市。"
        tip: "八卦城中心观光塔可俯瞰全貌。别忘加油。"
      - dayId: 5
        startIdx: 21
        endIdx: 22
        from: "特克斯"
        to: "喀拉峻·鲜花台"
        km: "30km"
        drive: "40min"
        road: "县道"
        desc: "南行进入喀拉峻景区，前往'人体草原'鲜花台。"
        tip: "景区门票140元/人。毡房夜间5-8°C。"
      - dayId: 6
        startIdx: 22
        endIdx: 23
        from: "西喀拉峻"
        to: "东喀拉峻·五花草甸"
        km: "景区内"
        drive: "区间车20min"
        road: "景区道路"
        desc: "前往五花草甸——五种颜色野花同时盛开，配雪山背景。"
        tip: "徒步2-3h，穿好鞋。"
      - dayId: 6
        startIdx: 23
        endIdx: 24
        from: "东喀拉峻"
        to: "阔克苏大峡谷"
        km: "景区内"
        drive: "区间车"
        road: "景区道路"
        desc: "下到峡谷，九曲十八弯+鳄鱼湾游船。"
        tip: "游船有固定班次，注意末班时间。155元/人。"
      - dayId: 6
        startIdx: 24
        endIdx: 25
        from: "阔克苏"
        to: "特克斯县城"
        km: "30km"
        drive: "40min"
        road: "县道"
        desc: "返回特克斯县城住宿。"
        tip: "晚餐推荐回族粉汤、烤包子。"
      - dayId: 7
        startIdx: 25
        endIdx: 26
        from: "特克斯"
        to: "昭苏"
        km: "75km"
        drive: "1.5h"
        road: "S220省道"
        desc: "伊犁河谷西行至昭苏。天马之乡，6月油菜花可能初开。"
        tip: "昭苏务必加满油！为明天伊昭公路做准备。"
      - dayId: 7
        startIdx: 26
        endIdx: 27
        from: "昭苏"
        to: "夏塔古道"
        km: "70km"
        drive: "1h"
        road: "县道"
        desc: "前往夏塔景区入口。本行程核心徒步，正面对望木扎尔特冰川。"
        tip: "古道内无信号。带水1.5L+/人。温度10-18°C带冲锋衣。"
      - dayId: 7
        startIdx: 27
        endIdx: 28
        from: "夏塔"
        to: "昭苏"
        km: "70km"
        drive: "1h"
        road: "原路返回"
        desc: "徒步结束返回昭苏县城休整。"
        tip: "晚餐推荐清炖羊肉、马奶酒。"
      - dayId: 8
        startIdx: 28
        endIdx: 29
        from: "昭苏"
        to: "安格列特达坂"
        km: "40km"
        drive: "1h"
        road: "伊昭公路"
        desc: "翻越天山！途经野狼谷峡谷路段，两侧峭壁陡峻。达坂顶3020m。"
        tip: "出发前确认伊昭公路是否开放。山顶风大极冷。"
      - dayId: 8
        startIdx: 29
        endIdx: 32
        from: "安格列特达坂"
        to: "霍城薰衣草"
        km: "120km"
        drive: "2h"
        road: "伊昭公路 → 省道"
        desc: "下山经察布查尔至霍城。东方普罗旺斯，6月盛花期紫色花海。"
        tip: "午餐可在察布查尔吃锡伯族大饼。薰衣草门票约35元。"
      - dayId: 8
        startIdx: 32
        endIdx: 35
        from: "霍城薰衣草"
        to: "赛里木湖"
        km: "120km"
        drive: "2h"
        road: "G30连霍高速"
        desc: "上高速直达赛里木湖。大西洋最后一滴眼泪。"
        tip: "湖边夜间5-10°C，极冷！旺季门票145元/人。"
      - dayId: 8
        startIdx: 35
        endIdx: 37
        from: "赛里木湖"
        to: "月亮湾环湖"
        km: "环湖"
        drive: "1.5h"
        road: "环湖公路"
        desc: "环湖自驾至月亮湾——最经典机位，月牙形湖岸配雪山倒影，日落时分金光洒湖面。"
        tip: "月亮湾在环湖路西侧，日落前1小时到达最佳。"
      - dayId: 9
        startIdx: 37
        endIdx: 38
        from: "赛里木湖"
        to: "果子沟大桥"
        km: "15km"
        drive: "20min"
        road: "G30连霍高速"
        desc: "飞跨果子沟峡谷，桥面距谷底200m，视觉震撼。"
        tip: "桥上不能停车，可在观景台拍照。"
      - dayId: 9
        startIdx: 38
        endIdx: 40
        from: "果子沟"
        to: "伊宁机场"
        km: "85km"
        drive: "1h"
        road: "G30连霍高速"
        desc: "高速直达伊宁。可逛六星街、喀赞其民俗街，吃玛丽莎冰淇淋。"
        tip: "还车前拍照留证。刀具不能上飞机需快递。"
    point_details:
      "乌鲁木齐":
        desc: "新疆首府，国际大巴扎汇聚南疆北疆特产，红山公园俯瞰全城。"
        tip: "实际作息比北京晚2h，天黑约22:30。"
      "安集海大峡谷":
        desc: "地球最美伤疤！垂直落差达300m，红黄灰绿多色岩层交错，被《中国国家地理》评为最美峡谷之一。航拍效果绝佳。"
        tip: "位于独山子东北约40km，往返约1.5h。谷边无护栏，注意安全！"
      "独山子":
        desc: "独库公路北段起点，克拉玛依下辖区。这里是进入独库前最后的补给站。"
        tip: "务必加满油！独库全程130km无加油站、无手机信号。"
      "哈希勒根达坂":
        desc: "海拔3400m，独库公路最高点，翻越天山分水岭。达坂顶常年积雪，南北两侧风光截然不同。"
        tip: "可能有轻微高反，备好葡萄糖。山顶风大温低。"
      "乔尔玛":
        desc: "独库公路北段终点，乔尔玛烈士纪念碑——168名筑路官兵长眠于此。小镇虽小但住宿餐饮齐备。"
        tip: "旺季住宿紧张，务必提前预订！"
      "唐布拉百里画廊":
        desc: "免门票！沿S315省道自驾穿行，河谷两侧雪山+草原+云杉交替，随走随停，全程约100km。"
        tip: "免门票，随时停车拍照。河谷段可轻徒步1-2h。"
      "仙女湖":
        desc: "雪山倒映碧湖，湖面如镜。绕湖步行约30分钟，六月湖畔野花点缀。"
        tip: "清晨或傍晚光线最佳，适合倒影摄影。"
      "那拉提镇":
        desc: "那拉提景区门户小镇，住宿餐饮集中，是游览空中草原和河谷草原的大本营。"
        tip: "景区套票159元/人（门票95+空中草原区间车40+河谷区间车24）。"
      "那拉提·空中草原":
        desc: "海拔2000m+的高山草甸，雪山近在咫尺。6月野花盛开，紫色鼠尾草、黄色金莲花铺满山坡。徒步3-4h。"
        tip: "先去空中草原（上午光线好+避人流）。紫外线极强，SPF50+必涂！"
      "那拉提·河谷草原":
        desc: "巩乃斯河穿流而过，河谷两侧云杉成林，光影交错。可选骑马体验（约100元/h）。"
        tip: "下午去河谷草原，光线透过云杉很美。"
      "特克斯八卦城":
        desc: "全球唯一没有红绿灯的城市！城市布局严格按八卦形设计，航拍可见完整八卦图案。"
        tip: "城中心观光塔可俯瞰八卦全貌。"
      "喀拉峻·鲜花台":
        desc: "西喀拉峻核心景点——'人体草原'，草甸曲线优美如人体线条。6月野花铺满，配合远处雪山，画面震撼。"
        tip: "景区门票140元/人（含门票+区间车）。先西后东，两天玩完。"
      "东喀拉峻·五花草甸":
        desc: "五种颜色野花同时盛开的高山草甸，配合远处雪山背景，是喀拉峻最精华的徒步路段。2-3h徒步。"
        tip: "穿好徒步鞋，草甸有坡度。"
      "阔克苏大峡谷":
        desc: "喀拉峻南侧的深切峡谷，九曲十八弯蜿蜒于峡谷之间。鳄鱼湾因岩石形似鳄鱼得名。含游船体验。"
        tip: "游船有固定班次，注意末班时间。门票155元/人（含区间车+游船）。"
      "昭苏县城":
        desc: "伊犁河谷西端小城，以天马和油菜花闻名。6月油菜花可能初开。补给加油点。"
        tip: "务必加满油！为明日伊昭公路做准备。"
      "夏塔古道":
        desc: "本行程核心徒步！往返8-10km（3-4h），正面对望木扎尔特冰川。沿途雪岭云杉、高山草甸、冰川融水溪流。"
        tip: "最专业徒步日，穿好鞋。带水1.5L+/人。古道内无信号。10-18°C带冲锋衣。门票80元/人。"
      "野狼谷":
        desc: "伊昭公路上的峡谷路段，两侧峭壁陡峻，公路在峡谷底部穿行，气势磅礴。"
        tip: "路边可短暂停车拍照（约15min），注意来车。"
      "安格列特达坂":
        desc: "海拔3020m，伊昭公路最高点。达坂顶视野开阔，南望昭苏盆地，北望伊犁河谷。"
        tip: "山顶风大气温低，备好外套。"
      "霍城薰衣草":
        desc: "东方普罗旺斯！6月6日-7月3日盛花期，紫色花海一望无际。解忧公主薰衣草园最成熟。"
        tip: "门票约35元/人。建议下午去，光线柔和。可买薰衣草精油伴手礼。"
      "赛里木湖":
        desc: "大西洋最后一滴眼泪，海拔2073m的高山湖泊。湖水随光线变换蓝绿色调，环湖一圈约70km。"
        tip: "旺季门票145元/人（含区间车）。湖边夜间5-10°C，极冷！自驾可环湖。"
      "月亮湾":
        desc: "赛里木湖最经典摄影机位！月牙形湖岸线配合远处雪山倒影，日落时分金光洒湖面，绝美。"
        tip: "位于环湖路西侧，日落前1小时到达最佳。"
      "果子沟大桥":
        desc: "全长700m，中国第一座双塔双索面钢桁梁斜拉桥。桥面距谷底200m，穿越果子沟时视觉震撼。"
        tip: "桥上不能停车，可在观景台拍照。"
      "伊宁机场":
        desc: "行程终点。伊宁市区可逛六星街（俄式建筑+多民族文化）和喀赞其民俗街（蓝色小巷）。"
        tip: "还车前检查车辆拍照。刀具不能上飞机需快递寄回。机场小安检快。"
    point_photos:
      "安集海大峡谷":
        - img:
            thumb: "photos/thumb/30682502.jpg"
            hd: "photos/hd/30682502.jpg"
          title: "彩色岩层俯瞰"
          reason: "站在崖边俯瞰300m深谷，红黄灰绿四色岩层如大地调色盘，视觉冲击力极强"
        - img:
            thumb: "photos/thumb/2440061.jpg"
            hd: "photos/hd/2440061.jpg"
          title: "峡谷光影层次"
          reason: "阳光照射下岩壁纹理清晰可见，砂岩层的侵蚀造型如同抽象艺术"
        - img:
            thumb: "photos/thumb/2855113.jpg"
            hd: "photos/hd/2855113.jpg"
          title: "地质奇观近景"
          reason: "走近观察彩色岩层的细节纹理，感受亿万年地质运动的力量"
      "哈希勒根达坂":
        - img:
            thumb: "photos/thumb/30428584.jpg"
            hd: "photos/hd/30428584.jpg"
          title: "雪山盘山公路"
          reason: "海拔3400m的独库最高点，连续发卡弯在雪山间蜿蜒，公路摄影经典场景"
        - img:
            thumb: "photos/thumb/10743395.jpg"
            hd: "photos/hd/10743395.jpg"
          title: "达坂顶全景"
          reason: "达坂顶视野开阔，南北两侧风光截然不同的天山分水岭"
        - img:
            thumb: "photos/thumb/7433003.jpg"
            hd: "photos/hd/7433003.jpg"
          title: "云端穿行"
          reason: "常有云雾缭绕在达坂两侧，驾车穿行如在云端之上"
      "唐布拉百里画廊":
        - img:
            thumb: "photos/thumb/17399018.jpg"
            hd: "photos/hd/17399018.jpg"
          title: "河谷草原全景"
          reason: "雪山+河谷+云杉+草原四重景观交替出现，自驾随走随停"
        - img:
            thumb: "photos/thumb/9268741.jpg"
            hd: "photos/hd/9268741.jpg"
          title: "蜿蜒河谷晨雾"
          reason: "百里画廊最精华的河谷段，晨雾中河水在绿色草甸间蜿蜒如带"
        - img:
            thumb: "photos/thumb/1166209.jpg"
            hd: "photos/hd/1166209.jpg"
          title: "山谷牧场风光"
          reason: "路边哈萨克牧民的毡房散落草原，雪山脚下的游牧画卷"
      "仙女湖":
        - img:
            thumb: "photos/thumb/29917693.jpg"
            hd: "photos/hd/29917693.jpg"
          title: "雪山倒影镜湖"
          reason: "清晨湖面如镜，雪山完美倒映在碧蓝湖水中，摄影经典构图"
        - img:
            thumb: "photos/thumb/1525041.jpg"
            hd: "photos/hd/1525041.jpg"
          title: "碧湖近景"
          reason: "六月湖畔野花点缀，碧水雪山的色彩层次丰富"
        - img:
            thumb: "photos/thumb/32850470.jpg"
            hd: "photos/hd/32850470.jpg"
          title: "湖面光影变幻"
          reason: "不同时段光线下湖面色彩不断变化，30分钟绕湖可赏多重光影"
      "那拉提·空中草原":
        - img:
            thumb: "photos/thumb/18131358.jpg"
            hd: "photos/hd/18131358.jpg"
          title: "雪山下野花海"
          reason: "海拔2000m+的高山草甸，六月野花盛开，紫色鼠尾草与金莲花铺满山坡"
        - img:
            thumb: "photos/thumb/1624496.jpg"
            hd: "photos/hd/1624496.jpg"
          title: "草甸远眺雪山"
          reason: "天山雪峰近在咫尺，雪线以下是翠绿草甸，色彩对比震撼"
        - img:
            thumb: "photos/thumb/33878825.jpg"
            hd: "photos/hd/33878825.jpg"
          title: "野花特写"
          reason: "3-4h徒步穿越不同海拔的草甸带，每个高度都有不同的花种"
        - img:
            thumb: "photos/thumb/18844613.jpg"
            hd: "photos/hd/18844613.jpg"
          title: "草原日光"
          reason: "阳光洒满高山草甸，金色光线下的野花海格外绚烂"
      "那拉提·河谷草原":
        - img:
            thumb: "photos/thumb/5226950.jpg"
            hd: "photos/hd/5226950.jpg"
          title: "云杉光影河谷"
          reason: "午后阳光穿过巩乃斯河谷的雪岭云杉，光影斑驳如油画"
        - img:
            thumb: "photos/thumb/3854867.jpg"
            hd: "photos/hd/3854867.jpg"
          title: "河边骑马体验"
          reason: "沿巩乃斯河骑马漫步，用马背视角看河谷风光"
        - img:
            thumb: "photos/thumb/1271620.jpg"
            hd: "photos/hd/1271620.jpg"
          title: "河谷清溪"
          reason: "冰川融水汇成的清澈小溪在草甸间流淌，是徒步休憩的好去处"
      "特克斯八卦城":
        - img:
            thumb: "photos/thumb/13663888.jpg"
            hd: "photos/hd/13663888.jpg"
          title: "航拍城市全貌"
          reason: "全球唯一八卦形城市，航拍可见完整的八卦街道布局，没有红绿灯"
        - img:
            thumb: "photos/thumb/2591408.jpg"
            hd: "photos/hd/2591408.jpg"
          title: "俯瞰河谷小城"
          reason: "城中心观光塔俯瞰八卦形道路交汇，体验独一无二的城市设计"
        - img:
            thumb: "photos/thumb/18179168.jpg"
            hd: "photos/hd/18179168.jpg"
          title: "河谷日落"
          reason: "伊犁河谷中的小城在日落时分被染上金色，宁静悠远"
      "喀拉峻·鲜花台":
        - img:
            thumb: "photos/thumb/19148385.jpg"
            hd: "photos/hd/19148385.jpg"
          title: "人体草原曲线"
          reason: "草甸起伏的曲线如人体线条般优美，配合野花色彩，喀拉峻标志性画面"
        - img:
            thumb: "photos/thumb/18131358.jpg"
            hd: "photos/hd/18131358.jpg"
          title: "六月鲜花台全景"
          reason: "六月野花铺满整个山坡，红黄紫绿多色交织的花海"
        - img:
            thumb: "photos/thumb/17399018.jpg"
            hd: "photos/hd/17399018.jpg"
          title: "远眺雪山草原"
          reason: "前景花海+中景草甸+远景雪山的完美三层构图"
      "东喀拉峻·五花草甸":
        - img:
            thumb: "photos/thumb/33878825.jpg"
            hd: "photos/hd/33878825.jpg"
          title: "五色野花草甸"
          reason: "五种颜色的野花同时盛开——红色虞美人、黄色金莲花、紫色鼠尾草、白色雪莲、蓝色勿忘我"
        - img:
            thumb: "photos/thumb/1624496.jpg"
            hd: "photos/hd/1624496.jpg"
          title: "草甸徒步"
          reason: "2-3h徒步穿越最精华的花海路段，脚下是花，远处是雪山"
        - img:
            thumb: "photos/thumb/18844613.jpg"
            hd: "photos/hd/18844613.jpg"
          title: "花海雪山合影"
          reason: "坐在花海中，以天山雪峰为背景——喀拉峻最受欢迎的打卡构图"
      "阔克苏大峡谷":
        - img:
            thumb: "photos/thumb/17501256.jpg"
            hd: "photos/hd/17501256.jpg"
          title: "九曲十八弯俯瞰"
          reason: "河流在峡谷间蜿蜒出S形曲线，航拍视角下如丝带铺在绿毯上"
        - img:
            thumb: "photos/thumb/11408803.jpg"
            hd: "photos/hd/11408803.jpg"
          title: "河谷蜿蜒全景"
          reason: "岩石形如鳄鱼卧在河边的鳄鱼湾，是阔克苏最具辨识度的地标"
        - img:
            thumb: "photos/thumb/23976499.jpg"
            hd: "photos/hd/23976499.jpg"
          title: "峡谷绿谷航拍"
          reason: "乘船穿行峡谷之间，仰望两侧绝壁，水面视角更显峡谷雄伟"
      "夏塔古道":
        - img:
            thumb: "photos/thumb/5226950.jpg"
            hd: "photos/hd/5226950.jpg"
          title: "冰川雪山正面"
          reason: "古道尽头正面对望木扎尔特冰川，蓝白色冰舌从雪山延伸而下"
        - img:
            thumb: "photos/thumb/12879017.jpg"
            hd: "photos/hd/12879017.jpg"
          title: "林间古道"
          reason: "古道两侧雪岭云杉高耸入云，阳光透过树冠洒落斑驳光影"
        - img:
            thumb: "photos/thumb/1271620.jpg"
            hd: "photos/hd/1271620.jpg"
          title: "冰川融水溪流"
          reason: "脚下是冰川融水汇成的清澈溪流，水色碧蓝如玉"
        - img:
            thumb: "photos/thumb/19225609.jpg"
            hd: "photos/hd/19225609.jpg"
          title: "高山草甸步道"
          reason: "古道沿途高山草甸上野花遍布，雪山、云杉、草甸、溪流四重景观一次集齐"
      "野狼谷":
        - img:
            thumb: "photos/thumb/10456256.jpg"
            hd: "photos/hd/10456256.jpg"
          title: "峡谷公路穿行"
          reason: "两侧峭壁陡峻，公路在狭窄峡谷底部穿行，气势磅礴"
        - img:
            thumb: "photos/thumb/17742192.jpg"
            hd: "photos/hd/17742192.jpg"
          title: "仰望峡谷绝壁"
          reason: "从谷底仰望两侧近乎垂直的岩壁，峡谷河流奔腾而过"
        - img:
            thumb: "photos/thumb/11513527.jpg"
            hd: "photos/hd/11513527.jpg"
          title: "公路摄影机位"
          reason: "峡谷中的公路向远处延伸，经典的公路旅行摄影构图"
      "安格列特达坂":
        - img:
            thumb: "photos/thumb/30428584.jpg"
            hd: "photos/hd/30428584.jpg"
          title: "达坂顶俯瞰"
          reason: "海拔3020m的达坂顶视野开阔，北望伊犁河谷绿色盆地"
        - img:
            thumb: "photos/thumb/10743395.jpg"
            hd: "photos/hd/10743395.jpg"
          title: "伊昭公路盘山段"
          reason: "与独库齐名的天山翻越公路，盘山弯道配合雪山背景"
        - img:
            thumb: "photos/thumb/30943959.jpg"
            hd: "photos/hd/30943959.jpg"
          title: "雪山公路"
          reason: "回望来路，昭苏盆地如一块碧绿翡翠镶嵌在天山群峰之间"
      "霍城薰衣草":
        - img:
            thumb: "photos/thumb/17285752.jpg"
            hd: "photos/hd/17285752.jpg"
          title: "紫色花海全景"
          reason: "6月盛花期，一望无际的紫色花海，中国最大的薰衣草种植基地"
        - img:
            thumb: "photos/thumb/5546078.jpg"
            hd: "photos/hd/5546078.jpg"
          title: "花田蓝天"
          reason: "走进花田小径，紫色花丛齐腰高，人像摄影的绝佳场景"
        - img:
            thumb: "photos/thumb/723880.jpg"
            hd: "photos/hd/723880.jpg"
          title: "薰衣草日落"
          reason: "夕阳下的薰衣草花海泛着金紫色光泽，是一天中最梦幻的时刻"
        - img:
            thumb: "photos/thumb/27578152.jpg"
            hd: "photos/hd/27578152.jpg"
          title: "薰衣草特写"
          reason: "近距离拍摄薰衣草花穗，紫色花瓣在柔光中的微距画面"
      "赛里木湖":
        - img:
            thumb: "photos/thumb/273066.jpg"
            hd: "photos/hd/273066.jpg"
          title: "湖面蓝宝石色"
          reason: "大西洋最后一滴眼泪，湖水随光线在宝石蓝和翡翠绿之间变换"
        - img:
            thumb: "photos/thumb/29917693.jpg"
            hd: "photos/hd/29917693.jpg"
          title: "雪山环湖全景"
          reason: "四周天山雪峰环抱高山湖泊，环湖一圈70km每个角度都是大片"
        - img:
            thumb: "photos/thumb/5614589.jpg"
            hd: "photos/hd/5614589.jpg"
          title: "湖畔冬韵"
          reason: "赛里木湖畔雪山映衬碧水，即使六月湖边也有凛冽之美"
        - img:
            thumb: "photos/thumb/32658872.jpg"
            hd: "photos/hd/32658872.jpg"
          title: "雪山湖面倒影"
          reason: "无风时湖面完美倒映天山雪峰，清晨日出时湖面金光万丈"
      "月亮湾":
        - img:
            thumb: "photos/thumb/1574843.jpg"
            hd: "photos/hd/1574843.jpg"
          title: "月牙形湖岸线"
          reason: "赛里木湖最经典机位！月牙形湖岸弧线优美，配合远处雪山倒影"
        - img:
            thumb: "photos/thumb/1525041.jpg"
            hd: "photos/hd/1525041.jpg"
          title: "碧水雪山"
          reason: "日落时分金光洒在月牙形湖面上，天空从蓝渐变到橙红"
        - img:
            thumb: "photos/thumb/32850470.jpg"
            hd: "photos/hd/32850470.jpg"
          title: "湖面倒影"
          reason: "无风时湖面完美倒映天山雪峰，上下对称的镜像世界"
      "果子沟大桥":
        - img:
            thumb: "photos/thumb/33431680.jpg"
            hd: "photos/hd/33431680.jpg"
          title: "大桥对称视角"
          reason: "钢桁梁斜拉桥的对称结构美感，工程奇迹与力学之美"
        - img:
            thumb: "photos/thumb/2559941.jpg"
            hd: "photos/hd/2559941.jpg"
          title: "缆索仰拍"
          reason: "仰望斜拉桥缆索如琴弦般排列，现代工程的几何之美"
        - img:
            thumb: "photos/thumb/28472064.jpg"
            hd: "photos/hd/28472064.jpg"
          title: "峡谷大桥日落"
          reason: "桥面距谷底200m，日落时分飞跨峡谷的壮观景象"
    ---
  YAML

  content = frontmatter + "\n" + markdown_content

  guidebook = Guidebook.find_or_initialize_by(title: "新疆伊犁 9 日自驾路书")
  guidebook.author = user
  guidebook.content = content
  guidebook.published = true
  guidebook.save!

  puts "Seeded guidebook: 新疆伊犁 9 日自驾路书"
else
  puts "Source markdown not found at #{markdown_path}, skipping seed."
end
