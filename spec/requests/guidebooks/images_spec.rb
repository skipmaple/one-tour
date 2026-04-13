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

    it "creates ActiveStorage blobs" do
      login_as(user)

      image = fixture_file_upload(
        Rails.root.join("spec/fixtures/files/test_image.jpg"),
        "image/jpeg"
      )

      expect {
        post "/guidebooks/#{guidebook.id}/images", params: { image: image }
      }.to change(ActiveStorage::Blob, :count)
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

    it "allows editor members to upload" do
      editor = create(:user)
      create(:guidebook_membership, guidebook: guidebook, user: editor, role: :editor)
      login_as(editor)

      image = fixture_file_upload(
        Rails.root.join("spec/fixtures/files/test_image.jpg"),
        "image/jpeg"
      )

      post "/guidebooks/#{guidebook.id}/images", params: { image: image }

      expect(response).to have_http_status(:ok)
    end

    it "denies reader members from uploading" do
      reader = create(:user)
      create(:guidebook_membership, guidebook: guidebook, user: reader, role: :reader)
      login_as(reader)

      image = fixture_file_upload(
        Rails.root.join("spec/fixtures/files/test_image.jpg"),
        "image/jpeg"
      )

      post "/guidebooks/#{guidebook.id}/images", params: { image: image }

      expect(response).to have_http_status(:forbidden)
    end

    it "redirects anonymous users to login" do
      image = fixture_file_upload(
        Rails.root.join("spec/fixtures/files/test_image.jpg"),
        "image/jpeg"
      )

      post "/guidebooks/#{guidebook.id}/images", params: { image: image }

      expect(response).to redirect_to(login_path)
    end

    it "returns 422 when no image param is provided" do
      login_as(user)

      post "/guidebooks/#{guidebook.id}/images", params: {}

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
