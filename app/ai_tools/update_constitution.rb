module AITools
  class UpdateConstitution < AITools::Base
    description "修订本程宪法"
    param :tour_id, type: :integer
    param :patch,   type: :object

    def execute(tour_id:, patch:)
      tour = Tour.find_by(id: tour_id)
      return fail("Tour not found", code: "tour_not_found") unless tour

      allowed = Constitution::DEFAULTS.keys.map(&:to_s)
      safe = (patch || {}).stringify_keys.slice(*allowed)
      tour.update!(constitution: tour.constitution.merge(safe))
      ok(tour_id: tour.id, updated_fields: safe.keys)
    end
  end
end
