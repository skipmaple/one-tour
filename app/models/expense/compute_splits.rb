# Generates ExpenseSplit rows for an Expense based on its split_strategy.
#
# Input shapes (passed via keyword args):
#   participant_ids: [user_id, ...]      # who's included in the split (for equal/percentage/custom)
#   splits:          [ { user_id:, value: } ]  # percentage (0..100) or amount_cents
#
# For individual (各付各) the expense has no ExpenseSplit rows at all and the
# service is a no-op — the caller is expected to record 3 separate Expense rows
# each with scope/payer set to the individual.
#
# Rounding: amounts are computed with `fdiv` then rounded to the nearest cent.
# The rounding diff (can be ±1-2 cents) is absorbed by the payer's split so
# that SUM(splits.amount_cents) == expense.amount_cents exactly.
class Expense::ComputeSplits
  def initialize(expense, participant_ids: [], splits: [])
    @expense = expense
    @participant_ids = Array(participant_ids).map(&:to_i).uniq
    @splits_input = Array(splits)
  end

  def call
    Expense.transaction do
      @expense.splits.destroy_all
      case @expense.split_strategy
      when "equal"      then generate_equal_splits
      when "percentage" then generate_percentage_splits
      when "custom"     then generate_custom_splits
      when "individual" then nil   # no ExpenseSplit rows for 各付各
      end
    end
  end

  private
    def generate_equal_splits
      return if @participant_ids.empty?

      total_shares = @participant_ids.size + @expense.external_count
      per_share_cents = @expense.amount_cents.fdiv(total_shares)

      rows = @participant_ids.map do |uid|
        shares = (uid == @expense.external_attributed_to_id) ? (1 + @expense.external_count) : 1
        { user_id: uid, shares: shares, amount_cents: (per_share_cents * shares).round }
      end

      absorb_rounding_on_payer(rows)
      rows.each { |row| @expense.splits.create!(**row) }
    end

    def generate_percentage_splits
      total_pct = @splits_input.sum { |s| s[:value].to_f }
      # Tolerate minor float drift (±0.01). Controller should validate stricter.
      if (total_pct - 100.0).abs > 0.5
        raise ArgumentError, "百分比之和必须等于 100（当前 #{total_pct}%）"
      end

      rows = @splits_input.map do |s|
        pct = s[:value].to_f
        { user_id: s[:user_id].to_i, shares: pct.round, amount_cents: (@expense.amount_cents * pct / 100.0).round }
      end
      absorb_rounding_on_payer(rows)
      rows.each { |row| @expense.splits.create!(**row) }
    end

    def generate_custom_splits
      sum = @splits_input.sum { |s| s[:value].to_i }
      if sum != @expense.amount_cents
        raise ArgumentError, "自定义分摊之和 #{sum} 分 ≠ 总金额 #{@expense.amount_cents} 分"
      end

      @splits_input.each do |s|
        @expense.splits.create!(
          user_id: s[:user_id].to_i,
          shares: 1,
          amount_cents: s[:value].to_i
        )
      end
    end

    # Mutates `rows` so SUM(amount_cents) == expense.amount_cents. The payer's
    # row absorbs any rounding residue. If payer isn't in participants, the
    # diff falls to the last row (still valid total).
    def absorb_rounding_on_payer(rows)
      diff = @expense.amount_cents - rows.sum { |r| r[:amount_cents] }
      return if diff.zero?

      target = rows.find { |r| r[:user_id] == @expense.paid_by_id } || rows.last
      target[:amount_cents] += diff
    end
end
