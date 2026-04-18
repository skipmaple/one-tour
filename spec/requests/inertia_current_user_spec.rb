require "rails_helper"

RSpec.describe "inertia_share current_user", type: :request do
  let(:user) { create(:user) }

  def login_as(u)
    post "/login_test", params: { user_id: u.id }
  end

  # inertia_rails >= 3.20 serialises the page blob into
  #   <script data-page="app" type="application/json">{...}</script>
  def inertia_props
    get "/"
    match = response.body.match(/<script data-page="app" type="application\/json">(.*?)<\/script>/m)
    match or raise "no Inertia <script data-page> block in body"
    JSON.parse(match[1]).fetch("props")
  end

  before { login_as(user) }

  it "exposes avatar_url (null when no attachment and no column value)" do
    expect(inertia_props["current_user"]).to have_key("avatar_url")
    expect(inertia_props["current_user"]["avatar_url"]).to be_nil
  end

  it "exposes has_custom_avatar=false when no attachment" do
    expect(inertia_props["current_user"]["has_custom_avatar"]).to eq(false)
  end

  it "exposes has_custom_avatar=true after an attachment" do
    user.avatar.attach(
      io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")),
      filename: "avatar.png",
      content_type: "image/png"
    )
    expect(inertia_props["current_user"]["has_custom_avatar"]).to eq(true)
    expect(inertia_props["current_user"]["avatar_url"]).to match(%r{/rails/active_storage/})
  end
end
