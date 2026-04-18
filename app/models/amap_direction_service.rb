# Thin wrapper around Amap Direction API v5. Same shape as PoiSearch.
#
# Returns:
#   { distance_m: Integer, duration_s: Integer, polyline: { coords:, bounds: } }
#
# Raises AmapDirectionService::Error on non-success responses. The controller
# is responsible for translating to HTTP 502 / rate limiting / etc.
#
# Amap v5 response shape (driving/walking):
#   { status:"1", route: { paths: [ { distance:"418000", duration:"22980",
#                                      steps:[{polyline:"lng,lat;lng,lat;..."}, ...] } ] } }
#
# Transit is a different shape and significantly more complex (bus+metro
# transfers); for MVP we only expose driving + walking. Transit will raise
# UnsupportedModeError and the UI falls back to straight-line.
class AmapDirectionService
  Error = Class.new(StandardError)
  UnsupportedModeError = Class.new(Error)

  ENDPOINTS = {
    driving: "https://restapi.amap.com/v5/direction/driving",
    walking: "https://restapi.amap.com/v5/direction/walking"
  }.freeze

  def fetch(from_lat:, from_lng:, to_lat:, to_lng:, mode: :driving)
    mode = mode.to_sym
    endpoint = ENDPOINTS[mode]
    raise UnsupportedModeError, "暂不支持该出行方式（#{mode}）" unless endpoint

    data = request(endpoint, {
      "key"         => ENV.fetch("AMAP_API_KEY"),
      "origin"      => "#{from_lng},#{from_lat}",
      "destination" => "#{to_lng},#{to_lat}",
      "output"      => "JSON",
      "show_fields" => "polyline"
    })

    parse_route(data)
  end

  private
    def request(endpoint, params)
      response = connection.get(endpoint, params)
      data = JSON.parse(response.body)
      if data["status"] != "1"
        raise Error, "AMAP 错误：#{data['info']}"
      end
      data
    end

    def parse_route(data)
      paths = data.dig("route", "paths") || []
      raise Error, "未找到可行路径" if paths.empty?

      first = paths.first
      coords = extract_coords(first)
      {
        distance_m: first["distance"].to_i,
        duration_s: first["duration"].to_i,
        polyline: {
          "coords" => coords,
          "bounds" => compute_bounds(coords)
        }
      }
    end

    def extract_coords(path)
      steps = path["steps"] || []
      coords = []
      steps.each do |step|
        step["polyline"].to_s.split(";").each do |point|
          lng, lat = point.split(",").map(&:to_f)
          next if lng.zero? && lat.zero?
          coords << [ lng, lat ]
        end
      end
      coords
    end

    def compute_bounds(coords)
      return {} if coords.empty?

      lngs = coords.map { |c| c[0] }
      lats = coords.map { |c| c[1] }
      {
        "sw" => [ lngs.min, lats.min ],
        "ne" => [ lngs.max, lats.max ]
      }
    end

    def connection
      @connection ||= Faraday.new do |f|
        f.request :url_encoded
        f.response :raise_error
      end
    end
end
