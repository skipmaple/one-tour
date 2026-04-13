class Guidebooks::ImagesController < ApplicationController
  before_action :require_login
  before_action :set_guidebook
  before_action :require_editor

  def create
    image = params[:image]

    if image
      blob = ActiveStorage::Blob.create_and_upload!(
        io: image,
        filename: image.original_filename,
        content_type: image.content_type
      )

      # SVG is a vector format — variants are not supported, serve original directly
      if blob.content_type == "image/svg+xml"
        original_url = url_for(blob)
        render json: { thumb: original_url, hd: original_url }
      else
        thumb_variant = blob.variant(resize_to_limit: [600, 360]).processed
        hd_variant = blob.variant(resize_to_limit: [1200, 800]).processed

        render json: {
          thumb: url_for(thumb_variant),
          hd: url_for(hd_variant)
        }
      end
    else
      head :unprocessable_entity
    end
  end

  private
    def set_guidebook
      @guidebook = Guidebook.find(params[:guidebook_id])
    end

    def require_editor
      unless @guidebook.editable_by?(current_user)
        head :forbidden
      end
    end
end
