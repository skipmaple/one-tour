require "rails_helper"

RSpec.describe Expense::Summarize do
  let(:author) { create(:user) }
  let(:u2) { create(:user) }
  let(:tour) { create(:tour, author: author) }
  let(:day)  { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }

  def create_expense(paid_by:, amount:, participants: [])
    e = Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: paid_by, created_by: paid_by,
      amount_cents: amount, category: :food, split_strategy: :equal
    )
    Expense::ComputeSplits.new(e, participant_ids: participants.map(&:id)).call
    e
  end

  it "aggregates totals, per_member_paid, per_member_owed" do
    create_expense(paid_by: author, amount: 6000, participants: [ author, u2 ])
    create_expense(paid_by: u2,     amount: 2000, participants: [ author, u2 ])
    summary = described_class.new(tour, author).call

    expect(summary[:total_cents]).to eq(8000)
    expect(summary[:per_member_paid]).to eq(author.id => 6000, u2.id => 2000)
    expect(summary[:per_member_owed][author.id]).to eq(4000)  # 3000 + 1000
    expect(summary[:per_member_owed][u2.id]).to eq(4000)
  end

  it "computes current_user_balance for the logged-in user" do
    create_expense(paid_by: author, amount: 6000, participants: [ author, u2 ])
    summary = described_class.new(tour, author).call
    expect(summary[:current_user_balance][:paid_cents]).to eq(6000)
    expect(summary[:current_user_balance][:owed_cents]).to eq(3000)
    expect(summary[:current_user_balance][:net_cents]).to eq(3000)  # 垫了 6000 − 承担 3000 = 应收 3000
  end

  it "includes individual (各付各) expenses in totals but excludes from splits" do
    create_expense(paid_by: author, amount: 2000, participants: [ author, u2 ])
    ind = Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: author, created_by: author,
      amount_cents: 1400, category: :fuel, split_strategy: :individual
    )
    summary = described_class.new(tour, author).call
    # 总消费 = 2000 + 1400 = 3400
    expect(summary[:total_cents]).to eq(3400)
    # 但 individual 的 1400 不生成 splits，所以 owed 只有 1000
    expect(summary[:per_member_owed][author.id]).to eq(1000)
  end

  it "returns nil balance when current_user is nil" do
    summary = described_class.new(tour, nil).call
    expect(summary[:current_user_balance]).to be_nil
  end

  it "reports over_tour_budget_cents when owed > tour budget" do
    TourBudget.create!(tour: tour, user: author, amount_cents: 2000)
    create_expense(paid_by: author, amount: 6000, participants: [ author, u2 ])
    summary = described_class.new(tour, author).call
    # author's split share = 3000; budget 2000 → over 1000
    expect(summary[:current_user_balance][:over_tour_budget_cents]).to eq(1000)
  end

  # Regression: budget progress must include 各付各 expenses the user paid.
  # Previously `my_spend_cents` was just `owed_cents`, so a user who
  # recorded all their own meals as 各付各 saw a permanently empty budget
  # bar. Fix: spend = owed + Σ individual-expenses-I-paid.
  it "counts individual (各付各) expenses the user paid into my_spend_cents" do
    # Split expense: author's share = 1000
    create_expense(paid_by: author, amount: 2000, participants: [ author, u2 ])
    # Individual expense paid by author: full 500 is author's own cost
    Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: author, created_by: author,
      amount_cents: 500, category: :food, split_strategy: :individual
    )
    # Individual paid by someone else: zero for author
    Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: u2, created_by: u2,
      amount_cents: 9999, category: :food, split_strategy: :individual
    )

    summary = described_class.new(tour, author).call
    expect(summary[:current_user_balance][:owed_cents]).to eq(1000)
    expect(summary[:current_user_balance][:my_spend_cents]).to eq(1500)
  end

  it "uses my_spend_cents (not owed) for over_tour_budget_cents" do
    TourBudget.create!(tour: tour, user: author, amount_cents: 1200)
    # Only individual expenses by author — owed=0 but spend=2000
    Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: author, created_by: author,
      amount_cents: 2000, category: :food, split_strategy: :individual
    )
    summary = described_class.new(tour, author).call
    expect(summary[:current_user_balance][:owed_cents]).to eq(0)
    expect(summary[:current_user_balance][:my_spend_cents]).to eq(2000)
    # spend 2000 over budget 1200 → 800
    expect(summary[:current_user_balance][:over_tour_budget_cents]).to eq(800)
  end

  # Regression: the headline bug from tour-5 production testing.
  # Individual (各付各) expenses must NOT produce phantom "应收" because
  # the payer paid for themselves — nobody else is on the hook. Before the
  # fix, paid_cents summed all expenses including individual, so a user who
  # dropped ¥100,000 on their own meal saw "应收 ¥100,000" from nobody.
  it "individual expenses do not affect net_cents" do
    # Baseline: author paid ¥100 AA with u2. net = 100 paid - 50 owed = +50
    create_expense(paid_by: author, amount: 10_000, participants: [ author, u2 ])
    baseline = described_class.new(tour, author).call[:current_user_balance][:net_cents]
    expect(baseline).to eq(5_000)

    # Add a huge individual expense by author — net should not budge
    Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: author, created_by: author,
      amount_cents: 10_000_000, category: :food, split_strategy: :individual
    )
    after = described_class.new(tour, author).call[:current_user_balance][:net_cents]
    expect(after).to eq(5_000)
    # paid_cents (settlement-scoped) should also be unchanged
    expect(described_class.new(tour, author).call[:current_user_balance][:paid_cents]).to eq(10_000)
  end

  it "per_member_paid excludes individual expenses too" do
    create_expense(paid_by: author, amount: 5_000, participants: [ author, u2 ])
    Expense.create!(
      tour: tour, activity: activity, scope: :activity,
      paid_by: author, created_by: author,
      amount_cents: 99_999, category: :food, split_strategy: :individual
    )
    summary = described_class.new(tour, author).call
    # only the split ¥5000 counts for settlement purposes
    expect(summary[:per_member_paid][author.id]).to eq(5_000)
  end
end
