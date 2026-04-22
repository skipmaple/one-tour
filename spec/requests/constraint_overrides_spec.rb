require "rails_helper"

RSpec.describe "Constraint Overrides", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  describe "POST /tours/:tour_id/overrides" do
    it "records an override and redirects" do
      login_as(author)
      post "/tours/#{tour.id}/overrides", params: {
        rule: "max_daily_driving_minutes",
        scope: { day_id: 7 },
        reason: "独库必走，无法压缩"
      }
      expect(response).to redirect_to(tour_path(tour))
      expect(tour.reload.constraint_overrides.size).to eq(1)
      expect(tour.constraint_overrides.first["rule"]).to eq("max_daily_driving_minutes")
    end

    it "returns 403 for a reader" do
      reader = create(:user)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
      login_as(reader)
      post "/tours/#{tour.id}/overrides", params: { rule: "r", reason: "test" }
      expect(response).to have_http_status(:forbidden)
    end

    it "returns 404 for nonexistent tour" do
      login_as(author)
      post "/tours/999999/overrides", params: { rule: "r", reason: "test" }
      expect(response).to have_http_status(:not_found)
    end

    it "allows an editor to create an override" do
      editor = create(:user)
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      login_as(editor)
      post "/tours/#{tour.id}/overrides", params: {
        rule: "min_buffer_days", scope: {}, reason: "短途不需要机动日"
      }
      expect(response).to redirect_to(tour_path(tour))
      expect(tour.reload.constraint_overrides.size).to eq(1)
    end

    # Regression: scope values arrive as native Integers when the client
    # posts JSON (Inertia does). Prior scope_param implementation called
    # v =~ /regex/ which raises NoMethodError on Integer.
    it "accepts integer-valued scope keys from a JSON body" do
      login_as(author)
      post "/tours/#{tour.id}/overrides",
        params: {
          rule: "max_tier_one_per_day",
          scope: { day_index: 1 },
          reason: "独库必走，无法压缩",
        }.to_json,
        headers: { "Content-Type" => "application/json" }
      expect(response).to redirect_to(tour_path(tour))
      expect(tour.reload.constraint_overrides.size).to eq(1)
    end
  end

  describe "DELETE /tours/:tour_id/overrides" do
    before do
      tour.record_override!(rule: "max_daily_driving_minutes", scope: { "day_id" => 7 }, reason: "test")
    end

    it "revokes the matching override and redirects" do
      login_as(author)
      delete "/tours/#{tour.id}/overrides", params: {
        rule: "max_daily_driving_minutes",
        scope: { day_id: 7 }
      }
      expect(response).to redirect_to(tour_path(tour))
      expect(tour.reload.constraint_overrides).to be_empty
    end

    it "returns 403 for a reader" do
      reader = create(:user)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
      login_as(reader)
      delete "/tours/#{tour.id}/overrides", params: { rule: "max_daily_driving_minutes" }
      expect(response).to have_http_status(:forbidden)
    end
  end
end
