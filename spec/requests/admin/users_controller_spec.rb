require "rails_helper"

RSpec.describe "Admin::UsersController", type: :request do
  let(:admin) { create(:user, role: :admin) }
  let(:inertia_headers) do
    { "X-Inertia" => "true", "X-Inertia-Version" => InertiaRails.configuration.version.to_s }
  end

  before { post "/login_test", params: { user_id: admin.id } }

  describe "GET /admin/users" do
    it "returns list with search/sort/paginate props" do
      5.times { create(:user) }
      get "/admin/users", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")
      expect(props).to include("users", "total", "page", "per_page", "q", "sort")
      expect(props["users"].size).to be >= 1
    end

    it "filters by ?q=" do
      alice = create(:user, name: "AliceXYZ", email: "alice@ex.com")
      create(:user, name: "Bob", email: "bob@ex.com")
      get "/admin/users?q=AliceXYZ", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")
      emails = props["users"].map { |u| u["email"] }
      expect(emails).to include(alice.email)
      expect(emails).not_to include("bob@ex.com")
    end

    it "sorts by cost_desc by default" do
      high = create(:user)
      low  = create(:user)
      [[high, 100], [low, 10]].each do |u, cost|
        tour = create(:tour, author: u)
        conv = create(:conversation, tour: tour, user: u)
        create(:message, conversation: conv, role: :assistant,
                         tokens_out: 1, cost_cents: cost)
      end
      get "/admin/users", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")
      ids = props["users"].map { |u| u["id"] }
      expect(ids.index(high.id)).to be < ids.index(low.id)
    end

    it "paginates with per_page=25" do
      30.times { create(:user) }
      get "/admin/users", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")
      expect(props["per_page"]).to eq(25)
      expect(props["users"].size).to eq(25)
      expect(props["total"]).to be >= 30
    end
  end
end
