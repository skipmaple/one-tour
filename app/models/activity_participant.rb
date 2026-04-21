class ActivityParticipant < ApplicationRecord
  belongs_to :activity
  belongs_to :user

  validates :user_id, uniqueness: { scope: :activity_id }
  validate  :user_belongs_to_tour

  private
    # 用 `exists?` 走索引的 LIMIT 1 查询，而不是 pluck 整份成员列表再
    # include? —— 在控制器一次性保存 N 条参与人时，每条 save 都触发本
    # 校验，索引查询比拉全表更省。
    def user_belongs_to_tour
      tour = activity&.tour
      return unless tour && user_id
      return if user_id == tour.author_id
      return if tour.tour_memberships.exists?(user_id: user_id)

      errors.add(:user_id, "不属于本行程成员")
    end
end
