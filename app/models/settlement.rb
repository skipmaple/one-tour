class Settlement < ApplicationRecord
  belongs_to :tour
  belongs_to :from_user,   class_name: "User"
  belongs_to :to_user,     class_name: "User"
  belongs_to :recorded_by, class_name: "User"

  validates :amount_cents, presence: true, numericality: { greater_than: 0 }
  validates :settled_at,   presence: true
  validate  :different_users
  validate  :both_sides_tour_members
  validate  :recorder_is_party_or_editor

  before_validation :default_settled_at

  private
    def default_settled_at
      self.settled_at ||= Time.current
    end

    def different_users
      errors.add(:to_user_id, "不能转给自己") if from_user_id == to_user_id
    end

    # Settlements only make sense between people who appear in the tour's
    # expense ledger. Using tour visibility as the proxy — the membership
    # check blocks e.g. "author records a settlement to a random user".
    def both_sides_tour_members
      return unless tour && from_user && to_user
      [ from_user, to_user ].each do |u|
        unless tour.visible_to?(u)
          errors.add(:base, "#{u.email} 不在此行程成员里")
        end
      end
    end

    # Who may record a settlement:
    #   - either party (it's their own money)
    #   - any tour editor (coordinator role)
    # An uninvolved reader-member could otherwise forge ledger entries
    # between other people.
    def recorder_is_party_or_editor
      return unless tour && recorded_by
      return if recorded_by_id == from_user_id || recorded_by_id == to_user_id
      return if tour.editable_by?(recorded_by)
      errors.add(:recorded_by_id, "只能记录自己参与的转账，除非你是编辑者")
    end
end
