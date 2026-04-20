class LlmPricing
  CONFIG_PATH = Rails.root.join("config/llm_pricing.yml")

  class << self
    def lookup(model_name)
      pricing[model_name] || begin
        Rails.logger.warn("[llm_pricing] unknown model=#{model_name}, using _default")
        pricing["_default"]
      end
    end

    def reload!
      @pricing = nil
    end

    private

    def pricing
      @pricing ||= YAML.load_file(CONFIG_PATH)
    end
  end
end
