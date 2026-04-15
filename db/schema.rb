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

ActiveRecord::Schema[8.0].define(version: 2026_04_15_172615) do
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
    t.text "tips"
    t.jsonb "details", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["day_id"], name: "index_activities_on_day_id"
    t.index ["tour_id", "day_id", "position"], name: "index_activities_on_tour_id_and_day_id_and_position"
    t.index ["tour_id", "kind", "citizen_level"], name: "index_activities_on_tour_id_and_kind_and_citizen_level"
    t.index ["tour_id"], name: "index_activities_on_tour_id"
  end

  create_table "conversations", force: :cascade do |t|
    t.bigint "guidebook_id", null: false
    t.bigint "user_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["guidebook_id", "user_id"], name: "index_conversations_on_guidebook_id_and_user_id", unique: true
    t.index ["guidebook_id"], name: "index_conversations_on_guidebook_id"
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

  create_table "guidebook_memberships", force: :cascade do |t|
    t.bigint "guidebook_id", null: false
    t.bigint "user_id", null: false
    t.integer "role", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["guidebook_id", "user_id"], name: "index_guidebook_memberships_on_guidebook_id_and_user_id", unique: true
    t.index ["guidebook_id"], name: "index_guidebook_memberships_on_guidebook_id"
    t.index ["user_id"], name: "index_guidebook_memberships_on_user_id"
  end

  create_table "guidebooks", force: :cascade do |t|
    t.string "title", null: false
    t.text "content", default: "", null: false
    t.jsonb "frontmatter_cache", default: {}
    t.bigint "author_id", null: false
    t.boolean "published", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["author_id"], name: "index_guidebooks_on_author_id"
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
    t.index ["author_id"], name: "index_tours_on_author_id"
  end

  create_table "users", force: :cascade do |t|
    t.string "name", null: false
    t.string "email", null: false
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "activities", "days"
  add_foreign_key "activities", "tours"
  add_foreign_key "conversations", "guidebooks"
  add_foreign_key "conversations", "users"
  add_foreign_key "days", "tours"
  add_foreign_key "guidebook_memberships", "guidebooks"
  add_foreign_key "guidebook_memberships", "users"
  add_foreign_key "guidebooks", "users", column: "author_id"
  add_foreign_key "messages", "conversations"
  add_foreign_key "oauth_identities", "users"
  add_foreign_key "tour_memberships", "tours"
  add_foreign_key "tour_memberships", "users"
  add_foreign_key "tours", "users", column: "author_id"
end
