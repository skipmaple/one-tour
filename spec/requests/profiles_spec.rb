require "rails_helper"

RSpec.describe "PATCH /profile", type: :request do
  let(:user) { create(:user, name: "Original") }

  def login_as(u)
    post "/login_test", params: { user_id: u.id }
  end

  def valid_png
    Rack::Test::UploadedFile.new(
      Rails.root.join("spec/fixtures/files/avatar.png"),
      "image/png"
    )
  end

  it "redirects to /login when not logged in" do
    patch "/profile", params: { user: { name: "Changed" } }
    expect(response).to redirect_to(login_path)
  end

  describe "when logged in" do
    before { login_as(user) }

    it "updates the name with a valid value" do
      patch "/profile", params: { user: { name: "Changed" } }
      expect(response).to have_http_status(:redirect)
      expect(user.reload.name).to eq("Changed")
    end

    it "returns errors for an invalid name" do
      patch "/profile", params: { user: { name: "bad name" } }, headers: { "X-Inertia" => "true" }
      expect(user.reload.name).to eq("Original")
    end

    it "attaches an uploaded avatar" do
      patch "/profile", params: { user: { avatar: valid_png } }
      expect(user.reload.avatar).to be_attached
    end

    it "rejects an oversized file" do
      oversize = Tempfile.new([ "big", ".png" ], binmode: true)
      oversize.write("x" * (5.megabytes + 1))
      oversize.rewind
      patch "/profile", params: { user: { avatar: Rack::Test::UploadedFile.new(oversize.path, "image/png") } }
      user.reload
      expect(user.avatar).not_to be_attached
    end
  end
end
