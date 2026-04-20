class Message < ApplicationRecord
  belongs_to :conversation

  enum :role, { user: 0, assistant: 1, system: 2, tool: 3 }

  scope :billable, -> { where(role: :assistant).where.not(tokens_out: nil) }

  # Override as_json so role is exposed as the enum key (string),
  # not the underlying integer. Frontend (useChat / MessageBubble)
  # reads `role` as 'user' / 'assistant' to render bubbles correctly.
  def as_json(options = nil)
    super.tap do |hash|
      hash["role"] = role if hash.key?("role")
    end
  end
end
