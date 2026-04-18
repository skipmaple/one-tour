# Greedy N-1 minimum-transfer settlement.
#
# Input: each member's net cents (paid - owed). Positive = should receive,
# negative = should pay.
#
# Algorithm: at each step, match the member who's owed most with the member
# who owes most, transfer the smaller of the two absolute values, repeat until
# all balances are zero.
#
# Output: [ { from_user_id, to_user_id, amount_cents } ]
class Expense::Settle
  # net_by_user: { user_id => cents }  (positive = 应收, negative = 应付)
  def initialize(net_by_user)
    @net = net_by_user.dup
  end

  def call
    transfers = []
    loop do
      creditor_id, creditor_net = @net.max_by { |_, v| v }
      debtor_id,   debtor_net   = @net.min_by { |_, v| v }
      break if creditor_net <= 0 || debtor_net >= 0

      amount = [ creditor_net, -debtor_net ].min
      transfers << { from_user_id: debtor_id, to_user_id: creditor_id, amount_cents: amount }
      @net[creditor_id] -= amount
      @net[debtor_id]   += amount
    end
    transfers
  end
end
