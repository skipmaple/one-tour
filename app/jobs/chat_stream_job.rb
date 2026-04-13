class ChatStreamJob < ApplicationJob
  queue_as :default

  def perform(conversation_id, guidebook_id, user_id, mode = "ask")
    conversation = Conversation.find(conversation_id)
    guidebook = Guidebook.find(guidebook_id)
    channel = "chat_guidebook_#{guidebook_id}_user_#{user_id}"

    full_response = stream_llm_response(conversation, guidebook, channel, mode)
    save_and_broadcast_complete(conversation, guidebook, channel, full_response)
  end

  private
    def stream_llm_response(conversation, guidebook, channel, mode)
      model = ENV.fetch("LLM_MODEL", "qwen3.5-122b-a10b")
      chat = RubyLLM.chat(model: model, provider: :openai, assume_model_exists: true)
      chat.with_instructions(system_prompt(guidebook, mode))
      chat.with_tool(GeocodeTool)

      all_messages = conversation.messages.order(:created_at).to_a
      replay_history(chat, all_messages[0..-2])
      latest_message = all_messages.last.content

      full_response = ""

      chat.ask(latest_message) do |chunk|
        if chunk.content
          full_response << chunk.content
          ActionCable.server.broadcast(channel, { type: "chunk", content: chunk.content })
        end
      end

      full_response
    rescue => e
      ActionCable.server.broadcast(channel, { type: "error", content: e.message })
      ""
    end

    def replay_history(chat, prior_messages)
      prior_messages.each do |msg|
        chat.messages << RubyLLM::Message.new(role: msg.role.to_sym, content: msg.content)
      end
    end

    def save_and_broadcast_complete(conversation, guidebook, channel, full_response)
      if full_response.present?
        conversation.messages.create!(role: :assistant, content: full_response)
      end

      has_frontmatter = full_response.strip.start_with?("---")

      ActionCable.server.broadcast(channel, {
        type: "complete",
        content: full_response,
        has_guidebook_content: has_frontmatter
      })
    end

    def system_prompt(guidebook, mode)
      existing_content = if guidebook.frontmatter_cache.present?
        "\n\n当前路书概要：\n#{guidebook.frontmatter_cache.slice('title', 'date_range', 'days').to_yaml}"
      else
        ""
      end

      plan_mode_instruction = if mode == "plan"
        "\n\n你现在处于计划模式。只描述你打算做的变更，不要输出完整路书内容。用列表说明将要增删改的内容。"
      else
        ""
      end

      <<~PROMPT
        你是一个旅行规划助手。#{existing_content}

        当用户要求生成或修改路书时，输出完整的 Markdown 文件（以 --- 包裹 YAML frontmatter，后跟 Markdown 正文）。
        当用户只是提问（不需要修改路书）时，直接回答即可，不要输出 frontmatter。

        ## Schema 参考
        #{FrontmatterSchema.to_prompt_description}

        ## 关键格式规则

        1. coordinates 是单个坐标对 [lat, lng]（仅 2 个数字），表示当天主要目的地。例如：coordinates: [43.82, 87.61]。绝对不能放 4 个数字。
        2. 每个 point 必须有 lat 和 lng，使用 geocode 工具获取精确坐标，不要编造。
        3. schedule 每项是二元数组：["时间", "活动"]，如 ["09:00", "出发前往景区"]
        4. tags 每项是二元数组：["类型key", "显示文字"]，如 ["scenic", "赛里木湖"]
        5. route_coordinates、startIdx/endIdx、point_photos 不需要生成。

        ## 路书结构要求

        路书文件由两部分组成，缺一不可：

        **第一部分：YAML frontmatter**（--- 包裹）— 给机器解析的结构化数据
        **第二部分：Markdown 正文**（--- 之后）— 给人阅读的详细行程描述

        Markdown 正文必须包含：
        - # 标题
        - ## 行程总览（表格，列出每天的行程、里程、强度）
        - 每天一个段落，格式为 ### Dn · 日期 强度emoji 标题，包含：
          - 时间线表格（| 时间 | 事项 |）
          - 🍽️ 美食推荐
          - 🏨 住宿建议
          - 📝 当日提醒

        ## 单天输出示例

        frontmatter 中的一天：
        ```yaml
          - day: 1
            date: "6/13 周六"
            title: "抵达乌鲁木齐"
            intensity: green
            km: "—"
            drive: "—"
            desc: "航班抵达，市区休整，适应时差。"
            coordinates: [43.825, 87.617]
            points:
              - name: "乌鲁木齐"
                lat: 43.825
                lng: 87.617
                type: city
            schedule:
              - ["下午", "航班抵达乌鲁木齐"]
              - ["19:00", "采购路上零食和水"]
              - ["20:00", "晚餐：大巴扎附近"]
            tags:
              - ["food", "大巴扎美食"]
              - ["stay", "市区酒店"]
            tips: "新疆实际作息比北京晚2h"
            food: "海尔巴格餐厅、血站大盘鸡"
            stay: "乌鲁木齐市区，280-400元/间"
        ```

        对应的 Markdown 正文段落：
        ```markdown
        ### D1 · 6月13日（周六）🟢 抵达乌鲁木齐

        | 时间 | 事项 |
        |------|------|
        | 下午 | 航班抵达乌鲁木齐天山国际机场 |
        | 19:00 | 采购路上零食和水 |
        | 20:00 | 晚餐：大巴扎附近 |

        🍽️ **美食推荐**：海尔巴格餐厅、血站大盘鸡
        🏨 **住宿**：乌鲁木齐市区，280-400元/间
        📝 **提醒**：新疆实际作息比北京晚2h
        ```#{plan_mode_instruction}
      PROMPT
    end
end
