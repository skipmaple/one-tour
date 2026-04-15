require "rails_helper"

RSpec.describe ChatStreamJob do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }
  let(:conversation) { create(:conversation, tour: tour, user: user) }

  before do
    create(:message, conversation: conversation, role: :user, content: "加个赛里木湖")
  end

  # Minimal stand-in for RubyLLM::Chat that mirrors the real shape:
  # - `on_tool_call` / `on_tool_result` save the block
  # - `ask(msg, &block)` drives a scripted sequence of tool calls / chunks
  #
  # Scripted events live in `@script` as an array of hashes:
  #   { kind: :tool_call, id:, name:, arguments: }
  #   { kind: :tool_result, result: }
  #   { kind: :text, content: }
  class FakeChat
    attr_reader :instructions, :tools_registered, :messages

    def initialize(script: [])
      @script           = script
      @messages         = []
      @tools_registered = []
    end

    def with_instructions(instr)
      @instructions = instr
      self
    end

    def with_tool(tool)
      @tools_registered << tool
      self
    end

    def on_tool_call(&block)
      @tool_call_hook = block
      self
    end

    def on_tool_result(&block)
      @tool_result_hook = block
      self
    end

    def ask(_msg, &block)
      accumulated = "".dup
      @script.each do |ev|
        case ev[:kind]
        when :tool_call
          tc = Struct.new(:id, :name, :arguments).new(ev[:id], ev[:name], ev[:arguments] || {})
          @tool_call_hook&.call(tc)
        when :tool_result
          @tool_result_hook&.call(ev[:result])
        when :text
          accumulated << ev[:content].to_s
          block&.call(Struct.new(:content).new(ev[:content]))
        end
      end
      Struct.new(:content).new(accumulated)
    end
  end

  def stub_chat(script: [])
    FakeChat.new(script: script).tap do |fake|
      allow(RubyLLM).to receive(:chat).and_return(fake)
    end
  end

  it "broadcasts assistant_text chunks and persists the assistant message" do
    stub_chat(script: [
      { kind: :text, content: "已加入" },
      { kind: :text, content: " D2" }
    ])
    broadcasts = capture_broadcasts

    expect {
      described_class.new.perform(conversation.id, tour.id, user.id)
    }.to change { conversation.reload.messages.where(role: :assistant).count }.by(1)

    expect(conversation.messages.where(role: :assistant).last.content).to eq("已加入 D2")
    expect(broadcasts).to include(hash_including(type: "assistant_text", delta: "已加入"))
    expect(broadcasts).to include(hash_including(type: "assistant_text", delta: " D2"))
    expect(broadcasts).to include(hash_including(type: "complete", content: "已加入 D2"))
  end

  it "broadcasts tool_call_start before result, correlated by id" do
    stub_chat(script: [
      { kind: :tool_call, id: "tc1", name: "add_activity", arguments: { "day_index" => "backlog" } },
      { kind: :tool_result, result: { ok: true, activity_id: 42 } },
      { kind: :text, content: "done" }
    ])
    broadcasts = capture_broadcasts

    described_class.new.perform(conversation.id, tour.id, user.id)

    start_idx  = broadcasts.index { |b| b[:type] == "tool_call_start" }
    result_idx = broadcasts.index { |b| b[:type] == "tool_call_result" }
    expect(start_idx).not_to be_nil
    expect(result_idx).to be > start_idx
    expect(broadcasts[start_idx]).to include(id: "tc1", name: "add_activity")
    expect(broadcasts[result_idx]).to include(id: "tc1", result: { ok: true, activity_id: 42 })
  end

  it "skips chunks that carry no text content (tool-call-only chunks)" do
    stub_chat(script: [
      { kind: :text, content: "" },
      { kind: :text, content: nil },
      { kind: :text, content: "hi" }
    ])
    broadcasts = capture_broadcasts

    described_class.new.perform(conversation.id, tour.id, user.id)

    text_deltas = broadcasts.select { |b| b[:type] == "assistant_text" }.map { |b| b[:delta] }
    expect(text_deltas).to eq([ "hi" ])
  end

  it "broadcasts error when stream raises" do
    fake = stub_chat
    allow(fake).to receive(:ask).and_raise("LLM connection failed")
    broadcasts = capture_broadcasts

    described_class.new.perform(conversation.id, tour.id, user.id)

    expect(broadcasts).to include(hash_including(type: "error", message: "LLM connection failed"))
  end

  it "registers every tool from AITools::Schema.all" do
    fake = stub_chat(script: [ { kind: :text, content: "ok" } ])
    capture_broadcasts

    described_class.new.perform(conversation.id, tour.id, user.id)

    expect(fake.tools_registered.size).to eq(AITools::Schema.all.size)
  end

  it "replays prior messages (excluding the latest user turn) into chat history" do
    create(:message, conversation: conversation, role: :assistant, content: "上一条助手回复")
    create(:message, conversation: conversation, role: :user, content: "再加一个")

    fake = stub_chat(script: [ { kind: :text, content: "done" } ])
    capture_broadcasts

    described_class.new.perform(conversation.id, tour.id, user.id)

    contents = fake.messages.map(&:content)
    expect(contents).to include("加个赛里木湖")
    expect(contents).to include("上一条助手回复")
    expect(contents).not_to include("再加一个")
  end

  describe "Kimi token-loop filter" do
    it "drops prior assistant messages that match the degenerate loop pattern" do
      create(:message, conversation: conversation, role: :assistant,
             content: "DIN DIN DIN DIN DIN DIN DIN")
      create(:message, conversation: conversation, role: :user, content: "再来一条")

      fake = stub_chat(script: [ { kind: :text, content: "done" } ])
      capture_broadcasts

      described_class.new.perform(conversation.id, tour.id, user.id)

      expect(fake.messages.map(&:content)).not_to include(a_string_including("DIN DIN DIN"))
    end

    it "drops prior assistant messages that exceed KIMI_MAX_CONTENT" do
      create(:message, conversation: conversation, role: :assistant,
             content: "x" * (ChatStreamJob::KIMI_MAX_CONTENT + 1))
      create(:message, conversation: conversation, role: :user, content: "再来一条")

      fake = stub_chat(script: [ { kind: :text, content: "ok" } ])
      capture_broadcasts

      described_class.new.perform(conversation.id, tour.id, user.id)

      expect(fake.messages.map { |m| m.content.length }).to all(be <= ChatStreamJob::KIMI_MAX_CONTENT)
    end

    it "preserves normal (non-degenerate) prior assistant output" do
      create(:message, conversation: conversation, role: :assistant,
             content: "已把赛里木湖加入 D2")
      create(:message, conversation: conversation, role: :user, content: "再来一条")

      fake = stub_chat(script: [ { kind: :text, content: "ok" } ])
      capture_broadcasts

      described_class.new.perform(conversation.id, tour.id, user.id)

      expect(fake.messages.map(&:content)).to include("已把赛里木湖加入 D2")
    end
  end

  private
    def capture_broadcasts
      broadcasts = []
      allow(ActionCable.server).to receive(:broadcast) { |_ch, payload| broadcasts << payload }
      broadcasts
    end
end
