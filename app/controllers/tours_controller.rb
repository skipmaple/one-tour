class ToursController < ApplicationController
  before_action :require_login
  before_action :set_tour, only: [ :show, :update, :destroy ]

  def index
    uid = current_user.id
    tours = Tour
      .left_joins(:tour_memberships)
      .where("tours.author_id = :uid OR tour_memberships.user_id = :uid", uid: uid)
      .distinct
      .includes(:tour_memberships)

    payload = tours.map { |t| tour_index_entry(t, uid) }
    render inertia: "Tour/Index", props: { tours: payload }
  end

  def show
    head :not_found and return unless @tour.visible_to?(current_user)
    tour_violation_structs = Tour::ConstitutionCheck.for(@tour)
    tour_violations = tour_violation_structs.map(&:to_h)
    conv = @tour.conversations.find_by(user: current_user)
    render inertia: "Tour/Show", props: {
      tour: @tour.as_json.merge("editable_by_current_user" => @tour.editable_by?(current_user)),
      # includes(:activities) 让 Day#driving_minutes_total 走 activities.select(:id)
      # 子查询时不用再为每 day 单独跑 activities 查询（subquery 复用已加载 scope）。
      # Route_leg 聚合仍是 N 次但每次是 pure SQL sum，轻量。
      days: @tour.days.includes(:activities).map { |d|
        d.as_json.merge(
          "intensity_derived" => d.intensity_derived(tour_violations).to_s,
          "driving_minutes_total" => d.driving_minutes_total
        )
      },
      activities: @tour.activities.includes(:activity_participants).map { |a|
        a.as_json.merge("participant_user_ids" => a.activity_participants.map(&:user_id))
      },
      activity_images: activity_images_for(@tour),
      expenses: expenses_for(@tour),
      expenses_summary: Expense::Summarize.new(@tour, current_user).call,
      tour_budgets: @tour.tour_budgets.where(user_id: current_user.id).as_json,
      settlements: settlements_for(@tour),
      route_legs: route_legs_for(@tour),
      violations: tour_violations,
      members: @tour.tour_memberships.includes(user: { avatar_attachment: :blob }).filter_map { |m|
        next unless m.user
        {
          id: m.id,
          user_id: m.user_id,
          email: m.user.email,
          name: m.user.name,
          avatar_url: m.user.display_avatar_url,
          role: m.role
        }
      },
      author: {
        user_id: @tour.author_id,
        email: @tour.author.email,
        name: @tour.author.name,
        avatar_url: @tour.author.display_avatar_url
      },
      conversation_empty: !conv || !conv.messages.exists?,
      summary: Tour::TimelineSummary.for(@tour, violations: tour_violation_structs),
      constitution: @tour.constitution,
      defaults: Constitution::DEFAULTS.deep_stringify_keys,
      overrides: @tour.constraint_overrides
    }
  end

  def create
    # /tours POST may be called with an empty body (from "+ 新建旅程") or
    # with a pre-filled `tour:` hash (from tests / admin tooling). Default
    # `title` to '' so the DB NOT NULL constraint is satisfied; the frontend
    # falls back to "未命名旅程" for display and the onboarding drawer
    # requires a real name before finishing setup.
    attrs = create_tour_params.to_h.reverse_merge("title" => "")
    @tour = Tour.create!(author: current_user, **attrs)
    redirect_to tour_path(@tour)
  end

  def update
    head :forbidden and return unless @tour.editable_by?(current_user)
    @tour.update!(tour_params)
    respond_to do |format|
      format.json { render json: { ok: true } }
      format.html { redirect_to @tour }
    end
  end

  def destroy
    head :forbidden and return unless @tour.owned_by?(current_user)
    @tour.destroy!
    redirect_to tours_path
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:id])
      head :not_found and return unless @tour
    end

    # For update: tour key is required — PATCH /tours/:id with no body is
    # a client error.
    def tour_params
      params.require(:tour).permit(
        :title, :date_range, :vehicle, :team_size, :trip_style, :budget_per_person,
        :archived, :currency, :timezone
      )
    end

    # For create: tour key is optional (empty body → empty hash). Onboarding
    # fills actual fields in a later PATCH.
    def create_tour_params
      params.fetch(:tour, {}).permit(
        :title, :date_range, :vehicle, :team_size, :trip_style, :budget_per_person,
        :archived, :currency, :timezone
      )
    end

    def tour_index_entry(tour, user_id)
      violations = Tour::ConstitutionCheck.for(tour)
      tour.as_json.merge(
        "days_count"       => tour.days.count,
        "activities_count" => tour.activities.count,
        "health"           => {
          "hard" => violations.count { |v| v.level == :hard },
          "soft" => violations.count { |v| v.level == :soft }
        },
        "my_role"          => role_on(tour, user_id),
        "last_activity_at" => tour.updated_at&.iso8601
      )
    end

    def role_on(tour, user_id)
      return "author" if tour.author_id == user_id
      tour.tour_memberships.find { |m| m.user_id == user_id }&.role || "reader"
    end

    def activity_images_for(tour)
      ActivityImage
        .joins(:activity)
        .where(activities: { tour_id: tour.id })
        .with_attached_file
        .order(:activity_id, :position)
        .map { |img|
          {
            id: img.id,
            activity_id: img.activity_id,
            caption: img.caption,
            position: img.position,
            is_cover: img.is_cover,
            url: img.file.attached? ? rails_blob_path(img.file, only_path: true) : nil
          }
        }
    end

    def route_legs_for(tour)
      legs = tour.route_legs.includes(:from_activity, :to_activity)
      legs.map { |leg|
        {
          id: leg.id,
          from_activity_id: leg.from_activity_id,
          to_activity_id: leg.to_activity_id,
          from_activity_name: leg.from_activity&.name,
          to_activity_name: leg.to_activity&.name,
          mode: leg.mode,
          distance_m: leg.distance_m,
          duration_s: leg.duration_s,
          distance_m_override: leg.distance_m_override,
          duration_s_override: leg.duration_s_override,
          note: leg.note,
          overridden_at: leg.overridden_at,
          polyline: leg.polyline,
          fetched_at: leg.fetched_at
        }
      }
    end

    def settlements_for(tour)
      tour.settlements.order(settled_at: :desc).map { |s|
        {
          id: s.id,
          tour_id: s.tour_id,
          from_user_id: s.from_user_id,
          to_user_id: s.to_user_id,
          amount_cents: s.amount_cents,
          settled_at: s.settled_at,
          note: s.note,
          recorded_by_id: s.recorded_by_id
        }
      }
    end

    def expenses_for(tour)
      tour.expenses.includes(:splits, receipts: { file_attachment: :blob }).map { |e|
        {
          id: e.id,
          activity_id: e.activity_id,
          day_id: e.day_id,
          scope: e.scope,
          paid_by_id: e.paid_by_id,
          amount_cents: e.amount_cents,
          category: e.category,
          split_strategy: e.split_strategy,
          external_count: e.external_count,
          external_attributed_to_id: e.external_attributed_to_id,
          note: e.note,
          occurred_on: e.occurred_on,
          created_at: e.created_at,
          splits: e.splits.map { |s| { user_id: s.user_id, shares: s.shares, amount_cents: s.amount_cents } },
          receipts: e.receipts.map { |r|
            { id: r.id, url: r.file.attached? ? rails_blob_path(r.file, only_path: true) : nil }
          }
        }
      }
    end
end
