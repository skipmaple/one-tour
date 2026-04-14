require 'rails_helper'

RSpec.describe ChatStreamJob do
  let(:user) { create(:user) }
  let(:guidebook) { create(:guidebook, author: user) }
  let(:conversation) { create(:conversation, guidebook: guidebook, user: user) }
  let(:channel) { "chat_guidebook_#{guidebook.id}_user_#{user.id}" }

  before do
    create(:message, conversation: conversation, role: :user, content: "Plan me a trip")
  end

  def stub_chat_yielding(chunks)
    fake_chat = instance_double(RubyLLM::Chat)
    allow(fake_chat).to receive(:with_temperature).and_return(fake_chat)
    allow(fake_chat).to receive(:with_params).and_return(fake_chat)
    allow(fake_chat).to receive(:with_instructions).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tool).and_return(fake_chat)
    allow(fake_chat).to receive(:messages).and_return([])
    allow(fake_chat).to receive(:ask) do |_msg, &block|
      chunks.each { |c| block.call(RubyLLM::Chunk.new(role: :assistant, content: c)) }
    end
    allow(RubyLLM).to receive(:chat).and_return(fake_chat)
    fake_chat
  end

  it "aborts the stream when the model emits a long run of identical short chunks" do
    stub_chat_yielding(Array.new(60, "DIN"))

    broadcasts = []
    allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

    expect {
      described_class.new.perform(conversation.id, guidebook.id, user.id)
    }.not_to change { conversation.messages.where(role: :assistant).count }

    error_broadcast = broadcasts.find { |p| p[:type] == "error" }
    expect(error_broadcast).not_to be_nil
    expect(error_broadcast[:content]).to match(/重复输出/)
    expect(broadcasts).to include(hash_including(type: "complete", content: ""))
  end

  it "streams normal responses without firing the repetition guard" do
    stub_chat_yielding([ "Hello", ", ", "world", "!", " " ])

    broadcasts = []
    allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

    expect {
      described_class.new.perform(conversation.id, guidebook.id, user.id)
    }.to change { conversation.messages.where(role: :assistant).count }.by(1)

    expect(broadcasts.count { |p| p[:type] == "chunk" }).to eq(5)
    expect(broadcasts.last[:type]).to eq("complete")
    expect(broadcasts).not_to include(hash_including(type: "error"))
  end

  it "does not trip on identical long chunks (only short repeated tokens count)" do
    long = "这是一段比较长的正常中文描述内容，不应被当作 token 退化。"
    stub_chat_yielding(Array.new(60, long))

    broadcasts = []
    allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

    described_class.new.perform(conversation.id, guidebook.id, user.id)

    expect(broadcasts.last[:type]).to eq("complete")
    expect(broadcasts).not_to include(hash_including(type: "error"))
  end

  it "configures the chat with sampling params that discourage repetition" do
    chat = stub_chat_yielding([ "ok" ])
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new.perform(conversation.id, guidebook.id, user.id)

    expect(chat).to have_received(:with_temperature).with(0.7)
    expect(chat).to have_received(:with_params).with(
      hash_including(frequency_penalty: be > 0, presence_penalty: be > 0, max_tokens: be > 0)
    )
  end

  it "filters out degenerate prior assistant messages when replaying history" do
    create(:message, conversation: conversation, role: :assistant, content: ("DIN " * 200).strip)
    create(:message, conversation: conversation, role: :user, content: "Continue")

    fake_messages = []
    fake_chat = instance_double(RubyLLM::Chat)
    allow(fake_chat).to receive(:with_temperature).and_return(fake_chat)
    allow(fake_chat).to receive(:with_params).and_return(fake_chat)
    allow(fake_chat).to receive(:with_instructions).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tool).and_return(fake_chat)
    allow(fake_chat).to receive(:messages).and_return(fake_messages)
    allow(fake_chat).to receive(:ask) do |_msg, &block|
      block.call(RubyLLM::Chunk.new(role: :assistant, content: "ok"))
    end
    allow(RubyLLM).to receive(:chat).and_return(fake_chat)
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new.perform(conversation.id, guidebook.id, user.id)

    replayed_contents = fake_messages.map(&:content)
    expect(replayed_contents).to include("Plan me a trip")
    expect(replayed_contents).not_to include(include("DIN DIN DIN DIN"))
  end

  describe "has_guidebook_content in complete broadcast" do
    it "is false when output is a truncated YAML with no closing delimiter" do
      stub_chat_yielding([ "---\n```yaml\ntitle: Test\n" ])

      broadcasts = []
      allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

      described_class.new.perform(conversation.id, guidebook.id, user.id)

      complete = broadcasts.find { |p| p[:type] == "complete" }
      expect(complete[:has_guidebook_content]).to be(false)
    end

    it "is false when frontmatter is well-formed but days array is empty" do
      stub_chat_yielding([ "---\ntitle: Test\ndays: []\n---\n\n# Body\n" ])

      broadcasts = []
      allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

      described_class.new.perform(conversation.id, guidebook.id, user.id)

      complete = broadcasts.find { |p| p[:type] == "complete" }
      expect(complete[:has_guidebook_content]).to be(false)
    end

    it "is true when frontmatter parses cleanly with at least one day" do
      content = <<~MD
        ---
        title: Test Trip
        days:
          - day: 1
            title: Arrive
            coordinates: [43.8, 87.6]
        ---

        # Test Trip
      MD
      stub_chat_yielding([ content ])

      broadcasts = []
      allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

      described_class.new.perform(conversation.id, guidebook.id, user.id)

      complete = broadcasts.find { |p| p[:type] == "complete" }
      expect(complete[:has_guidebook_content]).to be(true)
    end
  end
end
