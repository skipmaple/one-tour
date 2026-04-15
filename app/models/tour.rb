class Tour < ApplicationRecord
  belongs_to :author, class_name: "User"
  has_many :tour_memberships, dependent: :destroy
  has_many :members, through: :tour_memberships, source: :user
  has_many :days, -> { order(:day_index) }, dependent: :destroy
  has_many :activities, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :title, presence: true

  before_create :seed_constitution_defaults

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

  private
    def editor_member?(user)
      tour_memberships.exists?(user: user, role: :editor)
    end

    def member?(user)
      tour_memberships.exists?(user: user)
    end

    def seed_constitution_defaults
      self.constitution = Constitution::DEFAULTS.deep_stringify_keys if constitution.blank?
    end
end
