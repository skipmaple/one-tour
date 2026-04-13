class FrontmatterParser
  Result = Struct.new(:frontmatter, :body, :errors, :warnings, keyword_init: true) do
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
    warnings = validate_structure(frontmatter)

    Result.new(frontmatter: frontmatter, body: body, errors: errors, warnings: warnings)
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

    def validate_structure(frontmatter)
      warnings = []
      return warnings if frontmatter.empty?

      validate_days(frontmatter, warnings)
      validate_route_segments(frontmatter, warnings)
      validate_point_details(frontmatter, warnings)

      warnings
    end

    def validate_days(frontmatter, warnings)
      days = frontmatter["days"]
      return unless days.is_a?(Array)

      day_numbers = []

      days.each_with_index do |day, index|
        unless day.is_a?(Hash)
          warnings << "days[#{index}]: expected a Hash, got #{day.class}"
          next
        end

        label = "Day #{day['day'] || index + 1}"

        if day["day"].is_a?(Integer)
          day_numbers << day["day"]
        else
          warnings << "#{label}: 'day' should be an integer"
        end

        if day["title"].blank?
          warnings << "#{label}: missing 'title'"
        end

        validate_coordinate_pair(day["coordinates"], "#{label}.coordinates", warnings)
        validate_points(day["points"], label, warnings)
        validate_schedule(day["schedule"], label, warnings)
        validate_intensity(day["intensity"], label, warnings)
      end

      validate_day_numbers(day_numbers, warnings)
    end

    def validate_coordinate_pair(coords, label, warnings)
      return unless coords

      unless coords.is_a?(Array) && coords.length == 2
        warnings << "#{label}: expected [lat, lng] array with 2 elements"
        return
      end

      lat, lng = coords
      unless lat.is_a?(Numeric) && lat.between?(-90, 90)
        warnings << "#{label}: latitude #{lat} out of range [-90, 90]"
      end
      unless lng.is_a?(Numeric) && lng.between?(-180, 180)
        warnings << "#{label}: longitude #{lng} out of range [-180, 180]"
      end
    end

    def validate_points(points, day_label, warnings)
      return unless points.is_a?(Array)

      points.each_with_index do |point, i|
        next unless point.is_a?(Hash)

        point_label = "#{day_label}.points[#{i}]"

        if point["name"].blank?
          warnings << "#{point_label}: missing 'name'"
        end

        if point["lat"].is_a?(Numeric) && !point["lat"].between?(-90, 90)
          warnings << "#{point_label}: latitude #{point['lat']} out of range [-90, 90]"
        end

        if point["lng"].is_a?(Numeric) && !point["lng"].between?(-180, 180)
          warnings << "#{point_label}: longitude #{point['lng']} out of range [-180, 180]"
        end
      end
    end

    def validate_schedule(schedule, day_label, warnings)
      return unless schedule.is_a?(Array)

      schedule.each_with_index do |entry, i|
        unless entry.is_a?(Array) && entry.length == 2
          warnings << "#{day_label}.schedule[#{i}]: expected [time, description] array"
        end
      end
    end

    def validate_intensity(intensity, day_label, warnings)
      return if intensity.nil?

      valid_values = %w[green yellow red]
      unless valid_values.include?(intensity.to_s)
        warnings << "#{day_label}: intensity '#{intensity}' should be one of: #{valid_values.join(', ')}"
      end
    end

    def validate_day_numbers(day_numbers, warnings)
      return if day_numbers.empty?

      if day_numbers != day_numbers.uniq
        duplicates = day_numbers.select { |n| day_numbers.count(n) > 1 }.uniq
        warnings << "Duplicate day numbers: #{duplicates.join(', ')}"
      end

      expected = (1..day_numbers.max).to_a
      missing = expected - day_numbers
      if missing.any?
        warnings << "Non-sequential day numbers, missing: #{missing.join(', ')}"
      end
    end

    def validate_route_segments(frontmatter, warnings)
      segments = frontmatter["route_segments"]
      return unless segments.is_a?(Array)

      segments.each_with_index do |segment, i|
        next unless segment.is_a?(Hash)

        label = "route_segments[#{i}]"

        if segment["from"].blank?
          warnings << "#{label}: missing 'from'"
        end
        if segment["to"].blank?
          warnings << "#{label}: missing 'to'"
        end
      end
    end

    def validate_point_details(frontmatter, warnings)
      details = frontmatter["point_details"]
      return unless details.is_a?(Hash)

      all_point_names = collect_point_names(frontmatter)
      return if all_point_names.empty?

      details.each_key do |name|
        unless all_point_names.include?(name)
          warnings << "point_details['#{name}']: not referenced in any day's points"
        end
      end
    end

    def collect_point_names(frontmatter)
      days = frontmatter["days"]
      return [] unless days.is_a?(Array)

      days.flat_map { |day|
        next [] unless day.is_a?(Hash) && day["points"].is_a?(Array)
        day["points"].filter_map { |p| p["name"] if p.is_a?(Hash) }
      }
    end
end
