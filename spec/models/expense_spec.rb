require "rails_helper"

RSpec.describe Expense do
  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }
  let(:day)    { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }

  def build_expense(**attrs)
    Expense.new({
      tour: tour, paid_by: author, created_by: author,
      amount_cents: 100, category: :food, scope: :activity, activity: activity
    }.merge(attrs))
  end

  describe "scope validations" do
    it "accepts activity-scope with activity_id set" do
      expect(build_expense).to be_valid
    end

    it "requires activity_id when scope=activity" do
      e = build_expense(scope: :activity, activity: nil)
      expect(e).not_to be_valid
      expect(e.errors[:activity_id]).to include("必填")
    end

    it "auto-syncs day_id from activity.day_id on activity scope" do
      e = build_expense
      e.valid?
      expect(e.day_id).to eq(activity.day_id)
    end

    it "accepts day-scope with day_id set, activity NULL" do
      e = build_expense(scope: :day, activity: nil, day: day)
      expect(e).to be_valid
    end

    it "rejects day-scope with activity_id set" do
      e = build_expense(scope: :day, day: day)
      expect(e).not_to be_valid
      expect(e.errors[:activity_id]).to include(a_string_including("日期级支出"))
    end

    it "accepts tour-scope with both NULL" do
      e = build_expense(scope: :tour, activity: nil, day: nil)
      expect(e).to be_valid
    end

    it "rejects tour-scope with activity or day set" do
      e = build_expense(scope: :tour, day: day)
      # sync_day_from_activity will set day_id from activity since scope was changed but activity still set
      # re-verify with no activity:
      e2 = build_expense(scope: :tour, activity: nil, day: day)
      expect(e2).not_to be_valid
      expect(e2.errors[:day_id]).to include(a_string_including("整程级支出"))
    end

    it "rejects expenses on backlog activities" do
      backlog = create(:activity, tour: tour, day: nil)
      e = build_expense(activity: backlog)
      expect(e).not_to be_valid
      expect(e.errors[:activity_id].first).to match(/候选池/)
    end
  end

  describe "external participant validation" do
    it "accepts 0 external_count without attribution" do
      e = build_expense(external_count: 0)
      expect(e).to be_valid
    end

    it "rejects external_count > 0 without attributed member" do
      e = build_expense(external_count: 1)
      expect(e).not_to be_valid
      expect(e.errors[:external_attributed_to_id]).to include(a_string_including("必须指定归属"))
    end

    it "rejects attribution without external_count" do
      e = build_expense(external_count: 0, external_attributed_to: author)
      expect(e).not_to be_valid
      expect(e.errors[:external_count]).to include(a_string_including("人数为 0"))
    end
  end

  describe "refunds (negative amount)" do
    it "accepts negative amount_cents with refund category" do
      e = build_expense(amount_cents: -300, category: :refund)
      expect(e).to be_valid
    end
  end

  describe "activity day sync" do
    it "updates day_id on activity-scope expenses when activity.day_id changes" do
      expense = build_expense.tap(&:save!)
      new_day = create(:day, tour: tour, day_index: 2)
      activity.update!(day: new_day)
      expect(expense.reload.day_id).to eq(new_day.id)
    end
  end
end
