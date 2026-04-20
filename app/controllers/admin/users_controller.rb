module Admin
  class UsersController < BaseController
    PER_PAGE = 25
    RANGE_30D = 30.days

    def index
      page  = [params[:page].to_i, 1].max
      q     = params[:q].to_s.strip
      sort  = params[:sort].presence || "cost_desc"

      rel   = build_scope(q)
      total = count_scope(q)
      rows  = rel.order(order_clause(sort)).limit(PER_PAGE).offset((page - 1) * PER_PAGE)

      render inertia: "Admin/UsersIndex", props: {
        users:    rows.map { |r| serialize_user_row(r) },
        total:    total,
        page:     page,
        per_page: PER_PAGE,
        q:        q,
        sort:     sort
      }
    end

    private

    def count_scope(q)
      base = User.all
      base = base.where("users.name ILIKE :q OR users.email ILIKE :q", q: "%#{q}%") if q.present?
      base.count
    end

    def build_scope(q)
      cutoff = RANGE_30D.ago

      # CRITICAL: Two independent LEFT JOIN subqueries (tours + messages).
      # Do NOT join users → tours AND users → conversations → messages in
      # the same query — that creates a cartesian product (tour_count ×
      # message_count) that multiplies SUM/COUNT aggregates.
      message_stats_sql = ActiveRecord::Base.sanitize_sql_array([<<~SQL.squish, cutoff])
        SELECT
          c.user_id,
          COUNT(DISTINCT m.id) AS messages_30d,
          COALESCE(SUM(COALESCE(m.tokens_in, 0) + COALESCE(m.tokens_out, 0)), 0) AS tokens_30d,
          COALESCE(SUM(m.cost_cents), 0) AS cost_30d_cents
        FROM messages m
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE m.role = 1
          AND m.tokens_out IS NOT NULL
          AND m.created_at > ?
        GROUP BY c.user_id
      SQL

      tours_count_sql = <<~SQL.squish
        SELECT author_id AS user_id, COUNT(*) AS tours_count
        FROM tours
        GROUP BY author_id
      SQL

      base = User
        .select(<<~COLS.squish)
          users.*,
          COALESCE(ms.messages_30d, 0)   AS messages_30d,
          COALESCE(ms.tokens_30d, 0)     AS tokens_30d,
          COALESCE(ms.cost_30d_cents, 0) AS cost_30d_cents,
          COALESCE(tc.tours_count, 0)    AS tours_count
        COLS
        .joins("LEFT JOIN (#{message_stats_sql}) ms ON ms.user_id = users.id")
        .joins("LEFT JOIN (#{tours_count_sql}) tc ON tc.user_id = users.id")

      base = base.where("users.name ILIKE :q OR users.email ILIKE :q", q: "%#{q}%") if q.present?
      base
    end

    def order_clause(sort)
      {
        "cost_desc"     => Arel.sql("cost_30d_cents DESC NULLS LAST"),
        "cost_asc"      => Arel.sql("cost_30d_cents ASC NULLS LAST"),
        "tokens_desc"   => Arel.sql("tokens_30d DESC NULLS LAST"),
        "messages_desc" => Arel.sql("messages_30d DESC NULLS LAST"),
        "created_desc"  => Arel.sql("users.created_at DESC"),
        "created_asc"   => Arel.sql("users.created_at ASC")
      }.fetch(sort, Arel.sql("cost_30d_cents DESC NULLS LAST"))
    end

    def serialize_user_row(u)
      {
        id:             u.id,
        name:           u.name,
        email:          u.email,
        role:           u.role,
        created_at:     u.created_at.iso8601,
        tours_count:    u.tours_count.to_i,
        messages_30d:   u.messages_30d.to_i,
        tokens_30d:     u.tokens_30d.to_i,
        cost_30d_cents: u.cost_30d_cents.to_i
      }
    end
  end
end
