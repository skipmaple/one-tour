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
end
