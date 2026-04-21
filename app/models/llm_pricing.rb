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

    # safe_load_file refuses to deserialize arbitrary Ruby objects —
    # our pricing YAML only has strings and integers, so an empty
    # permitted_classes list is correct. Belt-and-suspenders even for
    # a trusted config file.
    def pricing
      @pricing ||= YAML.safe_load_file(CONFIG_PATH, permitted_classes: [], aliases: false) || {}
    end
  end
end
