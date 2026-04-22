class Tours::ConstitutionsController < ApplicationController
  before_action :require_login
  before_action :set_tour

  def update
    head :forbidden and return unless @tour.editable_by?(current_user)
    allowed = Constitution::DEFAULTS.keys.map(&:to_s)
    safe = params.require(:constitution).permit(*allowed).to_h
    @tour.update!(constitution: @tour.constitution.merge(safe))
    respond_to do |format|
      format.json { render json: { ok: true } }
      format.html { redirect_to @tour }
    end
  end

  # POST /tours/:tour_id/constitution/accept
  # Inertia callers get a redirect (which re-fetches the planner with the
  # updated constitution_accepted flag); fetch/spec callers requesting JSON
  # still get { ok: true }.
  #
  # Guard: the Tour model requires a non-blank title once constitution_accepted
  # flips to true. Hitting update! with a blank title would raise
  # ActiveRecord::RecordInvalid → 500. In normal flow the onboarding drawer
  # has already saved a title in step 1; this branch catches API-direct
  # callers / weird states and returns 422 instead of a server error.
  def accept
    head :forbidden and return unless @tour.editable_by?(current_user)
    if @tour.title.blank?
      respond_to do |format|
        format.json { render json: { error: "tour.title 不能为空" }, status: :unprocessable_entity }
        format.html { redirect_to tour_path(@tour), alert: "请先在设置里填写程名再接受宪法" }
      end
      return
    end
    @tour.update!(constitution_accepted: true)
    respond_to do |format|
      format.json { render json: { ok: true } }
      format.html { redirect_to tour_path(@tour) }
    end
  end

  private
    def set_tour
      @tour = Tour.find_by(id: params[:tour_id])
      head :not_found and return unless @tour
    end
end
