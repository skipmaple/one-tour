module AITools
  module Schema
    TOOLS = %w[
      AddActivity
      MoveActivity
      UpdateActivity
      DeleteActivity
      ReorderDay
      CreateDay
      UpdateDay
      DeleteDay
      RunConstitutionCheck
      AcknowledgeViolation
      UpdateConstitution
      SearchPoi
    ].freeze
  
    module_function
  
    def all
      TOOLS.map { |name| AITools.const_get(name) }
    end
  
    def to_prompt_description
      lines = [ "# 可用工具" ]
      all.each do |klass|
        lines << ""
        lines << "## #{klass.name.demodulize}"
        lines << tool_description(klass)
      end
      lines.join("\n")
    end
  
    def tool_description(klass)
      # RubyLLM::Tool exposes the DSL-set description via .description
      klass.respond_to?(:description) ? klass.description.to_s : ""
    end
  end
end
