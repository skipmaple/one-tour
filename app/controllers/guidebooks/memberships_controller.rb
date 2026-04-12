class Guidebooks::MembershipsController < ApplicationController
  before_action :require_login
  before_action :set_guidebook
  before_action :require_owner

  ALLOWED_ROLES = %w[reader editor].freeze

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
    role = params.dig(:membership, :role)

    if user.nil?
      redirect_to guidebook_memberships_path(@guidebook),
        inertia: { errors: { email: ["User not found"] } }
    elsif !ALLOWED_ROLES.include?(role)
      redirect_to guidebook_memberships_path(@guidebook),
        inertia: { errors: { role: ["Invalid role"] } }
    else
      membership = @guidebook.guidebook_memberships.build(user: user, role: role)
      if membership.save
        redirect_to guidebook_memberships_path(@guidebook)
      else
        redirect_to guidebook_memberships_path(@guidebook),
          inertia: { errors: membership.errors }
      end
    end
  end

  def update
    role = params.dig(:membership, :role)

    if ALLOWED_ROLES.include?(role)
      membership = @guidebook.guidebook_memberships.find(params[:id])
      membership.update!(role: role)
      redirect_to guidebook_memberships_path(@guidebook)
    else
      head :unprocessable_entity
    end
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
