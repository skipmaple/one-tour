class DaysController < ApplicationController
  before_action :require_login
  before_action :set_tour
  before_action :require_editor

  def create
    @day = @tour.days.create!(day_params)
    respond_to do |format|
      format.json { render json: { id: @day.id } }
      format.html { redirect_to @tour }
    end
  end

  def update
    day = @tour.days.find(params[:id])
    day.update!(day_params)
    redirect_to @tour
  end

  def destroy
    day = @tour.days.find(params[:id])
    day.destroy!
    redirect_to @tour
  end

  private
    def set_tour
      @tour = Tour.find(params[:tour_id])
    end

    def require_editor
      head(:forbidden) unless @tour.editable_by?(current_user)
    end

    def day_params
      params.require(:day).permit(:day_index, :date, :title, :theme, :intensity, :buffer_day)
    end
end
