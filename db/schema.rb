# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_04_20_175530) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "activities", force: :cascade do |t|
    t.bigint "tour_id", null: false
    t.bigint "day_id"
    t.integer "position", null: false
    t.integer "citizen_level", default: 2, null: false
    t.integer "kind", null: false
    t.string "name", null: false
    t.decimal "lat", precision: 9, scale: 6
    t.decimal "lng", precision: 9, scale: 6
    t.string "address"
    t.time "planned_start_at"
    t.integer "planned_duration_min"
    t.text "desc"
    t.jsonb "details", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["day_id"], name: "index_activities_on_day_id"
    t.index ["tour_id", "day_id", "position"], name: "index_activities_on_tour_id_and_day_id_and_position"
    t.index ["tour_id", "kind", "citizen_level"], name: "index_activities_on_tour_id_and_kind_and_citizen_level"
    t.index ["tour_id"], name: "index_activities_on_tour_id"
  end

  create_table "activity_images", force: :cascade do |t|
    t.bigint "activity_id", null: false
    t.bigint "uploaded_by_id", null: false
    t.string "caption", limit: 280
    t.integer "position", default: 0, null: false
    t.boolean "is_cover", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["activity_id", "position"], name: "index_activity_images_on_activity_id_and_position"
    t.index ["activity_id"], name: "idx_activity_images_single_cover", unique: true, where: "(is_cover = true)"
    t.index ["activity_id"], name: "index_activity_images_on_activity_id"
    t.index ["uploaded_by_id"], name: "index_activity_images_on_uploaded_by_id"
  end

  create_table "activity_participants", force: :cascade do |t|
    t.bigint "activity_id", null: false
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["activity_id", "user_id"], name: "index_activity_participants_on_activity_id_and_user_id", unique: true
    t.index ["activity_id"], name: "index_activity_participants_on_activity_id"
    t.index ["user_id"], name: "index_activity_participants_on_user_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "tour_id", null: false
    t.index ["tour_id", "user_id"], name: "index_conversations_on_tour_id_and_user_id", unique: true
    t.index ["tour_id"], name: "index_conversations_on_tour_id"
    t.index ["user_id"], name: "index_conversations_on_user_id"
  end

  create_table "days", force: :cascade do |t|
    t.bigint "tour_id", null: false
    t.integer "day_index", null: false
    t.date "date"
    t.string "title"
    t.text "theme"
    t.integer "intensity"
    t.boolean "buffer_day", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["tour_id", "day_index"], name: "index_days_on_tour_id_and_day_index", unique: true
    t.index ["tour_id"], name: "index_days_on_tour_id"
  end

  create_table "email_verifications", force: :cascade do |t|
    t.string "email", null: false
    t.string "code_digest", null: false
    t.datetime "expires_at", null: false
    t.integer "attempts", default: 0, null: false
    t.datetime "used_at"
    t.string "requested_ip"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email", "created_at"], name: "index_email_verifications_on_email_and_created_at"
    t.index ["email"], name: "index_email_verifications_on_email"
    t.index ["requested_ip"], name: "index_email_verifications_on_requested_ip"
  end

  create_table "expense_receipts", force: :cascade do |t|
    t.bigint "expense_id", null: false
    t.bigint "uploaded_by_id", null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expense_id", "position"], name: "index_expense_receipts_on_expense_id_and_position"
    t.index ["expense_id"], name: "index_expense_receipts_on_expense_id"
    t.index ["uploaded_by_id"], name: "index_expense_receipts_on_uploaded_by_id"
  end

  create_table "expense_splits", force: :cascade do |t|
    t.bigint "expense_id", null: false
    t.bigint "user_id", null: false
    t.integer "shares", default: 1, null: false
    t.integer "amount_cents", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expense_id", "user_id"], name: "index_expense_splits_on_expense_id_and_user_id", unique: true
    t.index ["expense_id"], name: "index_expense_splits_on_expense_id"
    t.index ["user_id"], name: "index_expense_splits_on_user_id"
  end

  create_table "expenses", force: :cascade do |t|
    t.bigint "tour_id", null: false
    t.integer "scope", default: 0, null: false
    t.bigint "activity_id"
    t.bigint "day_id"
    t.bigint "paid_by_id", null: false
    t.bigint "created_by_id", null: false
    t.integer "amount_cents", null: false
    t.integer "category", default: 0, null: false
    t.integer "split_strategy", default: 0, null: false
    t.integer "external_count", default: 0, null: false
    t.bigint "external_attributed_to_id"
    t.string "note", limit: 280
    t.date "occurred_on"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["activity_id"], name: "index_expenses_on_activity_id"
    t.index ["created_by_id"], name: "index_expenses_on_created_by_id"
    t.index ["day_id"], name: "index_expenses_on_day_id"
    t.index ["external_attributed_to_id"], name: "index_expenses_on_external_attributed_to_id"
    t.index ["paid_by_id"], name: "index_expenses_on_paid_by_id"
    t.index ["tour_id", "activity_id"], name: "index_expenses_on_tour_id_and_activity_id"
    t.index ["tour_id", "day_id"], name: "index_expenses_on_tour_id_and_day_id"
    t.index ["tour_id", "paid_by_id"], name: "index_expenses_on_tour_id_and_paid_by_id"
    t.index ["tour_id"], name: "index_expenses_on_tour_id"
  end

  create_table "messages", force: :cascade do |t|
    t.bigint "conversation_id", null: false
    t.integer "role", null: false
    t.text "content"
    t.jsonb "tool_calls"
    t.jsonb "metadata"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["conversation_id"], name: "index_messages_on_conversation_id"
  end

  create_table "oauth_identities", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "provider", null: false
    t.string "uid", null: false
    t.jsonb "credentials", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["provider", "uid"], name: "index_oauth_identities_on_provider_and_uid", unique: true
    t.index ["user_id"], name: "index_oauth_identities_on_user_id"
  end

  create_table "route_legs", force: :cascade do |t|
    t.bigint "tour_id", null: false
    t.bigint "from_activity_id", null: false
    t.bigint "to_activity_id", null: false
    t.integer "mode", default: 0, null: false
    t.integer "distance_m"
    t.integer "duration_s"
    t.jsonb "polyline", default: {}, null: false
    t.string "endpoint_digest"
    t.datetime "fetched_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["endpoint_digest"], name: "index_route_legs_on_endpoint_digest"
    t.index ["from_activity_id"], name: "index_route_legs_on_from_activity_id"
    t.index ["to_activity_id"], name: "index_route_legs_on_to_activity_id"
    t.index ["tour_id", "from_activity_id", "to_activity_id", "mode"], name: "idx_route_legs_unique_pair", unique: true
    t.index ["tour_id"], name: "index_route_legs_on_tour_id"
  end

  create_table "settlements", force: :cascade do |t|
    t.bigint "tour_id", null: false
    t.bigint "from_user_id", null: false
    t.bigint "to_user_id", null: false
    t.bigint "recorded_by_id", null: false
    t.integer "amount_cents", null: false
    t.datetime "settled_at", null: false
    t.string "note", limit: 140
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["from_user_id"], name: "index_settlements_on_from_user_id"
    t.index ["recorded_by_id"], name: "index_settlements_on_recorded_by_id"
    t.index ["to_user_id"], name: "index_settlements_on_to_user_id"
    t.index ["tour_id", "from_user_id"], name: "index_settlements_on_tour_id_and_from_user_id"
    t.index ["tour_id", "to_user_id"], name: "index_settlements_on_tour_id_and_to_user_id"
    t.index ["tour_id"], name: "index_settlements_on_tour_id"
  end

  create_table "tour_budgets", force: :cascade do |t|
    t.bigint "tour_id", null: false
    t.bigint "day_id"
    t.bigint "activity_id"
    t.bigint "user_id", null: false
    t.integer "amount_cents", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["activity_id"], name: "index_tour_budgets_on_activity_id"
    t.index ["day_id"], name: "index_tour_budgets_on_day_id"
    t.index ["tour_id", "activity_id", "user_id"], name: "idx_tour_budgets_activity_scope", unique: true, where: "(activity_id IS NOT NULL)"
    t.index ["tour_id", "day_id", "user_id"], name: "idx_tour_budgets_day_scope", unique: true, where: "((day_id IS NOT NULL) AND (activity_id IS NULL))"
    t.index ["tour_id", "user_id"], name: "idx_tour_budgets_tour_scope", unique: true, where: "((day_id IS NULL) AND (activity_id IS NULL))"
    t.index ["tour_id"], name: "index_tour_budgets_on_tour_id"
    t.index ["user_id"], name: "index_tour_budgets_on_user_id"
  end

  create_table "tour_memberships", force: :cascade do |t|
    t.bigint "tour_id", null: false
    t.bigint "user_id", null: false
    t.integer "role", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["tour_id", "user_id"], name: "index_tour_memberships_on_tour_id_and_user_id", unique: true
    t.index ["tour_id"], name: "index_tour_memberships_on_tour_id"
    t.index ["user_id"], name: "index_tour_memberships_on_user_id"
  end

  create_table "tours", force: :cascade do |t|
    t.bigint "author_id", null: false
    t.string "title", null: false
    t.string "date_range"
    t.string "vehicle"
    t.integer "team_size"
    t.string "trip_style"
    t.string "budget_per_person"
    t.jsonb "constitution", default: {}, null: false
    t.jsonb "constraint_overrides", default: [], null: false
    t.boolean "archived", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "constitution_accepted", default: false, null: false
    t.string "currency", limit: 3, default: "CNY", null: false
    t.string "timezone", default: "Asia/Shanghai", null: false
    t.index ["author_id"], name: "index_tours_on_author_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "name", null: false
    t.string "email", null: false
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "role", default: 0, null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["role"], name: "index_users_on_role"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "activities", "days"
  add_foreign_key "activities", "tours"
  add_foreign_key "activity_images", "activities", on_delete: :cascade
  add_foreign_key "activity_images", "users", column: "uploaded_by_id"
  add_foreign_key "activity_participants", "activities"
  add_foreign_key "activity_participants", "users"
  add_foreign_key "conversations", "tours"
  add_foreign_key "conversations", "users"
  add_foreign_key "days", "tours"
  add_foreign_key "expense_receipts", "expenses", on_delete: :cascade
  add_foreign_key "expense_receipts", "users", column: "uploaded_by_id"
  add_foreign_key "expense_splits", "expenses", on_delete: :cascade
  add_foreign_key "expense_splits", "users"
  add_foreign_key "expenses", "activities", on_delete: :cascade
  add_foreign_key "expenses", "days", on_delete: :cascade
  add_foreign_key "expenses", "tours", on_delete: :cascade
  add_foreign_key "expenses", "users", column: "created_by_id"
  add_foreign_key "expenses", "users", column: "external_attributed_to_id"
  add_foreign_key "expenses", "users", column: "paid_by_id"
  add_foreign_key "messages", "conversations"
  add_foreign_key "oauth_identities", "users"
  add_foreign_key "route_legs", "activities", column: "from_activity_id", on_delete: :cascade
  add_foreign_key "route_legs", "activities", column: "to_activity_id", on_delete: :cascade
  add_foreign_key "route_legs", "tours", on_delete: :cascade
  add_foreign_key "settlements", "tours"
  add_foreign_key "settlements", "users", column: "from_user_id"
  add_foreign_key "settlements", "users", column: "recorded_by_id"
  add_foreign_key "settlements", "users", column: "to_user_id"
  add_foreign_key "tour_budgets", "activities", on_delete: :cascade
  add_foreign_key "tour_budgets", "days", on_delete: :cascade
  add_foreign_key "tour_budgets", "tours", on_delete: :cascade
  add_foreign_key "tour_budgets", "users"
  add_foreign_key "tour_memberships", "tours"
  add_foreign_key "tour_memberships", "users"
  add_foreign_key "tours", "users", column: "author_id"
end
