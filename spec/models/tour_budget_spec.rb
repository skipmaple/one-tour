require "rails_helper"

RSpec.describe TourBudget do
  let(:user) { create(:user) }
  let(:tour) { create(:tour, author: user) }
  let(:day)  { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }

  describe "scope derivation" do
    it "reports :activity when activity_id present" do
      b = TourBudget.new(tour: tour, activity: activity, user: user, amount_cents: 100)
      expect(b.scope).to eq(:activity)
    end

    it "reports :day when only day_id present" do
      b = TourBudget.new(tour: tour, day: day, user: user, amount_cents: 100)
      expect(b.scope).to eq(:day)
    end

    it "reports :tour when neither present" do
      b = TourBudget.new(tour: tour, user: user, amount_cents: 100)
      expect(b.scope).to eq(:tour)
    end
  end

  describe "validations" do
    it "rejects both activity_id and day_id set" do
      b = TourBudget.new(tour: tour, activity: activity, day: day, user: user, amount_cents: 100)
      expect(b).not_to be_valid
      expect(b.errors[:base]).to include(a_string_including("范围冲突"))
    end

    it "rejects activity belonging to a different tour" do
      other_tour = create(:tour)
      other_day = other_tour.days.first
      foreign_activity = create(:activity, tour: other_tour, day: other_day)
      b = TourBudget.new(tour: tour, activity: foreign_activity, user: user, amount_cents: 100)
      expect(b).not_to be_valid
      expect(b.errors[:activity_id].first).to match(/不属于本行程/)
    end

    it "rejects backlog activities (day_id nil)" do
      backlog = create(:activity, tour: tour, day: nil)
      b = TourBudget.new(tour: tour, activity: backlog, user: user, amount_cents: 100)
      expect(b).not_to be_valid
      expect(b.errors[:activity_id].first).to match(/候选池/)
    end
  end

  describe "partial unique indexes (3 levels)" do
    it "allows all three levels to coexist for the same user in the same tour" do
      TourBudget.create!(tour: tour, activity: activity, user: user, amount_cents: 100)
      TourBudget.create!(tour: tour, day: day, user: user, amount_cents: 500)
      TourBudget.create!(tour: tour, user: user, amount_cents: 5000)
      expect(tour.tour_budgets.count).to eq(3)
    end

    it "rejects duplicate activity-scope for (tour, activity, user)" do
      TourBudget.create!(tour: tour, activity: activity, user: user, amount_cents: 100)
      dup = TourBudget.new(tour: tour, activity: activity, user: user, amount_cents: 200)
      expect { dup.save(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "rejects duplicate day-scope for (tour, day, user)" do
      TourBudget.create!(tour: tour, day: day, user: user, amount_cents: 100)
      dup = TourBudget.new(tour: tour, day: day, user: user, amount_cents: 200)
      expect { dup.save(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "rejects duplicate tour-scope for (tour, user)" do
      TourBudget.create!(tour: tour, user: user, amount_cents: 100)
      dup = TourBudget.new(tour: tour, user: user, amount_cents: 200)
      expect { dup.save(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end
  end
end
