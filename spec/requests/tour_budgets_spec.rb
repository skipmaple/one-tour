require "rails_helper"

RSpec.describe "TourBudgets", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }
  let(:day)    { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }

  describe "POST /tours/:tour_id/budgets" do
    it "creates a tour-scope budget" do
      login_as(author)
      post tour_budgets_path(tour), params: { tour_budget: { user_id: author.id, amount_cents: 8000 } }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["scope"]).to eq("tour")
    end

    it "creates a day-scope budget" do
      login_as(author)
      post tour_budgets_path(tour), params: { tour_budget: { user_id: author.id, day_id: day.id, amount_cents: 2000 } }
      expect(JSON.parse(response.body)["scope"]).to eq("day")
    end

    it "creates an activity-scope budget" do
      login_as(author)
      post tour_budgets_path(tour), params: { tour_budget: { user_id: author.id, activity_id: activity.id, amount_cents: 1000 } }
      expect(JSON.parse(response.body)["scope"]).to eq("activity")
    end

    it "rejects duplicate tour-scope budget (partial unique)" do
      TourBudget.create!(tour: tour, user: author, amount_cents: 5000)
      login_as(author)
      post tour_budgets_path(tour), params: { tour_budget: { user_id: author.id, amount_cents: 6000 } }
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "non-member is forbidden" do
      login_as(create(:user))
      post tour_budgets_path(tour), params: { tour_budget: { user_id: author.id, amount_cents: 100 } }
      expect(response).to have_http_status(:forbidden)
    end

    # Budgets are personal — a reader-member can still track their own budget
    # against a tour they can view. user_id is forced to current_user server-side.
    it "reader-member can create their own budget" do
      reader = create(:user)
      tour.tour_memberships.create!(user: reader, role: :reader)
      login_as(reader)
      post tour_budgets_path(tour), params: { tour_budget: { amount_cents: 5000 } }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["user_id"]).to eq(reader.id)
    end
  end

  describe "PATCH + DELETE cross-user guard" do
    it "editor A cannot modify editor B's budget" do
      other = create(:user)
      tour.tour_memberships.create!(user: other, role: :editor)
      b_of_other = TourBudget.create!(tour: tour, user: other, amount_cents: 1000)
      login_as(author)
      patch tour_budget_path(b_of_other), params: { tour_budget: { amount_cents: 9999 } }
      expect(response).to have_http_status(:forbidden)
      expect(b_of_other.reload.amount_cents).to eq(1000)
    end
  end

  describe "PATCH /tour_budgets/:id" do
    it "updates amount" do
      b = TourBudget.create!(tour: tour, user: author, amount_cents: 5000)
      login_as(author)
      patch tour_budget_path(b), params: { tour_budget: { amount_cents: 9000 } }
      expect(b.reload.amount_cents).to eq(9000)
    end
  end
end
