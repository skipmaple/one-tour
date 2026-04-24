# Thin wrapper around Amap Direction API v5. Same shape as PoiSearch.
#
# Returns:
#   { distance_m: Integer, duration_s: Integer, polyline: { coords:, bounds: } }
#
# Raises AmapDirectionService::Error on non-success responses. The controller
# is responsible for translating to HTTP 502 / rate limiting / etc.
#
# Amap v5 response shape (driving/walking):
#   { status:"1", route: { paths: [ { distance:"418000",
#                                      cost:{ duration:"22980", tolls:..., traffic_lights:... },
#                                      steps:[{polyline:"lng,lat;lng,lat;..."}, ...] } ] } }
#
# NOTE: v5 的 driving API 默认响应里 **没有 duration 字段**——必须请求 show_fields
# 包含 "cost" 才会返回 path.cost.duration（秒）。老的 v3 API path["duration"] 直接
# 就有。我们统一从 path.cost.duration 读，并 fallback 到 path["duration"] 兼容。
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

  # Amap free tier allows ~3 QPS per key. A burst (e.g. batch compute for a
  # 20+ activity tour) can trip this even when our own code calls sequentially,
  # because each call takes ~150ms < 333ms. Amap fast-rejects with info:
  # "CUQPS_HAS_EXCEEDED_THE_LIMIT". Back off briefly and retry — by the time
  # we wake up the burst window has slid. Linear backoff (not exponential) is
  # fine since Amap's limiter is sub-second.
  RATE_LIMIT_INFO = "CUQPS_HAS_EXCEEDED_THE_LIMIT".freeze
  DEFAULT_MAX_RETRIES = 2
  DEFAULT_RETRY_DELAY = 0.5  # seconds; attempt 1 waits 0.5s, attempt 2 waits 1.0s

  def initialize(max_retries: DEFAULT_MAX_RETRIES, retry_delay: DEFAULT_RETRY_DELAY, sleep_fn: method(:sleep))
    @max_retries = max_retries
    @retry_delay = retry_delay
    @sleep_fn    = sleep_fn
  end

  def fetch(from_lat:, from_lng:, to_lat:, to_lng:, mode: :driving)
    mode = mode.to_sym
    endpoint = ENDPOINTS[mode]
    raise UnsupportedModeError, "暂不支持该出行方式（#{mode}）" unless endpoint

    attempt = 0
    begin
      attempt += 1
      data = request(endpoint, {
        "key"         => ENV.fetch("AMAP_API_KEY"),
        "origin"      => "#{from_lng},#{from_lat}",
        "destination" => "#{to_lng},#{to_lat}",
        "output"      => "JSON",
        "show_fields" => "polyline,cost"
      })
      parse_route(data)
    rescue Error => e
      if rate_limited?(e) && attempt <= @max_retries
        @sleep_fn.call(@retry_delay * attempt)
        retry
      end
      raise
    end
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

    def rate_limited?(error)
      error.message.include?(RATE_LIMIT_INFO)
    end

    def parse_route(data)
      paths = data.dig("route", "paths") || []
      raise Error, "未找到可行路径" if paths.empty?

      first = paths.first
      coords = extract_coords(first)
      {
        distance_m: first["distance"].to_i,
        duration_s: extract_duration_s(first),
        polyline: {
          "coords" => coords,
          "bounds" => compute_bounds(coords)
        }
      }
    end

    # v5: path.cost.duration（秒）。v3/老响应：path["duration"]。取先找到的。
    def extract_duration_s(path)
      cost_dur = path.dig("cost", "duration")
      return cost_dur.to_i if cost_dur.present?
      path["duration"].to_i
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
