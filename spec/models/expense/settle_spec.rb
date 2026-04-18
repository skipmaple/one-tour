require "rails_helper"

RSpec.describe Expense::Settle do
  it "produces no transfers when all balances are zero" do
    expect(described_class.new(1 => 0, 2 => 0, 3 => 0).call).to eq([])
  end

  it "handles simple 3-person case with one creditor" do
    # 1 owed +3000, 2 and 3 each owe -1500
    transfers = described_class.new(1 => 3000, 2 => -1500, 3 => -1500).call
    expect(transfers).to contain_exactly(
      { from_user_id: 2, to_user_id: 1, amount_cents: 1500 },
      { from_user_id: 3, to_user_id: 1, amount_cents: 1500 },
    )
  end

  it "handles 2-creditor case (plan example)" do
    # 张三 +3736, 李四 +2749, 王五 -6485
    transfers = described_class.new(1 => 3736, 2 => 2749, 3 => -6485).call
    # 3 → 1: 3736; 3 → 2: 2749 (2 笔解决)
    expect(transfers.size).to eq(2)
    expect(transfers.sum { |t| t[:amount_cents] }).to eq(6485)
    expect(transfers.all? { |t| t[:from_user_id] == 3 }).to be true
  end

  it "handles single chain (A owes B owes C)" do
    transfers = described_class.new(1 => -500, 2 => 0, 3 => 500).call
    expect(transfers).to eq([ { from_user_id: 1, to_user_id: 3, amount_cents: 500 } ])
  end

  it "uses at most N-1 transfers for N members (greedy bound)" do
    net = { 1 => 1000, 2 => -400, 3 => -300, 4 => -300 }
    transfers = described_class.new(net).call
    expect(transfers.size).to be <= 3
    expect(transfers.sum { |t| t[:amount_cents] }).to eq(1000)
  end
end
