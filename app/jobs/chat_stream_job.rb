class ChatStreamJob < ApplicationJob
  queue_as :default

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
      chat = RubyLLM.chat(model: ENV.fetch("LLM_MODEL", "moonshotai/Kimi-K2-Instruct-0905"), provider: :openai, assume_model_exists: true)
      chat.with_instructions(system_prompt(tour))

      AITools::Schema.all.each { |tool| chat.with_tool(tool.new) }

      prior = conversation.messages.order(:created_at)[0..-2].to_a
      replay_history(chat, prior)

      latest = conversation.messages.order(:created_at).last.content
      full_text = "".dup

      chat.ask(latest) do |event|
        case event.type
        when :tool_call_start
          broadcast(channel, type: "tool_call_start", name: event.name, arguments: event.arguments, id: event.id)
        when :tool_call_result
          broadcast(channel, type: "tool_call_result", id: event.id, result: event.result)
        when :text
          full_text << event.delta
          broadcast(channel, type: "assistant_text", delta: event.delta)
        end
      end

      full_text
    end

    def replay_history(chat, prior_messages)
      prior_messages.each do |m|
        chat.messages << RubyLLM::Message.new(role: m.role.to_sym, content: m.content)
      end
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
