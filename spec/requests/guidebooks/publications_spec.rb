require "rails_helper"

RSpec.describe "Guidebook Publications", type: :request do
  let(:user) { create(:user) }

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "POST /guidebooks/:guidebook_id/publication" do
    it "publishes a publishable guidebook for the owner" do
      guidebook = create(:guidebook, author: user, published: false,
        content: "---\ntitle: Trip\ndays:\n  - day: 1\n    title: Day 1\n    coordinates: [43.83, 87.62]\n---\n\n# Trip")
      login_as(user)
      post "/guidebooks/#{guidebook.id}/publication"
      expect(guidebook.reload.published).to be true
    end

    it "rejects publishing a non-publishable guidebook" do
      guidebook = create(:guidebook, author: user, published: false,
        content: "---\ntitle: Trip\ndays: []\n---\n\n# Trip")
      login_as(user)
      post "/guidebooks/#{guidebook.id}/publication"
      expect(guidebook.reload.published).to be false
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "denies non-owners from publishing" do
      guidebook = create(:guidebook, published: false)
      create(:guidebook_membership, guidebook: guidebook, user: user, role: :editor)
      login_as(user)
      post "/guidebooks/#{guidebook.id}/publication"
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /guidebooks/:guidebook_id/publication" do
    it "unpublishes for the owner" do
      guidebook = create(:guidebook, author: user, published: true)
      login_as(user)
      delete "/guidebooks/#{guidebook.id}/publication"
      expect(guidebook.reload.published).to be false
    end
  end
end
