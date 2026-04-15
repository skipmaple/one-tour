class ChatStreamJob < ApplicationJob
  queue_as :default

  # Short-word token-loop pattern we've seen when a local/Kimi-style model
  # degrades mid-stream, e.g. "DIN DIN DIN DIN DIN DIN…". Replaying such a
  # prior assistant message into chat history reliably re-triggers the
  # same degenerate loop on the next turn. See CLAUDE.md (load-bearing).
  KIMI_LOOP_PATTERN  = /(\S{1,4})(\s+\1){5,}/
  KIMI_MAX_CONTENT   = 20_000

  def perform(conversation_id, tour_id, user_id)
    conversation = Conversation.find(conversation_id)
    tour         = Tour.find(tour_id)
    channel      = "chat_tour_#{tour_id}_user_#{user_id}"

    full_text = stream_response(conversation, tour, channel)
    save_assistant_message(conversation, full_text)
    broadcast(channel, type: "complete", content: full_text)
  rescue => e
    broadcast(channel, type: "error", message: e.message)
  end

  private
    def stream_response(conversation, tour, channel)
      chat = RubyLLM.chat(
        model: ENV.fetch("LLM_MODEL", "moonshotai/Kimi-K2-Instruct-0905"),
        provider: :openai,
        assume_model_exists: true
      )
      chat.with_instructions(system_prompt(tour))
      AITools::Schema.all.each { |tool| chat.with_tool(tool) }

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
        你通过调用工具修改 Tour / Day / Activity，不要直接输出 JSON 或 Markdown。

        ## 宪法约束（本程独立）
        #{tour.constitution.map { |k, v| "- #{k}: #{v}" }.join("\n")}

        ## 工具
        #{AITools::Schema.to_prompt_description}

        ## 交互原则
        - 先调用工具修改状态，再用自然语言简要解释
        - 需要时调用 run_constitution_check 验证，违反硬约束要主动提议修正
        - 需要 POI 或坐标时调用 search_poi，不要编造经纬度；从返回的候选里选一条 add_activity
      PROMPT
    end
end
