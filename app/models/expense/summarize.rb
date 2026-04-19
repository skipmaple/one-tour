# Aggregates a tour's expenses into the shape consumed by ExpenseDrawer props.
# Includes "individual" (各付各) expenses in totals but excludes them from the
# per-member settlement computation (they have no ExpenseSplit rows).
#
# Net balance accounting:
#   outstanding_net = paid - owed + settled_out - settled_in
# A user who paid out a settlement reduces what they still owe others by that
# amount (so their net goes UP toward zero); the recipient's net comes DOWN
# toward zero because they've already received the receivable.
class Expense::Summarize
  def initialize(tour, current_user)
    @tour = tour
    @current_user = current_user
  end

  def call
    expenses = @tour.expenses.includes(:splits).to_a
    splits = expenses.flat_map(&:splits)
    settlements = @tour.settlements.to_a

    {
      total_cents:             expenses.sum(&:amount_cents),
      currency:                @tour.currency,
      per_member_paid:         group_sum(expenses, :paid_by_id, :amount_cents),
      per_member_owed:         group_sum(splits, :user_id, :amount_cents),
      per_member_settled_out:  group_sum(settlements, :from_user_id, :amount_cents),
      per_member_settled_in:   group_sum(settlements, :to_user_id, :amount_cents),
      per_day:                 group_sum(expenses.select { |e| e.day_id.present? }, :day_id, :amount_cents),
      per_activity:            group_sum(expenses.select { |e| e.activity_id.present? }, :activity_id, :amount_cents),
      current_user_balance:    current_user_balance(expenses, splits, settlements)
    }
  end

  private
    def group_sum(collection, group_attr, sum_attr)
      collection.group_by { |r| r.public_send(group_attr) }
                .transform_values { |rows| rows.sum { |r| r.public_send(sum_attr) } }
    end

    def current_user_balance(expenses, splits, settlements)
      return nil if @current_user.nil?

      uid = @current_user.id
      paid = expenses.select { |e| e.paid_by_id == uid }.sum(&:amount_cents)
      owed = splits.select { |s| s.user_id == uid }.sum(&:amount_cents)
      settled_out = settlements.select { |s| s.from_user_id == uid }.sum(&:amount_cents)
      settled_in  = settlements.select { |s| s.to_user_id   == uid }.sum(&:amount_cents)

      # "My spend" — the money I actually bear for this trip. Two parts:
      #   1. My share of split expenses (owed_cents).
      #   2. Individual (各付各) expenses I paid for myself — no split row exists
      #      for these, so they're invisible to owed_cents, but they're 100%
      #      my personal cost. Without this component, a user recording all
      #      their own meals as 各付各 would see a permanently empty budget
      #      bar (the bug that surfaced in production testing on tour 5).
      individual_paid = expenses
        .select { |e| e.paid_by_id == uid && e.split_individual? }
        .sum(&:amount_cents)
      spend = owed + individual_paid

      tour_budget = @tour.tour_budgets.find_by(user_id: uid, day_id: nil, activity_id: nil)

      {
        paid_cents:              paid,
        owed_cents:              owed,
        my_spend_cents:          spend,
        settled_out_cents:       settled_out,
        settled_in_cents:        settled_in,
        net_cents:               paid - owed + settled_out - settled_in,
        tour_budget_cents:       tour_budget&.amount_cents,
        over_tour_budget_cents:  tour_budget ? [ spend - tour_budget.amount_cents, 0 ].max : nil
      }
    end
end
