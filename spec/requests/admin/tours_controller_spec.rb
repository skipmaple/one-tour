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

  describe "GET /admin/tours/:id" do
    it "returns tour profile + members + days + conversation stats" do
      author = create(:user, name: "Alex")
      tour   = create(:tour, author: author, title: "T1")
      member = create(:user, name: "Bob")
      create(:tour_membership, tour: tour, user: member, role: :editor)
      # Tour#after_create_commit :seed_first_day auto-creates Day 1; use that.
      day1 = tour.days.find_by!(day_index: 1)
      create(:activity, tour: tour, day: day1)
      conv   = create(:conversation, tour: tour, user: author)
      create(:message, conversation: conv, role: :assistant,
                        tokens_in: 10, tokens_out: 20, cost_cents: 5)

      get "/admin/tours/#{tour.id}", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")

      expect(props["tour"]).to include("id" => tour.id, "title" => "T1")
      expect(props["tour"]["author"]).to include("name" => "Alex")
      expect(props["members"].map { |m| m["name"] }).to include("Bob")
      expect(props["days"].size).to eq(1)
      expect(props["days"].first["activity_count"]).to eq(1)
      expect(props["conversation_stats"]).to include(
        "total_messages" => 1, "total_cost_cents" => 5
      )
    end

    it "returns 404 for non-existent tour" do
      get "/admin/tours/999999", headers: inertia_headers
      expect(response).to have_http_status(:not_found)
    end
  end
end
