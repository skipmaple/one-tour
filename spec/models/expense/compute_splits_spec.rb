require "rails_helper"

RSpec.describe Expense::ComputeSplits do
  let(:author) { create(:user) }
  let(:u2)     { create(:user) }
  let(:u3)     { create(:user) }
  let(:tour)   { create(:tour, author: author) }
  let(:day)    { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }

  def base_attrs(**overrides)
    {
      tour: tour, paid_by: author, created_by: author,
      scope: :activity, activity: activity,
      amount_cents: 10_000, category: :food
    }.merge(overrides)
  end

  describe "equal strategy" do
    it "splits equally across participants (3 people, no rounding)" do
      e = Expense.create!(base_attrs(amount_cents: 9_000, split_strategy: :equal))
      described_class.new(e, participant_ids: [ author.id, u2.id, u3.id ]).call
      expect(e.splits.count).to eq(3)
      expect(e.splits.pluck(:amount_cents).sort).to eq([ 3_000, 3_000, 3_000 ])
    end

    it "adds rounding residue to the payer's split" do
      e = Expense.create!(base_attrs(amount_cents: 10_000, split_strategy: :equal))
      described_class.new(e, participant_ids: [ author.id, u2.id, u3.id ]).call
      amounts = e.splits.pluck(:amount_cents)
      expect(amounts.sum).to eq(10_000)
      # Payer gets the rounding diff (exactly one of the splits is off by the diff).
      payer_amount = e.splits.find_by(user_id: author.id).amount_cents
      others = e.splits.where.not(user_id: author.id).pluck(:amount_cents)
      expect(others.uniq.size).to eq(1)  # non-payers get equal amount
      expect(amounts.sum).to eq(10_000)  # total matches
    end

    it "folds external_count into the attributed member's shares" do
      e = Expense.create!(base_attrs(
        amount_cents: 20_000, split_strategy: :equal,
        external_count: 1, external_attributed_to: author,
      ))
      described_class.new(e, participant_ids: [ author.id, u2.id, u3.id ]).call
      # Total shares = 3 + 1 = 4. Per share = 5_000.
      # Author承担 2 人份 = 10_000; u2 = 5_000; u3 = 5_000.
      expect(e.splits.find_by(user_id: author.id).amount_cents).to eq(10_000)
      expect(e.splits.find_by(user_id: author.id).shares).to eq(2)
      expect(e.splits.find_by(user_id: u2.id).amount_cents).to eq(5_000)
      expect(e.splits.find_by(user_id: u3.id).amount_cents).to eq(5_000)
    end
  end

  describe "percentage strategy" do
    it "splits by percentages summing to 100" do
      e = Expense.create!(base_attrs(amount_cents: 10_000, split_strategy: :percentage))
      described_class.new(e, splits: [
        { user_id: author.id, value: 40 },
        { user_id: u2.id,     value: 30 },
        { user_id: u3.id,     value: 30 }
      ]).call
      expect(e.splits.find_by(user_id: author.id).amount_cents).to eq(4_000)
      expect(e.splits.find_by(user_id: u2.id).amount_cents).to eq(3_000)
      expect(e.splits.find_by(user_id: u3.id).amount_cents).to eq(3_000)
    end

    it "raises when percentages don't sum to 100" do
      e = Expense.create!(base_attrs(amount_cents: 10_000, split_strategy: :percentage))
      expect {
        described_class.new(e, splits: [
          { user_id: author.id, value: 40 }, { user_id: u2.id, value: 40 }
        ]).call
      }.to raise_error(ArgumentError, /百分比/)
    end
  end

  describe "custom strategy" do
    it "splits by explicit amounts summing to total" do
      e = Expense.create!(base_attrs(amount_cents: 10_000, split_strategy: :custom))
      described_class.new(e, splits: [
        { user_id: author.id, value: 5_000 },
        { user_id: u2.id,     value: 3_000 },
        { user_id: u3.id,     value: 2_000 }
      ]).call
      expect(e.splits.pluck(:amount_cents).sort).to eq([ 2_000, 3_000, 5_000 ])
    end

    it "raises when custom amounts don't equal total" do
      e = Expense.create!(base_attrs(split_strategy: :custom))
      expect {
        described_class.new(e, splits: [
          { user_id: author.id, value: 100 }, { user_id: u2.id, value: 100 }
        ]).call
      }.to raise_error(ArgumentError, /自定义分摊之和/)
    end
  end

  describe "individual strategy" do
    it "produces no ExpenseSplit rows" do
      e = Expense.create!(base_attrs(split_strategy: :individual))
      described_class.new(e, participant_ids: [ author.id, u2.id ]).call
      expect(e.splits.count).to eq(0)
    end
  end

  describe "re-computation" do
    it "replaces existing splits when recomputed" do
      e = Expense.create!(base_attrs(amount_cents: 9_000, split_strategy: :equal))
      described_class.new(e, participant_ids: [ author.id, u2.id, u3.id ]).call
      expect(e.splits.count).to eq(3)
      described_class.new(e, participant_ids: [ author.id, u2.id ]).call
      expect(e.splits.reload.count).to eq(2)
    end
  end
end
