class PoiSearch
  Error = Class.new(StandardError)

  AMAP_ENDPOINT = "https://restapi.amap.com/v5/place/text"

  def search(keywords, region_hint: nil, near_lat: nil, near_lng: nil)
    params = {
      "key"      => ENV.fetch("AMAP_API_KEY"),
      "keywords" => keywords,
      "output"   => "JSON",
      # v5 returns a minimal POI by default; business (rating/opentime/tel/keytag)
      # and photos only come back when explicitly requested via show_fields.
      "show_fields" => "business,photos"
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
        name:     poi["name"],
        lat:      lat,
        lng:      lng,
        address:  poi["address"],
        type:     poi["type"],
        pname:    poi["pname"],
        cityname: poi["cityname"],
        adname:   poi["adname"],
        pcode:    poi["pcode"],
        place:    place_metadata(poi)
      }
    end
  end

  private
    # Structured place metadata sourced from AMAP business/photos fields. Stored
    # on the activity under details.place so cards can show rating / quality tag
    # / photo instead of just name + time. Sparsely populated: roads & abstract
    # 地名 return mostly nil; cost(人均) is null even for hotels, so we don't keep it.
    def place_metadata(poi)
      b = poi["business"] || {}
      photo = Array(poi["photos"]).map { |p| p["url"] }.find(&:present?)
      {
        rating:   b["rating"].presence,
        opentime: b["opentime_today"].presence || b["opentime_week"].presence,
        tel:      b["tel"].presence,
        keytag:   b["keytag"].presence,
        typecode: poi["typecode"].presence,
        photo:    photo && photo.sub(/\Ahttp:/, "https:")
      }
    end

    def connection
      @connection ||= Faraday.new do |f|
        f.request :url_encoded
        f.response :raise_error
      end
    end
end
