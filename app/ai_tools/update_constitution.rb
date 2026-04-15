module AITools
  class UpdateConstitution < AITools::Base
    description "修订当前 Tour 的本程宪法"
    param :patch,   type: :object

    def execute(patch:)
      with_rescues do
        next require_tour! if @tour.nil?

        allowed = Constitution::DEFAULTS.keys.map(&:to_s)
        safe = (patch || {}).stringify_keys.slice(*allowed)
        @tour.update!(constitution: @tour.constitution.merge(safe))
        ok(tour_id: @tour.id, updated_fields: safe.keys)
      end
    end
  end
end
