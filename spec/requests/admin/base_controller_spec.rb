require "rails_helper"

RSpec.describe "Admin::BaseController auth", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  it "returns 404 when unauthenticated" do
    get "/admin"
    expect(response).to have_http_status(:not_found)
  end

  it "returns 404 when logged in as non-admin" do
    login_as(create(:user))
    get "/admin"
    expect(response).to have_http_status(:not_found)
  end

  it "returns 200 when logged in as admin" do
    admin = create(:user, role: :admin)
    login_as(admin)
    get "/admin"
    expect(response).to have_http_status(:ok)
  end
end
