# Aggregates a tour's expenses into the shape consumed by ExpenseDrawer props.
# Includes "individual" (各付各) expenses in totals but excludes them from the
# per-member settlement computation (they have no ExpenseSplit rows).
class Expense::Summarize
  def initialize(tour, current_user)
    @tour = tour
    @current_user = current_user
  end

  def call
    expenses = @tour.expenses.includes(:splits).to_a
    splits = expenses.flat_map(&:splits)

    {
      total_cents:             expenses.sum(&:amount_cents),
      currency:                @tour.currency,
      per_member_paid:         group_sum(expenses, :paid_by_id, :amount_cents),
      per_member_owed:         group_sum(splits, :user_id, :amount_cents),
      per_day:                 group_sum(expenses.select { |e| e.day_id.present? }, :day_id, :amount_cents),
      per_activity:            group_sum(expenses.select { |e| e.activity_id.present? }, :activity_id, :amount_cents),
      current_user_balance:    current_user_balance(expenses, splits)
    }
  end

  private
    def group_sum(collection, group_attr, sum_attr)
      collection.group_by { |r| r.public_send(group_attr) }
                .transform_values { |rows| rows.sum { |r| r.public_send(sum_attr) } }
    end

    def current_user_balance(expenses, splits)
      return nil if @current_user.nil?

      uid = @current_user.id
      paid = expenses.select { |e| e.paid_by_id == uid }.sum(&:amount_cents)
      owed = splits.select { |s| s.user_id == uid }.sum(&:amount_cents)
      tour_budget = @tour.tour_budgets.find_by(user_id: uid, day_id: nil, activity_id: nil)

      {
        paid_cents:              paid,
        owed_cents:              owed,
        net_cents:               paid - owed,
        tour_budget_cents:       tour_budget&.amount_cents,
        over_tour_budget_cents:  tour_budget ? [ owed - tour_budget.amount_cents, 0 ].max : nil
      }
    end
end
