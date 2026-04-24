class RouteLeg < ApplicationRecord
  belongs_to :tour
  belongs_to :from_activity, class_name: "Activity"
  belongs_to :to_activity,   class_name: "Activity"
  belongs_to :overridden_by, class_name: "User", optional: true

  enum :mode, driving: 0, walking: 1, transit: 2

  validate :endpoints_in_same_tour
  validate :endpoints_have_coordinates

  # Build a stable digest from rounded coords + mode. 4 decimal places ≈
  # 10m precision, fine for direction caching — user clicking ↻ on the same
  # pair with same coords will hit cache and skip the Amap call.
  def self.compute_endpoint_digest(from_lat:, from_lng:, to_lat:, to_lng:, mode:)
    coords = [ from_lat, from_lng, to_lat, to_lng ].map { |c| c.to_f.round(4) }
    Digest::SHA1.hexdigest("#{coords.join(',')}|#{mode}")
  end

  # Resolve "real" endpoint coords for leg computation. For tier_one road
  # activities (景观公路), use details.start_* when activity is TO (entering)
  # and details.end_* when activity is FROM (leaving). Other activities use
  # their lat/lng directly.
  def self.resolve_endpoint_coords(from_activity:, to_activity:)
    from_lat, from_lng = resolve_for(from_activity, role: :from)
    to_lat,   to_lng   = resolve_for(to_activity,   role: :to)
    { from_lat: from_lat, from_lng: from_lng, to_lat: to_lat, to_lng: to_lng }
  end

  # role=:from → 离开活动用 end 坐标；role=:to → 进入活动用 start 坐标。
  # 景观公路 details.start/end 缺失时 fallback 到 activity.lat/lng（这是 start
  # 镜像，before_save 保证非空）。否则会让 Upsert 拿到 nil → to_f → 0.0，
  # 调 AMAP (0,0) 得到无意义的 leg。
  def self.resolve_for(activity, role:)
    if activity.kind == "road" && activity.citizen_level == "tier_one"
      d = activity.details || {}
      lat, lng = role == :from ? [ d["end_lat"], d["end_lng"] ] : [ d["start_lat"], d["start_lng"] ]
      return [ lat, lng ] if lat.present? && lng.present?
      [ activity.lat, activity.lng ]
    else
      [ activity.lat, activity.lng ]
    end
  end
  private_class_method :resolve_for

  def expected_endpoint_digest
    args = self.class.resolve_endpoint_coords(
      from_activity: from_activity, to_activity: to_activity
    )
    self.class.compute_endpoint_digest(
      from_lat: args[:from_lat], from_lng: args[:from_lng],
      to_lat:   args[:to_lat],   to_lng:   args[:to_lng],
      mode:     mode
    )
  end

  # Cached data is valid only if the endpoints haven't moved since fetch.
  def cache_valid?
    polyline.present? && endpoint_digest == expected_endpoint_digest
  end

  def overridden?
    overridden_at.present?
  end

  def effective_distance_m
    distance_m_override || distance_m
  end

  def effective_duration_s
    duration_s_override || duration_s
  end

  private
    def endpoints_in_same_tour
      if from_activity && from_activity.tour_id != tour_id
        errors.add(:from_activity, "不属于本行程")
      end
      if to_activity && to_activity.tour_id != tour_id
        errors.add(:to_activity, "不属于本行程")
      end
    end

    def endpoints_have_coordinates
      if from_activity && (from_activity.lat.nil? || from_activity.lng.nil?)
        errors.add(:from_activity, "缺少坐标，请先补全")
      end
      if to_activity && (to_activity.lat.nil? || to_activity.lng.nil?)
        errors.add(:to_activity, "缺少坐标，请先补全")
      end
    end
end
