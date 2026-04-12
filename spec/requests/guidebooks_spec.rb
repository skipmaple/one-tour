require "rails_helper"

RSpec.describe "Guidebooks", type: :request do
  let(:user) { create(:user) }
  let(:other_user) { create(:user) }

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "GET /guidebooks" do
    it "shows published guidebooks to anonymous users" do
      create(:guidebook, title: "Published", published: true)
      create(:guidebook, title: "Draft", published: false)
      get "/guidebooks"
      expect(response).to have_http_status(:ok)
    end
  end

  describe "GET /guidebooks/:id" do
    it "shows a published guidebook to anonymous users" do
      guidebook = create(:guidebook, published: true)
      get "/guidebooks/#{guidebook.id}"
      expect(response).to have_http_status(:ok)
    end

    it "denies access to unpublished guidebook for anonymous users" do
      guidebook = create(:guidebook, published: false)
      get "/guidebooks/#{guidebook.id}"
      expect(response).to redirect_to(login_path)
    end

    it "shows unpublished guidebook to owner" do
      guidebook = create(:guidebook, author: user, published: false)
      login_as(user)
      get "/guidebooks/#{guidebook.id}"
      expect(response).to have_http_status(:ok)
    end

    it "shows unpublished guidebook to a reader member" do
      guidebook = create(:guidebook, published: false)
      create(:guidebook_membership, guidebook: guidebook, user: user, role: :reader)
      login_as(user)
      get "/guidebooks/#{guidebook.id}"
      expect(response).to have_http_status(:ok)
    end
  end

  describe "GET /guidebooks/:id/edit" do
    it "allows owner to edit" do
      guidebook = create(:guidebook, author: user)
      login_as(user)
      get "/guidebooks/#{guidebook.id}/edit"
      expect(response).to have_http_status(:ok)
    end

    it "allows editor member to edit" do
      guidebook = create(:guidebook)
      create(:guidebook_membership, guidebook: guidebook, user: user, role: :editor)
      login_as(user)
      get "/guidebooks/#{guidebook.id}/edit"
      expect(response).to have_http_status(:ok)
    end

    it "denies reader member from editing" do
      guidebook = create(:guidebook)
      create(:guidebook_membership, guidebook: guidebook, user: user, role: :reader)
      login_as(user)
      get "/guidebooks/#{guidebook.id}/edit"
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /guidebooks" do
    it "creates a guidebook for logged-in users" do
      login_as(user)
      expect {
        post "/guidebooks", params: {
          guidebook: { content: "---\ntitle: New Trip\ndays: []\n---\n\n# New Trip" }
        }
      }.to change(Guidebook, :count).by(1)

      guidebook = Guidebook.last
      expect(guidebook.author).to eq user
      expect(guidebook.title).to eq "New Trip"
    end

    it "redirects anonymous users to login" do
      post "/guidebooks", params: { guidebook: { content: "test" } }
      expect(response).to redirect_to(login_path)
    end
  end

  describe "PATCH /guidebooks/:id" do
    it "updates content for the owner" do
      guidebook = create(:guidebook, author: user)
      login_as(user)
      patch "/guidebooks/#{guidebook.id}", params: {
        guidebook: { content: "---\ntitle: Updated\ndays: []\n---\n\n# Updated" }
      }
      expect(guidebook.reload.title).to eq "Updated"
    end

    it "denies update for non-editors" do
      guidebook = create(:guidebook)
      login_as(user)
      patch "/guidebooks/#{guidebook.id}", params: { guidebook: { content: "hack" } }
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /guidebooks/:id" do
    it "allows owner to delete" do
      guidebook = create(:guidebook, author: user)
      login_as(user)
      expect { delete "/guidebooks/#{guidebook.id}" }.to change(Guidebook, :count).by(-1)
    end

    it "denies non-owner from deleting" do
      guidebook = create(:guidebook)
      create(:guidebook_membership, guidebook: guidebook, user: user, role: :editor)
      login_as(user)
      delete "/guidebooks/#{guidebook.id}"
      expect(response).to have_http_status(:forbidden)
    end
  end
end
