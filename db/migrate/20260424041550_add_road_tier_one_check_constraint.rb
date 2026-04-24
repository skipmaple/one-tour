class AddRoadTierOneCheckConstraint < ActiveRecord::Migration[8.0]
  # 兜底：模型层 validation 已在 PR1 (commit 755f479) 加了 road_must_be_tier_one
  # （PR1 review fix 后只在 new_record? || kind/citizen_level 变化时触发）。
  # 生产数据迁移完成后（migrate_low_tier_road + delete_low_tier_road, 2026-04-24）
  # 已无低 tier road 记录，此 check constraint 兜住任何绕过 validation 的写入路径
  # （raw SQL、update_columns、未来代码遗漏等）。
  #
  # kind enum: scenic=0 road=1 food=2 stay=3 fuel=4 other=5
  # citizen_level enum: tier_one=0 tier_two=1 tier_three=2 infrastructure=3
  # 约束：NOT (kind = 1 AND citizen_level != 0)
  #
  # 用 NOT VALID + validate_check_constraint 两步法：第一步只加 schema 约束
  # （AccessExclusiveLock 短暂），第二步全表 validate（ShareUpdateExclusive，
  # 不阻塞读写）。当前 activities 表 ~200 行不痛，但保留这个 pattern 做
  # 大表兜底——将来加新 constraint 不用回头改。
  def change
    add_check_constraint :activities,
      "NOT (kind = 1 AND citizen_level != 0)",
      name: "road_must_be_tier_one",
      validate: false

    validate_check_constraint :activities, name: "road_must_be_tier_one"
  end
end
