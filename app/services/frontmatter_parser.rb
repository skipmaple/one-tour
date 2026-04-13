class FrontmatterParser
  Result = Struct.new(:frontmatter, :body, :errors, keyword_init: true) do
    def valid?
      errors.empty?
    end

    def publishable?
      valid? && frontmatter["title"].present? && has_days_with_coordinates?
    end

    private
      def has_days_with_coordinates?
        days = frontmatter["days"]
        if days.is_a?(Array) && days.any?
          days.all? { |day| day.is_a?(Hash) && day["coordinates"].is_a?(Array) }
        else
          false
        end
      end
  end

  def initialize(content)
    @content = content.to_s
  end

  def parse
    frontmatter, body = extract_frontmatter_and_body
    errors = validate(frontmatter)

    Result.new(frontmatter: frontmatter, body: body, errors: errors)
  end

  private
    def extract_frontmatter_and_body
      if match = @content.match(/\A---\s*\n(.*?\n?)---\s*\n?(.*)\z/m)
        yaml_str = match[1]
        body = match[2]
        begin
          frontmatter = YAML.safe_load(yaml_str, permitted_classes: [Date]) || {}
          [frontmatter, body]
        rescue Psych::SyntaxError => e
          @yaml_error = "YAML parse error: #{e.message}"
          [{}, body]
        end
      else
        [{}, @content]
      end
    end

    def validate(frontmatter)
      errors = []
      if @yaml_error
        errors << @yaml_error
      end
      if frontmatter.empty? && @yaml_error.nil?
        errors << "No frontmatter found"
      end
      if frontmatter["title"].blank?
        errors << "Missing required field: title"
      end
      errors
    end
end
