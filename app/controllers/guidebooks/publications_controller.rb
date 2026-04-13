class Guidebooks::PublicationsController < ApplicationController
  before_action :require_login
  before_action :set_guidebook
  before_action :require_owner

  def create
    if @guidebook.publishable?
      @guidebook.update(published: true)
      redirect_to guidebook_path(@guidebook)
    else
      head :unprocessable_entity
    end
  end

  def destroy
    @guidebook.update(published: false)
    redirect_to edit_guidebook_path(@guidebook)
  end

  private
    def set_guidebook
      @guidebook = Guidebook.find(params[:guidebook_id])
    end

    def require_owner
      unless @guidebook.owned_by?(current_user)
        head :forbidden
      end
    end
end
