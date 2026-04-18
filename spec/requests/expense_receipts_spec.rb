require "rails_helper"

RSpec.describe "ExpenseReceipts", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }
  let(:day)    { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }
  let(:expense) do
    Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: author, created_by: author,
      amount_cents: 200, category: :food, split_strategy: :individual
    )
  end

  def fake_image
    Rack::Test::UploadedFile.new(StringIO.new("fake"), "image/jpeg", original_filename: "r.jpg")
  end

  it "uploads a receipt to an expense" do
    login_as(author)
    expect {
      post expense_receipts_path(expense), params: { file: fake_image }
    }.to change(ExpenseReceipt, :count).by(1)
    expect(JSON.parse(response.body)["url"]).to be_present
  end

  it "non-editor is forbidden" do
    login_as(create(:user))
    post expense_receipts_path(expense), params: { file: fake_image }
    expect(response).to have_http_status(:forbidden)
  end

  it "deletes a receipt" do
    r = expense.receipts.build(uploaded_by: author, position: 1)
    r.file.attach(io: StringIO.new("f"), filename: "r.jpg", content_type: "image/jpeg")
    r.save!
    login_as(author)
    expect { delete expense_receipt_path(r) }.to change(ExpenseReceipt, :count).by(-1)
  end
end
