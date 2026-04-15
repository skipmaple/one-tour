require "rails_helper"

RSpec.describe ChatStreamJob do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }
  let(:conversation) { create(:conversation, tour: tour, user: user) }

  before do
    create(:message, conversation: conversation, role: :user, content: "加个赛里木湖")
  end

  it "broadcasts tool_call_start/result and assistant_text events + persists assistant message" do
    fake_chat = instance_double(RubyLLM::Chat)
    allow(RubyLLM).to receive(:chat).and_return(fake_chat)
    allow(fake_chat).to receive(:with_instructions).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tool).and_return(fake_chat)
    allow(fake_chat).to receive(:messages).and_return([])

    allow(fake_chat).to receive(:ask) do |_msg, &block|
      block.call(double("Event", type: :tool_call_start, name: "add_activity", arguments: {}, id: "tc1"))
      block.call(double("Event", type: :tool_call_result, id: "tc1", result: { ok: true }))
      block.call(double("Event", type: :text, delta: "已加入 D2"))
      "已加入 D2"
    end

    broadcasts = []
    allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

    expect {
      described_class.new.perform(conversation.id, tour.id, user.id)
    }.to change { conversation.reload.messages.count }.by(1)

    assistant_msg = conversation.messages.where(role: :assistant).last
    expect(assistant_msg.content).to include("已加入")

    expect(broadcasts).to include(hash_including(type: "tool_call_start", name: "add_activity", id: "tc1"))
    expect(broadcasts).to include(hash_including(type: "tool_call_result", id: "tc1"))
    expect(broadcasts).to include(hash_including(type: "assistant_text", delta: "已加入 D2"))
    expect(broadcasts).to include(hash_including(type: "complete"))
  end

  it "broadcasts an error event when the job raises" do
    fake_chat = instance_double(RubyLLM::Chat)
    allow(RubyLLM).to receive(:chat).and_return(fake_chat)
    allow(fake_chat).to receive(:with_instructions).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tool).and_return(fake_chat)
    allow(fake_chat).to receive(:messages).and_return([])
    allow(fake_chat).to receive(:ask).and_raise("LLM connection failed")

    broadcasts = []
    allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }

    described_class.new.perform(conversation.id, tour.id, user.id)

    expect(broadcasts).to include(hash_including(type: "error", message: "LLM connection failed"))
  end

  it "calls with_tool for each tool in AITools::Schema.all" do
    fake_chat = instance_double(RubyLLM::Chat)
    allow(RubyLLM).to receive(:chat).and_return(fake_chat)
    allow(fake_chat).to receive(:with_instructions).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tool).and_return(fake_chat)
    allow(fake_chat).to receive(:messages).and_return([])
    allow(fake_chat).to receive(:ask) do |_msg, &block|
      block.call(double("Event", type: :text, delta: "ok"))
      "ok"
    end
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new.perform(conversation.id, tour.id, user.id)

    expect(fake_chat).to have_received(:with_tool).exactly(AITools::Schema.all.size).times
  end

  it "replays prior messages excluding the latest into chat history" do
    create(:message, conversation: conversation, role: :assistant, content: "上一条助手回复")
    create(:message, conversation: conversation, role: :user, content: "再加一个")

    fake_messages = []
    fake_chat = instance_double(RubyLLM::Chat)
    allow(RubyLLM).to receive(:chat).and_return(fake_chat)
    allow(fake_chat).to receive(:with_instructions).and_return(fake_chat)
    allow(fake_chat).to receive(:with_tool).and_return(fake_chat)
    allow(fake_chat).to receive(:messages).and_return(fake_messages)
    allow(fake_chat).to receive(:ask) do |_msg, &block|
      block.call(double("Event", type: :text, delta: "done"))
      "done"
    end
    allow(ActionCable.server).to receive(:broadcast)

    described_class.new.perform(conversation.id, tour.id, user.id)

    replayed_contents = fake_messages.map(&:content)
    expect(replayed_contents).to include("加个赛里木湖")
    expect(replayed_contents).to include("上一条助手回复")
    expect(replayed_contents).not_to include("再加一个")
  end
end
