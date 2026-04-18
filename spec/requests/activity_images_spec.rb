require "rails_helper"

RSpec.describe "ActivityImages", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author)   { create(:user) }
  let(:tour)     { create(:tour, author: author) }
  let(:day)      { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }

  def fake_image(name = "pic.jpg", content_type = "image/jpeg")
    Rack::Test::UploadedFile.new(StringIO.new("fake-bytes"), content_type, original_filename: name)
  end

  def attach_image(activity, user, **attrs)
    img = activity.activity_images.build(uploaded_by: user, position: 1, **attrs)
    img.file.attach(io: StringIO.new("f"), filename: "p.jpg", content_type: "image/jpeg")
    img.save!
    img
  end

  describe "POST /activities/:activity_id/images" do
    it "creates an image and returns JSON with url" do
      login_as(author)
      expect {
        post activity_images_path(activity), params: { file: fake_image, caption: "湖景" }
      }.to change(ActivityImage, :count).by(1)

      body = JSON.parse(response.body)
      expect(body["caption"]).to eq("湖景")
      expect(body["position"]).to eq(1)
      expect(body["is_cover"]).to be false
      expect(body["url"]).to be_present
    end

    it "auto-increments position within the activity" do
      attach_image(activity, author, position: 1)
      attach_image(activity, author, position: 2)
      login_as(author)
      post activity_images_path(activity), params: { file: fake_image }
      expect(JSON.parse(response.body)["position"]).to eq(3)
    end

    it "non-editor member is forbidden" do
      other = create(:user)
      login_as(other)
      post activity_images_path(activity), params: { file: fake_image }
      expect(response).to have_http_status(:forbidden)
    end

    it "rejects non-image content types with 422" do
      login_as(author)
      post activity_images_path(activity), params: { file: fake_image("doc.pdf", "application/pdf") }
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)["errors"].first).to match(/不支持的格式/)
    end
  end

  describe "PATCH /activity_images/:id" do
    it "updates caption" do
      image = attach_image(activity, author)
      login_as(author)
      patch activity_image_path(image), params: { caption: "改了" }
      expect(image.reload.caption).to eq("改了")
    end

    it "sets is_cover and unsets previous cover on the same activity" do
      old_cover = attach_image(activity, author, position: 1, is_cover: true)
      image     = attach_image(activity, author, position: 2)
      login_as(author)
      patch activity_image_path(image), params: { is_cover: true }
      expect(image.reload.is_cover).to be true
      expect(old_cover.reload.is_cover).to be false
    end

    it "non-editor is forbidden" do
      image = attach_image(activity, author)
      other = create(:user)
      login_as(other)
      patch activity_image_path(image), params: { caption: "hack" }
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /activity_images/:id" do
    it "deletes the image" do
      image = attach_image(activity, author)
      login_as(author)
      expect {
        delete activity_image_path(image)
      }.to change(ActivityImage, :count).by(-1)
      expect(response).to have_http_status(:no_content)
    end

    it "non-editor is forbidden" do
      image = attach_image(activity, author)
      other = create(:user)
      login_as(other)
      delete activity_image_path(image)
      expect(response).to have_http_status(:forbidden)
    end
  end
end
