require "rails_helper"

RSpec.describe "Activities", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  it "POST creates activity in a day" do
    day = create(:day, tour: tour, day_index: 2)
    login_as(author)
    expect {
      post tour_day_activities_path(tour, day), params: {
        activity: { name: "景点", kind: "scenic", citizen_level: "tier_one" }
      }
    }.to change(Activity, :count).by(1)
    expect(Activity.last.day_id).to eq(day.id)
  end

  it "POST creates backlog activity" do
    login_as(author)
    expect {
      post tour_backlog_activities_path(tour), params: {
        activity: { name: "待定", kind: "scenic", citizen_level: "tier_three" }
      }
    }.to change(Activity, :count).by(1)
    expect(Activity.last.day_id).to be_nil
  end

  it "PATCH updates activity" do
    a = create(:activity, tour: tour, name: "旧")
    login_as(author)
    patch activity_path(a), params: { activity: { name: "新" } }
    expect(a.reload.name).to eq("新")
  end

  it "DELETE destroys activity" do
    a = create(:activity, tour: tour)
    login_as(author)
    expect { delete activity_path(a) }.to change(Activity, :count).by(-1)
  end

  it "non-editor is forbidden" do
    other = create(:user)
    a = create(:activity, tour: tour)
    login_as(other)
    delete activity_path(a)
    expect(response).to have_http_status(:forbidden)
  end

  it "PATCH saves desc and ignores tips" do
    a = create(:activity, tour: tour, name: "旧", desc: "")
    login_as(author)
    patch activity_path(a), params: {
      activity: { desc: "新备注", tips: "should be ignored" }
    }
    a.reload
    expect(a.desc).to eq("新备注")
    expect(Activity.column_names).not_to include("tips")
  end

  describe "POST create with Accept: application/json" do
    it "returns id and position in JSON for day-scoped create" do
      day = create(:day, tour: tour, day_index: 2)
      login_as(author)
      post tour_day_activities_path(tour, day),
        params: { activity: { name: "新景点", kind: "scenic", citizen_level: "tier_one" } },
        headers: { "Accept" => "application/json" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to be_a(Integer)
      expect(body["position"]).to be_a(Integer)
    end

    it "returns id for backlog create" do
      login_as(author)
      post tour_backlog_activities_path(tour),
        params: { activity: { name: "待选", kind: "scenic", citizen_level: "tier_three" } },
        headers: { "Accept" => "application/json" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["id"]).to be_a(Integer)
    end
  end

  describe "PATCH update with user_ids" do
    let(:editor) { create(:user) }
    let(:reader) { create(:user) }

    before do
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
    end

    it "replaces participant set on update" do
      a = create(:activity, tour: tour)
      create(:activity_participant, activity: a, user: editor)
      login_as(author)
      patch activity_path(a), params: {
        activity: { name: "新名" },
        user_ids: [ reader.id ]
      }
      a.reload
      expect(a.name).to eq("新名")
      expect(a.activity_participants.pluck(:user_id)).to eq([ reader.id ])
    end

    it "leaves participants untouched when user_ids is absent" do
      a = create(:activity, tour: tour)
      create(:activity_participant, activity: a, user: editor)
      login_as(author)
      patch activity_path(a), params: {
        activity: { name: "仅改名" }
      }
      expect(a.reload.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end

    it "clears participants when user_ids is empty" do
      a = create(:activity, tour: tour)
      create(:activity_participant, activity: a, user: editor)
      login_as(author)
      patch activity_path(a), params: {
        activity: { name: a.name },
        user_ids: []
      }
      expect(a.reload.activity_participants).to be_empty
    end
  end

  describe "POST create with user_ids" do
    let(:editor)   { create(:user) }
    let(:reader)   { create(:user) }
    let(:bystander) { create(:user) }

    before do
      create(:tour_membership, tour: tour, user: editor, role: :editor)
      create(:tour_membership, tour: tour, user: reader, role: :reader)
    end

    it "assigns participants atomically when creating in a day" do
      day = create(:day, tour: tour, day_index: 2)
      login_as(author)
      post tour_day_activities_path(tour, day), params: {
        activity: { name: "午餐", kind: "food", citizen_level: "tier_two" },
        user_ids: [ editor.id, reader.id ]
      }
      a = Activity.last
      expect(a.activity_participants.pluck(:user_id)).to contain_exactly(editor.id, reader.id)
    end

    it "creates with no participants (默认全员) when user_ids is absent" do
      day = create(:day, tour: tour, day_index: 2)
      login_as(author)
      post tour_day_activities_path(tour, day), params: {
        activity: { name: "加油", kind: "fuel", citizen_level: "tier_three" }
      }
      expect(Activity.last.activity_participants).to be_empty
    end

    it "creates with no participants when user_ids is an empty array" do
      login_as(author)
      post tour_backlog_activities_path(tour), params: {
        activity: { name: "待定", kind: "scenic", citizen_level: "tier_three" },
        user_ids: []
      }
      expect(Activity.last.activity_participants).to be_empty
    end

    it "silently drops non-member user_ids" do
      login_as(author)
      post tour_backlog_activities_path(tour), params: {
        activity: { name: "待定", kind: "scenic", citizen_level: "tier_three" },
        user_ids: [ editor.id, bystander.id ]
      }
      expect(Activity.last.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end
  end

  it "PATCH rejects desc exceeding the byte limit with 422" do
    a = create(:activity, tour: tour)
    login_as(author)
    patch activity_path(a), params: {
      activity: { desc: "x" * (Activity::DESC_MAX_BYTES + 1) }
    }
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "POST rolls back AP inserts when activity validation fails" do
    day = create(:day, tour: tour, day_index: 2)
    editor = create(:user)
    create(:tour_membership, tour: tour, user: editor, role: :editor)
    login_as(author)
    expect {
      post tour_day_activities_path(tour, day), params: {
        activity: { name: "", kind: "scenic", citizen_level: "tier_one" },
        user_ids: [ editor.id ]
      }
    }.not_to change(ActivityParticipant, :count)
  end
end
