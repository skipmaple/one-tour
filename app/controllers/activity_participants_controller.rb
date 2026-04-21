class ActivityParticipantsController < ApplicationController
  before_action :require_login
  before_action :set_activity
  before_action :require_editable

  def update
    requested_ids = Array(params[:user_ids]).map(&:to_i).uniq

    # 并发与一致性：
    # - with_lock 对本 activity 行取 SELECT FOR UPDATE，序列化同一 activity
    #   上的并发 PUT —— 否则两个不同 payload 的请求可以互相穿插（各自
    #   delete_all + 各自 insert）产生"并集"而非"后写者覆盖"。
    # - `tour.member_user_ids` 的重读放在 lock 内部，以缩小"白名单读取 →
    #   upsert_all 提交"之间的竞态窗口（期间另一请求可能已 destroy 了某
    #   TourMembership）。用 Tour.find 拿新实例，绕开 Tour#member_user_ids
    #   上的 per-instance memoization——ActiveRecord.reload 只重置属性和
    #   association 缓存，不重置普通 @ivar memo。
    # - 理论上仍存在极短窗口：重读之后、upsert 之前，若 TourMembership 被
    #   destroy，会留下一行指向非成员的 AP。这条路径是**自愈**的：
    #   TourMembership#after_destroy 回调（see tour_membership.rb）会删掉
    #   同 tour 下该 user 的所有 AP；前端渲染也会在 roster 里找不到该 user
    #   而 filter(Boolean) 掉，不会出现幽灵头像。
    #
    # delete_all 跳过回调 + 对象实例化（ActivityParticipant 无 destroy 回调）；
    # upsert_all 绕过 AR 校验属刻意设计：白名单过滤由 controller 持有，
    # unique 索引兜底。此处是端点显式选择，非疏漏。
    @activity.with_lock do
      fresh_member_ids = Tour.find(@activity.tour_id).member_user_ids
      ids = requested_ids & fresh_member_ids

      @activity.activity_participants.delete_all
      next if ids.empty?
      now = Time.current
      rows = ids.map { |uid|
        { activity_id: @activity.id, user_id: uid, created_at: now, updated_at: now }
      }
      ActivityParticipant.upsert_all(rows, unique_by: %i[activity_id user_id])
    end
    redirect_to @activity.tour
  end

  private
    def set_activity
      @activity = Activity.find(params[:activity_id])
    end

    def require_editable
      head(:forbidden) unless @activity.tour.editable_by?(current_user)
    end
end
