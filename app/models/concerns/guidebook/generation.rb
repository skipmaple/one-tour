module Guidebook::Generation
  extend ActiveSupport::Concern

  def generate_from_document(file_path, source_type:, user:)
    conversation = conversations.find_or_create_by(user: user)
    conversation.messages.create!(role: :user, content: "请根据以下#{source_type}内容生成路书")

    response = ask_llm(file_path)

    conversation.messages.create!(role: :assistant, content: response.content)
    update!(content: response.content)
  end

  private
    def ask_llm(file_path)
      model = ENV.fetch("LLM_MODEL", "qwen3.5-122b-a10b")
      chat = RubyLLM.chat(model: model, provider: :openai, assume_model_exists: true)
      chat.with_instructions(generation_system_prompt)
      chat.with_tool(GeocodeTool)
      chat.ask("请根据这份文档生成完整的旅行路书，使用指定的 frontmatter 格式", with: file_path)
    end

    def generation_system_prompt
      <<~PROMPT
        你是一个旅行规划助手。请根据用户提供的文档生成结构化路书。

        生成内容必须是一个完整的 Markdown 文件，文件头部以 --- 包裹 YAML frontmatter，后面跟 Markdown 正文。

        输出格式要求：
        #{FrontmatterSchema.to_prompt_description}

        重要规则：
        - 每天必须有 coordinates 字段，使用 geocode 工具获取精确坐标
        - 每个 point 必须有 lat 和 lng，使用 geocode 工具获取
        - 坐标格式为 [纬度, 经度]，先纬后经
        - 不要编造 GPS 坐标，必须通过 geocode 工具获取
        - route_coordinates 和 startIdx/endIdx 不需要生成，系统会自动处理
        - point_photos 不需要生成，用户后续可以上传图片
      PROMPT
    end
end
