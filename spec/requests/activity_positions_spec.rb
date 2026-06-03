require "rails_helper"

RSpec.describe "ActivityPositions", type: :request do
  def login_as(user)
    post "/login_test", params: { user_id: user.id }
  end

  let(:author) { create(:user) }
  let(:tour)   { create(:tour, author: author) }

  it "PATCH moves activity between days and redirects to the tour" do
    day1 = tour.days.first # D1 seeded by callback
    day2 = create(:day, tour: tour, day_index: 2)
    a = create(:activity, tour: tour, day: day1, position: 1)
    login_as(author)
    patch activity_position_path(a), params: { to_day_id: day2.id, to_position: 1 }
    expect(response).to redirect_to(tour_path(tour))
    expect(a.reload.day_id).to eq(day2.id)
  end

  it "PATCH moves to backlog when to_day_id blank" do
    day = create(:day, tour: tour, day_index: 2)
    a = create(:activity, tour: tour, day: day, position: 1)
    login_as(author)
    patch activity_position_path(a), params: { to_position: 1 }
    expect(a.reload.day_id).to be_nil
    expect(response).to redirect_to(tour_path(tour))
  end

  it "non-editor is forbidden" do
    a = create(:activity, tour: tour)
    login_as(create(:user))
    patch activity_position_path(a), params: { to_position: 1 }
    expect(response).to have_http_status(:forbidden)
  end

  describe "position shift (I5)" do
    it "same-day move down shifts intermediate siblings up by 1" do
      day = tour.days.first # D1 seeded by callback
      a1 = create(:activity, tour: tour, day: day, position: 1, name: "a1")
      a2 = create(:activity, tour: tour, day: day, position: 2, name: "a2")
      a3 = create(:activity, tour: tour, day: day, position: 3, name: "a3")
      a4 = create(:activity, tour: tour, day: day, position: 4, name: "a4")

      login_as(author)
      patch activity_position_path(a1), params: { to_day_id: day.id, to_position: 3 }

      expect(a1.reload.position).to eq(3)
      expect(a2.reload.position).to eq(1)
      expect(a3.reload.position).to eq(2)
      expect(a4.reload.position).to eq(4)
    end

    it "same-day move up shifts intermediate siblings down by 1" do
      day = tour.days.first # D1 seeded by callback
      a1 = create(:activity, tour: tour, day: day, position: 1, name: "a1")
      a2 = create(:activity, tour: tour, day: day, position: 2, name: "a2")
      a3 = create(:activity, tour: tour, day: day, position: 3, name: "a3")
      a4 = create(:activity, tour: tour, day: day, position: 4, name: "a4")

      login_as(author)
      patch activity_position_path(a4), params: { to_day_id: day.id, to_position: 2 }

      expect(a1.reload.position).to eq(1)
      expect(a4.reload.position).to eq(2)
      expect(a2.reload.position).to eq(3)
      expect(a3.reload.position).to eq(4)
    end

    it "cross-day move closes the gap in the source day" do
      src = tour.days.first # D1 seeded by callback
      dst = create(:day, tour: tour, day_index: 2)
      a1 = create(:activity, tour: tour, day: src, position: 1, name: "a1")
      a2 = create(:activity, tour: tour, day: src, position: 2, name: "a2")
      a3 = create(:activity, tour: tour, day: src, position: 3, name: "a3")

      login_as(author)
      patch activity_position_path(a2), params: { to_day_id: dst.id, to_position: 1 }

      expect(a1.reload.position).to eq(1)
      expect(a2.reload.day_id).to eq(dst.id)
      expect(a2.reload.position).to eq(1)
      expect(a3.reload.position).to eq(2)
    end

    it "cross-day move makes room in the destination day" do
      src = tour.days.first # D1 seeded by callback
      dst = create(:day, tour: tour, day_index: 2)
      a  = create(:activity, tour: tour, day: src, position: 1, name: "a")
      b1 = create(:activity, tour: tour, day: dst, position: 1, name: "b1")
      b2 = create(:activity, tour: tour, day: dst, position: 2, name: "b2")

      login_as(author)
      patch activity_position_path(a), params: { to_day_id: dst.id, to_position: 1 }

      expect(a.reload.day_id).to eq(dst.id)
      expect(a.reload.position).to eq(1)
      expect(b1.reload.position).to eq(2)
      expect(b2.reload.position).to eq(3)
    end

    it "compacts sparse positions to a dense 1..N sequence after a move (self-heals drift)" do
      day = tour.days.first
      # Sparse positions, mirroring real data drifted by accumulated drag gaps.
      a = create(:activity, tour: tour, day: day, position: 6,  name: "营地早餐")
      _b = create(:activity, tour: tour, day: day, position: 7,  name: "九曲")
      _c = create(:activity, tour: tour, day: day, position: 11, name: "独库")
      _d = create(:activity, tour: tour, day: day, position: 13, name: "镇酒店")

      login_as(author)
      # Drag 营地早餐 to the end → frontend now sends max(position)+1 = 14.
      patch activity_position_path(a), params: { to_day_id: day.id, to_position: 14 }

      rows = tour.activities.where(day_id: day.id).order(:position).pluck(:name, :position)
      expect(rows.map(&:last)).to eq([ 1, 2, 3, 4 ])                       # dense, no gaps
      expect(rows.map(&:first)).to eq(%w[九曲 独库 镇酒店 营地早餐])        # 营地早餐 landed last
    end

    it "renumbers BOTH days densely on a cross-day move out of a sparse source" do
      src = tour.days.first
      dst = create(:day, tour: tour, day_index: 2)
      a  = create(:activity, tour: tour, day: src, position: 5,  name: "a")
      _b = create(:activity, tour: tour, day: src, position: 9,  name: "b")
      _c = create(:activity, tour: tour, day: src, position: 20, name: "c")

      login_as(author)
      patch activity_position_path(a), params: { to_day_id: dst.id, to_position: 1 }

      src_pos = tour.activities.where(day_id: src.id).order(:position).pluck(:position)
      dst_pos = tour.activities.where(day_id: dst.id).order(:position).pluck(:position)
      expect(src_pos).to eq([ 1, 2 ])   # source compacted (b,c → 1,2)
      expect(dst_pos).to eq([ 1 ])      # dest dense
    end

    it "move to backlog closes the gap in the source day" do
      src = tour.days.first # D1 seeded by callback
      a1 = create(:activity, tour: tour, day: src, position: 1, name: "a1")
      a2 = create(:activity, tour: tour, day: src, position: 2, name: "a2")
      a3 = create(:activity, tour: tour, day: src, position: 3, name: "a3")

      login_as(author)
      patch activity_position_path(a1), params: { to_position: 1 }

      expect(a1.reload.day_id).to be_nil
      expect(a1.reload.position).to eq(1)
      expect(a2.reload.position).to eq(1)
      expect(a3.reload.position).to eq(2)
    end
  end
end
