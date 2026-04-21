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
      [ [ high, 100 ], [ low, 10 ] ].each do |u, cost|
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

  describe "GET /admin/users/:id" do
    it "returns profile, lifetime stats, tours, recent messages" do
      user = create(:user, name: "Carol", email: "carol@ex.com")
      tour = create(:tour, author: user, title: "Xinjiang")
      create(:tour_membership, user: user, tour: create(:tour))
      conv = create(:conversation, tour: tour, user: user)
      create(:message, conversation: conv, role: :user, content: "hi")
      create(:message, conversation: conv, role: :assistant, content: "hello",
                        tokens_in: 10, tokens_out: 20, cost_cents: 5)

      get "/admin/users/#{user.id}", headers: inertia_headers
      props = JSON.parse(response.body).fetch("props")

      expect(props["profile"]).to include("id" => user.id, "name" => "Carol")
      expect(props["lifetime_stats"]).to include(
        "total_tours", "total_messages", "total_tokens", "total_cost_cents"
      )
      expect(props["authored_tours"].first).to include("title" => "Xinjiang")
      expect(props["joined_tours"].size).to eq(1)
      expect(props["recent_messages"]).to be_an(Array)
      expect(props["recent_messages"].size).to be >= 2
    end

    it "returns 404 for non-existent user" do
      get "/admin/users/999999", headers: inertia_headers
      expect(response).to have_http_status(:not_found)
    end
  end
end
