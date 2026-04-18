class Tour < ApplicationRecord
  belongs_to :author, class_name: "User"
  has_many :tour_memberships, dependent: :destroy
  has_many :members, through: :tour_memberships, source: :user
  has_many :days, -> { order(:day_index) }, dependent: :destroy
  has_many :activities, dependent: :destroy
  has_many :tour_budgets, dependent: :destroy
  has_many :expenses, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :title, presence: true

  before_create :seed_constitution_defaults
  after_create_commit :seed_first_day

  def owned_by?(user)
    if user
      author_id == user.id
    else
      false
    end
  end

  def editable_by?(user)
    if user
      owned_by?(user) || editor_member?(user)
    else
      false
    end
  end

  def visible_to?(user)
    if user
      owned_by?(user) || member?(user)
    else
      false
    end
  end

  def tier_two_food_count
    activities.where(kind: :food, citizen_level: :tier_two).count
  end

  def buffer_days_count
    days.where(buffer_day: true).count
  end

  def record_override!(rule:, scope:, reason:)
    with_lock do
      norm_scope = normalize_scope(scope)
      new_entry = {
        "rule"            => rule.to_s,
        "scope"           => norm_scope,
        "reason"          => reason.to_s,
        "acknowledged_at" => Time.current.iso8601
      }
      filtered = Array(constraint_overrides).reject do |o|
        o["rule"].to_s == new_entry["rule"] &&
          normalize_scope(o["scope"]) == norm_scope
      end
      update!(constraint_overrides: filtered + [ new_entry ])
    end
  end

  def revoke_override!(rule:, scope:)
    with_lock do
      norm_scope = normalize_scope(scope)
      filtered = Array(constraint_overrides).reject do |o|
        o["rule"].to_s == rule.to_s &&
          normalize_scope(o["scope"]) == norm_scope
      end
      update!(constraint_overrides: filtered)
    end
  end

  private
    def editor_member?(user)
      tour_memberships.exists?(user: user, role: :editor)
    end

    def member?(user)
      tour_memberships.exists?(user: user)
    end

    def normalize_scope(raw)
      (raw || {}).stringify_keys.slice("day_id", "activity_id")
    end

    def seed_constitution_defaults
      self.constitution = Constitution::DEFAULTS.deep_stringify_keys.merge(constitution.presence || {})
    end

    def seed_first_day
      days.find_or_create_by!(day_index: 1)
    end
end
