class User < ApplicationRecord
  has_many :oauth_identities, dependent: :destroy

  validates :name, presence: true
  validates :email, presence: true, uniqueness: true
end
