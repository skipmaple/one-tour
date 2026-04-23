# Idempotent creation + refresh for a RouteLeg between two activities.
#
# Semantics: if a matching leg (same tour + from + to + mode) already exists
# and its endpoint_digest matches the current endpoint coords, short-circuit
# without calling Amap (cache hit). Otherwise, call Amap and update.
#
# Returns the persisted RouteLeg. Raises AmapDirectionService::Error on
# upstream failure; the controller maps to 502.
#
# After #call, `#cache_hit?` reflects whether the call skipped Amap (true)
# or actually hit the network (false). Callers (e.g. the batch controller)
# use this to classify computed vs cached pairs and to decide whether to
# rate-limit before the next iteration — avoids a duplicate find_by in the
# caller and keeps the cache source-of-truth inside this service.
class RouteLeg::Upsert
  attr_reader :cache_hit

  def initialize(tour:, from_activity_id:, to_activity_id:, mode: :driving, service: AmapDirectionService.new)
    @tour = tour
    @from_activity_id = from_activity_id.to_i
    @to_activity_id = to_activity_id.to_i
    @mode = mode.to_sym
    @service = service
    @cache_hit = nil
  end

  def cache_hit?
    @cache_hit
  end

  def call
    from = @tour.activities.find(@from_activity_id)
    to   = @tour.activities.find(@to_activity_id)

    leg = @tour.route_legs.find_or_initialize_by(
      from_activity_id: from.id,
      to_activity_id:   to.id,
      mode:             @mode
    )
    leg.from_activity = from
    leg.to_activity = to

    if leg.persisted? && leg.cache_valid?
      @cache_hit = true
      return leg
    end
    @cache_hit = false

    args = RouteLeg.resolve_endpoint_coords(from_activity: from, to_activity: to)
    result = @service.fetch(
      from_lat: args[:from_lat].to_f, from_lng: args[:from_lng].to_f,
      to_lat:   args[:to_lat].to_f,   to_lng:   args[:to_lng].to_f,
      mode:     @mode
    )

    leg.assign_attributes(
      distance_m:      result[:distance_m],
      duration_s:      result[:duration_s],
      polyline:        result[:polyline],
      endpoint_digest: leg.expected_endpoint_digest,
      fetched_at:      Time.current
    )
    leg.save!
    leg
  end
end
