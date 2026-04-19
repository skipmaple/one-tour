class ChatStreamJob < ApplicationJob
  queue_as :default

  # Short-word token-loop pattern we've seen when a local/Kimi-style model
  # degrades mid-stream, e.g. "DIN DIN DIN DIN DIN DIN…". Replaying such a
  # prior assistant message into chat history reliably re-triggers the
  # same degenerate loop on the next turn. See CLAUDE.md (load-bearing).
  KIMI_LOOP_PATTERN  = /(\S{1,4})(\s+\1){5,}/
  KIMI_MAX_CONTENT   = 20_000
  ONBOARDING_SENTINEL = "__onboarding_start__".freeze

  def perform(conversation_id, tour_id, user_id)
    conversation = Conversation.find(conversation_id)
    tour         = Tour.find(tour_id)
    user         = User.find(user_id)
    channel      = "chat_tour_#{tour_id}_user_#{user_id}"

    full_text = stream_response(conversation, tour, user, channel)
    save_assistant_message(conversation, full_text)
    broadcast(channel, type: "complete", content: full_text)
  rescue => e
    Sentry.capture_exception(e, extra: {
      conversation_id: conversation_id,
      tour_id: tour_id,
      user_id: user_id
    })
    broadcast(channel, type: "error", message: e.message)
  end

  private
    def stream_response(conversation, tour, user, channel)
      chat = RubyLLM.chat(
        model: ENV.fetch("LLM_MODEL", "moonshotai/Kimi-K2-Instruct-0905"),
        provider: :openai,
        assume_model_exists: true
      )
      chat.with_instructions(system_prompt(tour))
      # Bind tour+user into each tool instance so the LLM never sees a tour_id
      # param (it cannot hallucinate or target a foreign tour) and every DB
      # lookup is already scoped to the authorised tour.
      AITools::Schema.all.each { |tool_class| chat.with_tool(tool_class.new(tour: tour, user: user)) }

      prior = conversation.messages.order(:created_at)[0..-2].to_a
      replay_history(chat, prior)

      attach_tool_callbacks(chat, channel)

      latest = conversation.messages.order(:created_at).last.content
      full_text = "".dup

      chat.ask(latest) do |chunk|
        text = chunk.content.to_s
        next if text.empty?
        full_text << text
        broadcast(channel, type: "assistant_text", delta: text)
      end

      full_text
    end

    def attach_tool_callbacks(chat, channel)
      # Tool calls and results fire strictly in sequence inside
      # RubyLLM::Chat#handle_tool_calls, so a single ivar-like local is
      # enough to correlate a result back to the call it came from.
      current_call_id = nil

      chat.on_tool_call do |tool_call|
        current_call_id = tool_call.id
        broadcast(channel,
          type: "tool_call_start",
          id: tool_call.id,
          name: tool_call.name,
          arguments: tool_call.arguments
        )
      end

      chat.on_tool_result do |result|
        broadcast(channel, type: "tool_call_result", id: current_call_id, result: result)
        current_call_id = nil
      end
    end

    def replay_history(chat, prior_messages)
      prior_messages.each do |m|
        next if degenerate_assistant_output?(m)
        chat.messages << RubyLLM::Message.new(role: m.role.to_sym, content: m.content)
      end
    end

    def degenerate_assistant_output?(message)
      return false unless message.role.to_s == "assistant"
      content = message.content.to_s
      content.length > KIMI_MAX_CONTENT || content.match?(KIMI_LOOP_PATTERN)
    end

    def save_assistant_message(conversation, content)
      conversation.messages.create!(role: :assistant, content: content) if content.present?
    end

    def broadcast(channel, **payload)
      ActionCable.server.broadcast(channel, payload)
    end

    def system_prompt(tour)
      <<~PROMPT
        你是一个旅行规划助手。当前 Tour：#{tour.title}。
        所有 Day / Activity 工具已经自动绑定到这个 Tour —— 你不需要（也无法）
        指定目标 Tour，操作必然发生在当前 Tour 上。
        你通过调用工具修改 Day / Activity，不要直接输出 JSON 或 Markdown。

        ## 宪法约束（本程独立）
        #{tour.constitution.map { |k, v| "- #{k}: #{v}" }.join("\n")}

        ## 当前 Tour 状态
        - Days: #{tour.days.count}
        - Activities: #{tour.activities.count}

        ## 工具
        #{AITools::Schema.to_prompt_description}

        ## 交互原则
        - 先调用工具修改状态，再用自然语言简要解释
        - 需要时调用 run_constitution_check 验证，违反硬约束要主动提议修正
        - 需要 POI 或坐标时调用 search_poi，不要编造经纬度；从返回的候选里选一条 add_activity
        - **不要在回复里使用 emoji 装饰**（👋 🎉 🗺️ 之类）。纯中文 + 必要的 Markdown。

        ## Onboarding 模式

        如果用户消息是 "#{ONBOARDING_SENTINEL}"，按以下节奏开始 4 轮对话：

        ① "欢迎，我先问几个问题，搞清楚方向再开始。\n这次想去哪？（例如：伊犁环线、川西、河西走廊）"
        ② 用户答完 ① 后："几天？我会据此建 Day 骨架。"
        ③ 用户答完 ② 后："几个人、什么车？"
        ④ 用户答完 ③ 后："主要想看什么？（景观 / 人文 / 带娃 / 徒步…）"

        一次只问一件事，不要一口气问 4 个。

        收到第 ④ 个回答后，开始批量执行：
        - 当前 Tour 已有 #{tour.days.count} 个 Day（day_index 从 1 起步）。如果用户说 N 天，调用 create_day 创建 day_index = (#{tour.days.count} + 1)..N，跳过已存在的天。
        - 调 search_poi 搜索用户提到的地点，从候选里挑 add_activity 到 backlog（不指定 day_id，让用户自己拖）。
        - 添加 ~20-30 个 POI 即可，太多用户处理不过来。
        - 添加完毕回一句简短总结："已往 backlog 加了 N 个候选 + N 个 Day 骨架，往左拖到对应 Day 即可。"

        如果用户首条消息**不是** sentinel（例如直接说 "我想去伊犁"），跳过欢迎语，直接确认+进入第 ② 个问题。
      PROMPT
    end
end
