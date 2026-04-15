class PoiSearch
  Error = Class.new(StandardError)

  AMAP_ENDPOINT = "https://restapi.amap.com/v5/place/text"

  def search(keywords, region_hint: nil, near_lat: nil, near_lng: nil)
    params = {
      "key"      => ENV.fetch("AMAP_API_KEY"),
      "keywords" => keywords,
      "output"   => "JSON"
    }
    params["region"]   = region_hint if region_hint
    params["location"] = "#{near_lng},#{near_lat}" if near_lng && near_lat

    response = connection.get(AMAP_ENDPOINT, params)
    data = JSON.parse(response.body)

    if data["status"] != "1"
      raise Error, "AMAP error: #{data['info']}"
    end

    Array(data["pois"]).map do |poi|
      lng, lat = poi["location"].to_s.split(",").map(&:to_f)
      {
        name:    poi["name"],
        lat:     lat,
        lng:     lng,
        address: poi["address"],
        type:    poi["type"]
      }
    end
  end

  private
    def connection
      @connection ||= Faraday.new do |f|
        f.request :url_encoded
        f.response :raise_error
      end
    end
end
