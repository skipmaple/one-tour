require "rails_helper"

RSpec.describe "ActivityParticipants", type: :request do
  let(:tour)     { create(:tour) }
  let(:editor)   { create(:user) }
  let(:reader)   { create(:user) }
  let(:bystander) { create(:user) }
  let(:activity) { create(:activity, tour: tour) }

  before do
    create(:tour_membership, tour: tour, user: editor, role: :editor)
    create(:tour_membership, tour: tour, user: reader, role: :reader)
  end

  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  describe "PUT /activities/:activity_id/participants" do
    it "replaces the participant set for the author" do
      login_as(tour.author)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ editor.id, reader.id ] }

      expect(response).to have_http_status(:found)
      expect(activity.activity_participants.pluck(:user_id))
        .to contain_exactly(editor.id, reader.id)
    end

    it "allows editors to replace the set" do
      login_as(editor)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ editor.id ] }

      expect(response).to have_http_status(:found)
      expect(activity.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end

    it "forbids readers" do
      login_as(reader)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ reader.id ] }

      expect(response).to have_http_status(:forbidden)
      expect(activity.activity_participants).to be_empty
    end

    it "silently drops user_ids that are not tour members" do
      login_as(tour.author)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [ editor.id, bystander.id ] }

      expect(response).to have_http_status(:found)
      expect(activity.activity_participants.pluck(:user_id))
        .to contain_exactly(editor.id)
    end

    it "accepts empty array (= 默认全员)" do
      ActivityParticipant.create!(activity: activity, user: editor)

      login_as(tour.author)
      put "/activities/#{activity.id}/participants",
          params: { user_ids: [] }

      expect(response).to have_http_status(:found)
      expect(activity.activity_participants).to be_empty
    end

    it "is idempotent — repeating the same payload yields the same state" do
      login_as(tour.author)
      2.times do
        put "/activities/#{activity.id}/participants",
            params: { user_ids: [ editor.id ] }
      end
      expect(activity.activity_participants.pluck(:user_id)).to eq([ editor.id ])
    end
  end
end
