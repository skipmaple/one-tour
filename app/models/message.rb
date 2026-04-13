class Message < ApplicationRecord
  belongs_to :conversation

  enum :role, { user: 0, assistant: 1, system: 2 }
end
