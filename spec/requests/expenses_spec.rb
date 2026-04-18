require "rails_helper"

RSpec.describe "Expenses", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:u2)     { create(:user) }
  let(:tour)   { create(:tour, author: author) }
  let(:day)    { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }

  describe "POST /tours/:tour_id/expenses" do
    it "creates an activity-scope expense with equal splits" do
      login_as(author)
      expect {
        post tour_expenses_path(tour), params: {
          expense: {
            scope: "activity", activity_id: activity.id, paid_by_id: author.id,
            amount_cents: 9000, category: "food", split_strategy: "equal"
          },
          participant_ids: [ author.id, u2.id, tour.author_id ]
        }
      }.to change(Expense, :count).by(1).and change(ExpenseSplit, :count).by(2)  # 2 distinct splits (author.id == tour.author_id)

      body = JSON.parse(response.body)
      expect(body["amount_cents"]).to eq(9000)
      expect(body["splits"].size).to eq(2)
    end

    it "creates a tour-scope prepaid expense (both day/activity nil)" do
      login_as(author)
      post tour_expenses_path(tour), params: {
        expense: {
          scope: "tour", paid_by_id: author.id, amount_cents: 4500,
          category: "ticket", split_strategy: "equal", note: "签证"
        },
        participant_ids: [ author.id, u2.id ]
      }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["scope"]).to eq("tour")
    end

    it "creates an individual (各付各) expense with no splits" do
      login_as(author)
      post tour_expenses_path(tour), params: {
        expense: {
          scope: "activity", activity_id: activity.id, paid_by_id: author.id,
          amount_cents: 140, category: "fuel", split_strategy: "individual"
        }
      }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["splits"]).to eq([])
    end

    it "rejects expenses on backlog activities with 422" do
      backlog = create(:activity, tour: tour, day: nil)
      login_as(author)
      post tour_expenses_path(tour), params: {
        expense: {
          scope: "activity", activity_id: backlog.id, paid_by_id: author.id,
          amount_cents: 100, category: "food", split_strategy: "equal"
        },
        participant_ids: [ author.id ]
      }
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body)["errors"].first).to match(/候选池/)
    end

    it "non-editor is forbidden" do
      login_as(create(:user))
      post tour_expenses_path(tour), params: {
        expense: { scope: "activity", activity_id: activity.id, paid_by_id: author.id, amount_cents: 100, category: "food", split_strategy: "equal" }
      }
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH /expenses/:id" do
    it "updates amount and recomputes splits" do
      e = Expense.create!(
        tour: tour, activity: activity, scope: :activity,
        paid_by: author, created_by: author,
        amount_cents: 9000, category: :food, split_strategy: :equal
      )
      Expense::ComputeSplits.new(e, participant_ids: [ author.id, u2.id ]).call
      login_as(author)
      patch expense_path(e), params: {
        expense: { amount_cents: 12_000 },
        participant_ids: [ author.id, u2.id ]
      }
      expect(response).to have_http_status(:ok)
      expect(e.reload.amount_cents).to eq(12_000)
      expect(e.splits.pluck(:amount_cents).sum).to eq(12_000)
    end
  end

  describe "DELETE /expenses/:id" do
    it "deletes expense and cascades splits" do
      e = Expense.create!(
        tour: tour, activity: activity, scope: :activity,
        paid_by: author, created_by: author,
        amount_cents: 100, category: :food, split_strategy: :individual
      )
      login_as(author)
      expect { delete expense_path(e) }.to change(Expense, :count).by(-1)
      expect(response).to have_http_status(:no_content)
    end
  end
end
