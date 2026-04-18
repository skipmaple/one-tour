class ProfilesController < ApplicationController
  before_action :require_login

  def update
    if current_user.update(profile_params)
      redirect_back_or_to(root_path, notice: "已保存")
    else
      redirect_back_or_to(root_path, inertia: { errors: current_user.errors.to_hash(true) })
    end
  end

  private
    def profile_params
      params.require(:user).permit(:name, :avatar)
    end
end
