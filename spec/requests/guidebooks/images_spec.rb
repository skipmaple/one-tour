require "rails_helper"

RSpec.describe "Guidebook Images", type: :request do
  let(:user) { create(:user) }
  let(:guidebook) { create(:guidebook, author: user) }

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "POST /guidebooks/:guidebook_id/images" do
    it "uploads an image and returns thumb/hd URLs" do
      login_as(user)

      image = fixture_file_upload(
        Rails.root.join("spec/fixtures/files/test_image.jpg"),
        "image/jpeg"
      )

      post "/guidebooks/#{guidebook.id}/images", params: { image: image }

      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json["thumb"]).to be_present
      expect(json["hd"]).to be_present
    end

    it "denies upload for non-editors" do
      other_user = create(:user)
      login_as(other_user)

      image = fixture_file_upload(
        Rails.root.join("spec/fixtures/files/test_image.jpg"),
        "image/jpeg"
      )

      post "/guidebooks/#{guidebook.id}/images", params: { image: image }

      expect(response).to have_http_status(:forbidden)
    end
  end
end
