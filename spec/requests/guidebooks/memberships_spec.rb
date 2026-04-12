require "rails_helper"

RSpec.describe "Guidebook Memberships", type: :request do
  let(:owner) { create(:user) }
  let(:guidebook) { create(:guidebook, author: owner) }
  let(:invitee) { create(:user) }

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "POST /guidebooks/:guidebook_id/memberships" do
    it "allows owner to add a member" do
      login_as(owner)
      expect {
        post "/guidebooks/#{guidebook.id}/memberships", params: {
          membership: { email: invitee.email, role: "editor" }
        }
      }.to change(GuidebookMembership, :count).by(1)
      membership = GuidebookMembership.last
      expect(membership.user).to eq invitee
      expect(membership).to be_editor
    end

    it "denies non-owner from adding members" do
      editor = create(:user)
      create(:guidebook_membership, guidebook: guidebook, user: editor, role: :editor)
      login_as(editor)
      post "/guidebooks/#{guidebook.id}/memberships", params: {
        membership: { email: invitee.email, role: "reader" }
      }
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH /guidebooks/:guidebook_id/memberships/:id" do
    it "allows owner to change role" do
      membership = create(:guidebook_membership, guidebook: guidebook, user: invitee, role: :reader)
      login_as(owner)
      patch "/guidebooks/#{guidebook.id}/memberships/#{membership.id}", params: {
        membership: { role: "editor" }
      }
      expect(membership.reload).to be_editor
    end
  end

  describe "DELETE /guidebooks/:guidebook_id/memberships/:id" do
    it "allows owner to remove a member" do
      membership = create(:guidebook_membership, guidebook: guidebook, user: invitee)
      login_as(owner)
      expect {
        delete "/guidebooks/#{guidebook.id}/memberships/#{membership.id}"
      }.to change(GuidebookMembership, :count).by(-1)
    end
  end
end
