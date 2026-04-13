class Geocoder
  Result = Struct.new(:lat, :lng, :formatted_address, keyword_init: true)

  class Error < StandardError; end

  def initialize(provider: nil)
    @provider = provider || default_provider
  end

  def lookup(place_name, region_hint: nil)
    case @provider
    when :amap
      lookup_amap(place_name, region_hint: region_hint)
    when :google
      lookup_google(place_name, region_hint: region_hint)
    else
      raise Error, "Unknown geocoding provider: #{@provider}"
    end
  rescue Faraday::Error => e
    raise Error, "HTTP request failed: #{e.message}"
  end

  private
    def default_provider
      if ENV["AMAP_API_KEY"].present?
        :amap
      elsif ENV["GOOGLE_MAPS_API_KEY"].present?
        :google
      else
        raise Error, "No geocoding API key configured. Set AMAP_API_KEY or GOOGLE_MAPS_API_KEY."
      end
    end

    def lookup_amap(place_name, region_hint: nil)
      query = region_hint ? "#{region_hint}#{place_name}" : place_name

      response = connection.get("https://restapi.amap.com/v3/geocode/geo") do |req|
        req.params["key"] = ENV.fetch("AMAP_API_KEY")
        req.params["address"] = query
        req.params["output"] = "JSON"
      end

      data = JSON.parse(response.body)

      if data["status"] != "1" || data["geocodes"].blank?
        raise Error, "Amap geocoding failed for '#{place_name}': #{data['info']}"
      end

      geocode = data["geocodes"].first
      lng, lat = geocode["location"].split(",").map(&:to_f)

      Result.new(lat: lat, lng: lng, formatted_address: geocode["formatted_address"])
    end

    def lookup_google(place_name, region_hint: nil)
      query = region_hint ? "#{place_name}, #{region_hint}" : place_name

      response = connection.get("https://maps.googleapis.com/maps/api/geocode/json") do |req|
        req.params["key"] = ENV.fetch("GOOGLE_MAPS_API_KEY")
        req.params["address"] = query
      end

      data = JSON.parse(response.body)

      if data["status"] != "OK" || data["results"].blank?
        raise Error, "Google geocoding failed for '#{place_name}': #{data['status']}"
      end

      result = data["results"].first
      location = result["geometry"]["location"]

      Result.new(lat: location["lat"], lng: location["lng"], formatted_address: result["formatted_address"])
    end

    def connection
      @connection ||= Faraday.new do |f|
        f.request :url_encoded
        f.response :raise_error
      end
    end
end
