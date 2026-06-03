class ActivityPositionsController < ApplicationController
  before_action :require_login

  def update
    activity = Activity.find(params[:activity_id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)
    target_day = params[:to_day_id].present? ? activity.tour.days.find(params[:to_day_id]) : nil
    new_position = params.require(:to_position).to_i
    reposition(activity, target_day, new_position)
    redirect_to tour_path(activity.tour)
  end

  private
    # Move `activity` to (target_day, new_position) while keeping siblings'
    # positions contiguous. Handles three cases:
    #   - same-day shift: shift sibling positions in the gap between
    #     old_position and new_position, direction-dependent.
    #   - cross-day move: close the gap in the source day, then push
    #     destination-day siblings at >= new_position down by 1.
    #   - backlog ↔ day: same as cross-day with day_id = nil on one side.
    def reposition(activity, target_day, new_position)
      source_day_id = activity.day_id
      dest_day_id   = target_day&.id
      old_position  = activity.position

      Activity.transaction do
        if source_day_id == dest_day_id
          shift_same_day(activity, dest_day_id, old_position, new_position)
        else
          close_gap(activity, source_day_id, old_position)
          make_room(activity, dest_day_id, new_position)
        end
        activity.update!(day: target_day, position: new_position)
        # Compact positions to a dense 1..N sequence (order preserved) so the
        # shift math's gaps don't accumulate — sparse positions break the
        # "drop at end" target (length+1 lands mid-list). Heals existing drift.
        renumber_dense(activity.tour, dest_day_id)
        renumber_dense(activity.tour, source_day_id) unless source_day_id == dest_day_id
      end
    end

    # Renumber a day's (or backlog's, day_id nil) activities to contiguous 1..N,
    # preserving order. update_column: position bookkeeping only — skip
    # validations/callbacks (day_id isn't changing here) and the updated_at bump.
    def renumber_dense(tour, day_id)
      tour.activities.where(day_id: day_id).order(:position, :id).each_with_index do |a, i|
        a.update_column(:position, i + 1) unless a.position == i + 1
      end
    end

    def shift_same_day(activity, day_id, old_position, new_position)
      return if new_position == old_position
      scope = activity.tour.activities.where(day_id: day_id).where.not(id: activity.id)
      if new_position > old_position
        scope.where("position > ? AND position <= ?", old_position, new_position)
             .update_all("position = position - 1")
      else
        scope.where("position >= ? AND position < ?", new_position, old_position)
             .update_all("position = position + 1")
      end
    end

    def close_gap(activity, source_day_id, old_position)
      activity.tour.activities
        .where(day_id: source_day_id)
        .where.not(id: activity.id)
        .where("position > ?", old_position)
        .update_all("position = position - 1")
    end

    def make_room(activity, dest_day_id, new_position)
      activity.tour.activities
        .where(day_id: dest_day_id)
        .where.not(id: activity.id)
        .where("position >= ?", new_position)
        .update_all("position = position + 1")
    end
end
