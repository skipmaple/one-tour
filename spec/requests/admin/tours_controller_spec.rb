require "rails_helper"
require "cgi"

RSpec.describe "Admin::ToursController", type: :request do
  let(:admin) { create(:user, role: :admin) }
  let(:inertia_headers) do
    { "X-Inertia" => "true", "X-Inertia-Version" => InertiaRails.configuration.version.to_s }
  end

  before { post "/login_test", params: { user_id: admin.id } }

  describe "GET /admin/tours" do
    it "returns list with pagination props" do
      3.times { create(:tour) }
      get "/admin/tours", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")
      expect(props).to include("tours", "total", "page", "per_page", "q", "sort")
      expect(props["tours"].size).to be >= 3
    end

    it "filters by ?q=" do
      match = create(:tour, title: "北疆独库 11 天")
      create(:tour, title: "华东 5 天")
      get "/admin/tours?q=#{CGI.escape('独库')}", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")
      ids = props["tours"].map { |t| t["id"] }
      expect(ids).to include(match.id)
      expect(ids.size).to eq(1)
    end

    it "defaults to sort=updated_desc" do
      newer = create(:tour, title: "Newer", updated_at: 1.hour.ago)
      older = create(:tour, title: "Older", updated_at: 2.days.ago)
      get "/admin/tours", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")
      ids = props["tours"].map { |t| t["id"] }
      expect(ids.index(newer.id)).to be < ids.index(older.id)
    end
  end
end
