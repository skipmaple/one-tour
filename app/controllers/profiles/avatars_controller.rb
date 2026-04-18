class Profiles::AvatarsController < ApplicationController
  before_action :require_login

  def destroy
    current_user.avatar.purge_later if current_user.avatar.attached?
    redirect_back_or_to(root_path, notice: "已恢复默认头像")
  end
end
