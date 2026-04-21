class ActivityParticipantsController < ApplicationController
  before_action :require_login
  before_action :set_activity
  before_action :require_editable

  def update
    ids = Array(params[:user_ids]).map(&:to_i).uniq
    ids &= @activity.tour.member_user_ids

    # with_lock 对本 activity 行取 SELECT FOR UPDATE，序列化并发 PUT ——
    # 没有锁的话两个 payload 不同的请求可以互相穿插：各自 delete_all，
    # 各自 insert，结果变成两边 id 的"并集"而不是"后写者覆盖"。
    #
    # delete_all（vs destroy_all）跳过回调和对象实例化 —— ActivityParticipant
    # 本身没有任何 destroy 回调，整行删除用 SQL 一次搞定。
    # upsert_all（vs 循环 create!）一次 INSERT 全部新参与人，绕过 AR 校验
    # 是安全的：white-list 过滤在本方法顶部已经做掉，不会插到 tour 成员
    # 之外的 user_id；unique 索引兜底。
    @activity.with_lock do
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
