module Admin
  class ToursController < BaseController
    PER_PAGE = 25

    def index
      page = [ params[:page].to_i, 1 ].max
      q    = params[:q].to_s.strip
      sort = params[:sort].presence || "updated_desc"

      rel   = build_scope(q)
      total = count_scope(q)
      rows  = rel.order(order_clause(sort)).limit(PER_PAGE).offset((page - 1) * PER_PAGE)

      render inertia: "Admin/ToursIndex", props: {
        tours:    rows.map { |t| serialize_row(t) },
        total:    total,
        page:     page,
        per_page: PER_PAGE,
        q:        q,
        sort:     sort
      }
    end

    def show
      # Don't eager-load conversations.messages — the messages collection
      # on a heavily-used tour can be huge, and conversation_stats queries
      # it separately via Message.billable scope anyway. Loading every
      # message body just to count them wastes memory.
      tour = Tour.includes(:author, :days, :activities, :conversations, tour_memberships: :user).find(params[:id])

      render inertia: "Admin/ToursShow", props: {
        tour:               serialize_tour(tour),
        members:            members_list(tour),
        days:               days_summary(tour),
        conversation_stats: conversation_stats(tour)
      }
    rescue ActiveRecord::RecordNotFound
      raise ActionController::RoutingError.new("Not Found")
    end

    private

    def count_scope(q)
      base = Tour.all
      base = base.where("tours.title ILIKE ?", "%#{q}%") if q.present?
      base.count
    end

    def build_scope(q)
      rel = Tour.includes(:author, :days, :activities, :tour_memberships)
      rel = rel.where("tours.title ILIKE ?", "%#{q}%") if q.present?
      rel
    end

    def order_clause(sort)
      {
        "updated_desc" => { updated_at: :desc },
        "updated_asc"  => { updated_at: :asc },
        "created_desc" => { created_at: :desc },
        "created_asc"  => { created_at: :asc }
      }.fetch(sort, { updated_at: :desc })
    end

    def serialize_row(t)
      # Count author + non-author memberships distinctly (see members_list
      # comment — author can hold a membership row on their own tour).
      non_author_memberships = t.tour_memberships.reject { |m| m.user_id == t.author_id }.size
      {
        id:             t.id,
        title:          t.title,
        author_name:    t.author.name,
        author_email:   t.author.email,
        author_id:      t.author.id,
        members_count:  1 + non_author_memberships,
        day_count:      t.days.size,
        activity_count: t.activities.size,
        created_at:     t.created_at.iso8601,
        updated_at:     t.updated_at.iso8601
      }
    end

    def serialize_tour(t)
      {
        id:         t.id,
        title:      t.title,
        start_date: t.try(:start_date)&.iso8601,
        end_date:   t.try(:end_date)&.iso8601,
        created_at: t.created_at.iso8601,
        updated_at: t.updated_at.iso8601,
        author: {
          id:    t.author.id,
          name:  t.author.name,
          email: t.author.email
        }
      }
    end

    def members_list(t)
      # TourMembership uniqueness is only scoped to (tour_id, user_id), so
      # nothing at the DB level stops the author from also holding a
      # membership row on their own tour. Filter the author out of the
      # memberships list before prepending the author row, otherwise they
      # appear twice and inflate members_count-style UI.
      other_memberships = t.tour_memberships.reject { |m| m.user_id == t.author_id }
      [ {
        user_id:   t.author.id,
        name:      t.author.name,
        email:     t.author.email,
        role:      "author",
        joined_at: t.created_at.iso8601
      } ] + other_memberships.map do |m|
        {
          user_id:   m.user.id,
          name:      m.user.name,
          email:     m.user.email,
          role:      m.role,
          joined_at: m.created_at.iso8601
        }
      end
    end

    def days_summary(t)
      activity_by_day = t.activities.group_by(&:day_id)
      t.days.order(:day_index).map do |d|
        {
          id:             d.id,
          day_index:      d.day_index,
          date:           d.try(:date)&.iso8601,
          activity_count: activity_by_day[d.id]&.size || 0,
          updated_at:     d.updated_at.iso8601
        }
      end
    end

    def conversation_stats(t)
      msgs = Message.billable.where(conversation_id: t.conversations.select(:id))
      {
        total_messages:   msgs.count,
        total_tokens:     msgs.sum("COALESCE(tokens_in,0) + COALESCE(tokens_out,0)").to_i,
        total_cost_cents: msgs.sum(:cost_cents).to_i,
        last_message_at:  msgs.maximum(:created_at)&.iso8601
      }
    end
  end
end
