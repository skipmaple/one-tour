require "rails_helper"

RSpec.describe "Admin::DashboardController", type: :request do
  let(:admin) { create(:user, role: :admin) }
  let(:inertia_headers) do
    { "X-Inertia" => "true", "X-Inertia-Version" => InertiaRails.configuration.version.to_s }
  end

  before { post "/login_test", params: { user_id: admin.id } }

  it "returns 6 KPI values in Inertia props" do
    user = create(:user)
    tour = create(:tour, author: user)
    conv = create(:conversation, tour: tour, user: user)
    3.times { create(:message, conversation: conv, role: :assistant,
                                tokens_in: 10, tokens_out: 20, cost_cents: 5) }

    get "/admin", headers: inertia_headers
    expect(response).to have_http_status(:ok)
    props = JSON.parse(response.body).fetch("props")
    kpis  = props.fetch("kpis")

    expect(kpis).to include(
      "new_users", "active_users",
      "new_tours", "active_tours",
      "llm_messages", "llm_cost_cents"
    )
    expect(kpis["llm_messages"]).to eq(3)
    expect(kpis["llm_cost_cents"]).to eq(15)
  end

  it "accepts ?range=30d and adjusts window" do
    get "/admin?range=30d", headers: inertia_headers
    expect(response).to have_http_status(:ok)
    props = JSON.parse(response.body).fetch("props")
    expect(props.fetch("range")).to eq("30d")
  end

  it "defaults range to 7d" do
    get "/admin", headers: inertia_headers
    props = JSON.parse(response.body).fetch("props")
    expect(props.fetch("range")).to eq("7d")
  end
end
