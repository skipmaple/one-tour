class Tour < ApplicationRecord
  belongs_to :author, class_name: "User"
  has_many :tour_memberships, dependent: :destroy
  has_many :members, through: :tour_memberships, source: :user
  has_many :days, -> { order(:day_index) }, dependent: :destroy
  has_many :activities, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :title, presence: true

  before_create :seed_constitution_defaults

  private
    def seed_constitution_defaults
      self.constitution = Constitution::DEFAULTS.deep_stringify_keys if constitution.blank?
    end
end
