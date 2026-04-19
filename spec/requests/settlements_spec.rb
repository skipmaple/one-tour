require "rails_helper"

RSpec.describe "Settlements", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:other)  { create(:user, email: "other@test.com") }
  let(:tour)   { create(:tour, author: author) }

  before do
    tour.tour_memberships.create!(user: other, role: :editor)
  end

  describe "POST /tours/:tour_id/settlements" do
    it "records a settlement between two members" do
      login_as(author)
      expect {
        post tour_settlements_path(tour), params: {
          settlement: { from_user_id: other.id, to_user_id: author.id, amount_cents: 5000 }
        }
      }.to change(Settlement, :count).by(1)
      body = JSON.parse(response.body)
      expect(body["from_user_id"]).to eq(other.id)
      expect(body["amount_cents"]).to eq(5000)
    end

    it "rejects self-transfer" do
      login_as(author)
      post tour_settlements_path(tour), params: {
        settlement: { from_user_id: author.id, to_user_id: author.id, amount_cents: 100 }
      }
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "rejects zero / negative amount" do
      login_as(author)
      post tour_settlements_path(tour), params: {
        settlement: { from_user_id: other.id, to_user_id: author.id, amount_cents: 0 }
      }
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "rejects a non-member as one side" do
      stranger = create(:user, email: "stranger@test.com")
      login_as(author)
      post tour_settlements_path(tour), params: {
        settlement: { from_user_id: stranger.id, to_user_id: author.id, amount_cents: 100 }
      }
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "forbids non-member callers" do
      login_as(create(:user))
      post tour_settlements_path(tour), params: {
        settlement: { from_user_id: author.id, to_user_id: other.id, amount_cents: 100 }
      }
      expect(response).to have_http_status(:forbidden)
    end

    # Summarize should net out the settlement: receiver's net goes DOWN, payer's
    # net goes UP. Validates the behavior end-to-end since this is the whole
    # point of the feature.
    it "affects Expense::Summarize net balance" do
      # Setup: author pays ¥300 for an expense split AA among author + other.
      # author net = 300 - 150 = +150, other net = 0 - 150 = -150.
      day = tour.days.first
      activity = create(:activity, tour: tour, day: day)
      e = Expense.create!(
        tour: tour, activity: activity, scope: :activity,
        paid_by: author, created_by: author,
        amount_cents: 30_000, category: :food, split_strategy: :equal
      )
      Expense::ComputeSplits.new(e, participant_ids: [ author.id, other.id ]).call

      before_summary = Expense::Summarize.new(tour.reload, author).call
      expect(before_summary[:current_user_balance][:net_cents]).to eq(15_000)

      # Record a ¥150 settlement: other → author
      Settlement.create!(
        tour: tour, from_user: other, to_user: author,
        amount_cents: 15_000, recorded_by: author
      )

      after_summary = Expense::Summarize.new(tour.reload, author).call
      # author: paid 300, owed 150, settled_in 150 → net 0
      expect(after_summary[:current_user_balance][:net_cents]).to eq(0)
      expect(after_summary[:current_user_balance][:settled_in_cents]).to eq(15_000)
    end
  end

  describe "DELETE /settlements/:id" do
    it "undoes a settlement when recorded_by matches" do
      s = Settlement.create!(
        tour: tour, from_user: other, to_user: author,
        amount_cents: 1000, recorded_by: author
      )
      login_as(author)
      expect { delete settlement_path(s) }.to change(Settlement, :count).by(-1)
    end

    it "allows an editor to undo even if someone else recorded it" do
      s = Settlement.create!(
        tour: tour, from_user: other, to_user: author,
        amount_cents: 1000, recorded_by: other
      )
      login_as(author)
      delete settlement_path(s)
      expect(response).to have_http_status(:no_content)
    end

    it "forbids undo by a reader who didn't record it" do
      reader = create(:user, email: "reader@test.com")
      tour.tour_memberships.create!(user: reader, role: :reader)
      s = Settlement.create!(
        tour: tour, from_user: other, to_user: author,
        amount_cents: 1000, recorded_by: author
      )
      login_as(reader)
      delete settlement_path(s)
      expect(response).to have_http_status(:forbidden)
    end
  end
end
