require "rails_helper"

RSpec.describe "TourMemberships", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  it "POST creates membership by email" do
    invitee = create(:user, email: "inv@example.com")
    login_as(author)
    post tour_members_path(tour), params: { email: "inv@example.com", role: "editor" }
    expect(response).to redirect_to(tour)
    expect(tour.members).to include(invitee)
  end

  it "PATCH updates role" do
    user = create(:user)
    m = create(:tour_membership, tour: tour, user: user, role: :reader)
    login_as(author)
    patch tour_member_path(tour, m), params: { role: "editor" }
    expect(m.reload.role).to eq("editor")
  end

  it "DELETE removes membership" do
    user = create(:user)
    m = create(:tour_membership, tour: tour, user: user)
    login_as(author)
    expect {
      delete tour_member_path(tour, m)
    }.to change(TourMembership, :count).by(-1)
  end

  it "non-author cannot manage" do
    other = create(:user)
    login_as(other)
    post tour_members_path(tour), params: { email: "x@example.com", role: "reader" }
    expect(response).to have_http_status(:forbidden)
  end

  it "rejects invalid role on create with 422" do
    create(:user, email: "inv@example.com")
    login_as(author)
    post tour_members_path(tour), params: { email: "inv@example.com", role: "admin" }
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it "rejects invalid role on update with 422" do
    user = create(:user)
    m = create(:tour_membership, tour: tour, user: user, role: :reader)
    login_as(author)
    patch tour_member_path(tour, m), params: { role: "admin" }
    expect(response).to have_http_status(:unprocessable_entity)
    expect(m.reload.role).to eq("reader")
  end
end
