class ActivityImagesController < ApplicationController
  before_action :require_login

  def create
    activity = Activity.find(params[:activity_id])
    head :forbidden and return unless activity.tour.editable_by?(current_user)

    image = activity.activity_images.build(
      uploaded_by: current_user,
      caption: params[:caption],
      position: next_position(activity)
    )
    image.file.attach(params[:file]) if params[:file].present?

    if image.save
      render json: image_json(image)
    else
      render json: { errors: image.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    image = ActivityImage.find(params[:id])
    head :forbidden and return unless image.activity.tour.editable_by?(current_user)

    image.mark_as_cover! if truthy?(params[:is_cover])

    attrs = update_attrs
    image.update!(attrs) if attrs.any?

    render json: image_json(image)
  end

  def destroy
    image = ActivityImage.find(params[:id])
    head :forbidden and return unless image.activity.tour.editable_by?(current_user)

    image.destroy!
    head :no_content
  end

  private
    def next_position(activity)
      activity.activity_images.maximum(:position).to_i + 1
    end

    def update_attrs
      params.permit(:caption, :position).to_h.compact
    end

    def truthy?(value)
      [ true, "true", "1", 1 ].include?(value)
    end

    def image_json(image)
      {
        id: image.id,
        activity_id: image.activity_id,
        caption: image.caption,
        position: image.position,
        is_cover: image.is_cover,
        uploaded_by: image.uploaded_by&.name,
        url: image.file.attached? ? rails_blob_path(image.file, only_path: true) : nil
      }
    end
end
