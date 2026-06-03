# Backfills AMAP place metadata (rating/hours/tel/keytag/typecode/photo) onto an
# existing activity by re-searching its name near its known coordinates. Only
# accepts a candidate that is both close to the activity's existing lat/lng (so
# a generic name like "伊宁酒店" can't match a random hotel across town) and
# carries display-worthy data (rating/keytag/photo). Roads / abstract 地名 and
# no-coords activities are left untouched.
#
# Result symbols: :enriched / :no_match / :skipped_no_coords / :skipped_has_place
class ActivityPlaceEnricher
  MATCH_RADIUS_KM = 3.0

  def initialize(search: PoiSearch.new)
    @search = search
  end

  def enrich!(activity)
    return :skipped_has_place if activity.details.is_a?(Hash) && activity.details["place"].present?
    return :skipped_no_coords unless activity.lat && activity.lng

    lat = activity.lat.to_f
    lng = activity.lng.to_f
    region = activity.details&.dig("adname").presence || activity.details&.dig("cityname").presence

    candidates = @search.search(activity.name, region_hint: region, near_lat: lat, near_lng: lng)
    nearest = Array(candidates)
      .select { |c| c[:lat] && c[:lng] }
      .min_by { |c| haversine_km(lat, lng, c[:lat], c[:lng]) }

    return :no_match if nearest.nil?
    return :no_match if haversine_km(lat, lng, nearest[:lat], nearest[:lng]) > MATCH_RADIUS_KM

    place = (nearest[:place] || {}).compact
    # Only worth storing if it carries something the card actually shows.
    return :no_match unless place[:rating].present? || place[:keytag].present? || place[:photo].present?

    activity.update!(details: (activity.details || {}).merge("place" => place.stringify_keys))
    :enriched
  end

  private
    def haversine_km(lat1, lng1, lat2, lng2)
      r = 6371.0
      dlat = (lat2 - lat1) * Math::PI / 180
      dlng = (lng2 - lng1) * Math::PI / 180
      a = (Math.sin(dlat / 2)**2) +
          (Math.cos(lat1 * Math::PI / 180) * Math.cos(lat2 * Math::PI / 180) * (Math.sin(dlng / 2)**2))
      2 * r * Math.asin(Math.sqrt(a))
    end
end
