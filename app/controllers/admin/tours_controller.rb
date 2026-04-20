module Admin
  class ToursController < BaseController
    PER_PAGE = 25

    def index
      page = [params[:page].to_i, 1].max
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
      {
        id:             t.id,
        title:          t.title,
        author_name:    t.author.name,
        author_email:   t.author.email,
        author_id:      t.author.id,
        members_count:  1 + t.tour_memberships.size,
        day_count:      t.days.size,
        activity_count: t.activities.size,
        created_at:     t.created_at.iso8601,
        updated_at:     t.updated_at.iso8601
      }
    end
  end
end
