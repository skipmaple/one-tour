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

  def expected_endpoint_digest
    self.class.compute_endpoint_digest(
      from_lat: from_activity.lat, from_lng: from_activity.lng,
      to_lat:   to_activity.lat,   to_lng:   to_activity.lng,
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
