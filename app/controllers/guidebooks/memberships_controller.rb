class Guidebooks::MembershipsController < ApplicationController
  before_action :require_login
  before_action :set_guidebook
  before_action :require_owner

  def index
    memberships = @guidebook.guidebook_memberships.includes(:user)
    render inertia: "Guidebook/Settings", props: {
      guidebook: { id: @guidebook.id, title: @guidebook.title },
      memberships: memberships.map { |m| membership_props(m) },
      current_user: { id: current_user.id, name: current_user.name }
    }
  end

  def create
    user = User.find_by(email: params.dig(:membership, :email))
    if user
      membership = @guidebook.guidebook_memberships.build(user: user, role: params.dig(:membership, :role))
      if membership.save
        redirect_to guidebook_memberships_path(@guidebook)
      else
        redirect_to guidebook_memberships_path(@guidebook), inertia: { errors: membership.errors }
      end
    else
      redirect_to guidebook_memberships_path(@guidebook), inertia: { errors: { email: ["User not found"] } }
    end
  end

  def update
    membership = @guidebook.guidebook_memberships.find(params[:id])
    membership.update!(role: params.dig(:membership, :role))
    redirect_to guidebook_memberships_path(@guidebook)
  end

  def destroy
    membership = @guidebook.guidebook_memberships.find(params[:id])
    membership.destroy
    redirect_to guidebook_memberships_path(@guidebook)
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

    def membership_props(membership)
      {
        id: membership.id,
        role: membership.role,
        user: {
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          avatar_url: membership.user.avatar_url
        }
      }
    end
end
