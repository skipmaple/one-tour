class CreateRouteLegs < ActiveRecord::Migration[8.0]
  def change
    create_table :route_legs do |t|
      t.references :tour, null: false, foreign_key: { on_delete: :cascade }
      t.references :from_activity, null: false, foreign_key: { to_table: :activities, on_delete: :cascade }
      t.references :to_activity,   null: false, foreign_key: { to_table: :activities, on_delete: :cascade }
      # mode: driving:0 / walking:1 / transit:2 (enum on the model).
      t.integer :mode, null: false, default: 0
      # Nullable until the first successful Amap fetch; UI falls back to
      # a straight line when polyline is empty.
      t.integer  :distance_m
      t.integer  :duration_s
      t.jsonb    :polyline, default: {}, null: false   # { coords: [[lng,lat]...], bounds: {...} }
      # SHA-1 of rounded endpoint coords + mode. Named endpoint_digest
      # (not cache_key) to avoid clashing with ActiveRecord's reserved
      # #cache_key method on AR::Base.
      t.string   :endpoint_digest
      t.datetime :fetched_at
      t.timestamps

      t.index [ :tour_id, :from_activity_id, :to_activity_id, :mode ],
              unique: true, name: "idx_route_legs_unique_pair"
      t.index :endpoint_digest
    end
  end
end
