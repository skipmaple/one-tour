require "rails_helper"

RSpec.describe ChatChannel, type: :channel do
  let(:user) { create(:user) }

  before { stub_connection current_user: user }

  it "confirms subscription and streams from per-tour-per-user channel when user is author" do
    tour = create(:tour, author: user)
    subscribe(tour_id: tour.id)
    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from("chat_tour_#{tour.id}_user_#{user.id}")
  end

  it "confirms subscription for a reader member" do
    tour = create(:tour)
    create(:tour_membership, tour: tour, user: user, role: :reader)
    subscribe(tour_id: tour.id)
    expect(subscription).to be_confirmed
  end

  it "confirms subscription for an editor member" do
    tour = create(:tour)
    create(:tour_membership, tour: tour, user: user, role: :editor)
    subscribe(tour_id: tour.id)
    expect(subscription).to be_confirmed
  end

  it "rejects subscription when the tour does not exist" do
    subscribe(tour_id: 9_999_999)
    expect(subscription).to be_rejected
  end

  it "rejects subscription when user is neither author nor member" do
    someone_elses_tour = create(:tour)
    subscribe(tour_id: someone_elses_tour.id)
    expect(subscription).to be_rejected
  end
end
