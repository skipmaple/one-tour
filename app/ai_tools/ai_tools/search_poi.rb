module AITools
  class SearchPoi < Base
    description "AMAP 模糊搜索 POI 候选（不创建 Activity，只返候选集）"
    param :query,       type: :string
    param :region_hint, type: :string, required: false
    param :near_lat,    type: :number, required: false
    param :near_lng,    type: :number, required: false

    def execute(query:, region_hint: nil, near_lat: nil, near_lng: nil)
      candidates = PoiSearch.new.search(query, region_hint: region_hint, near_lat: near_lat, near_lng: near_lng)
      ok(candidates: candidates)
    rescue PoiSearch::Error => e
      fail(e.message, code: "poi_search_failed")
    end
  end
end
