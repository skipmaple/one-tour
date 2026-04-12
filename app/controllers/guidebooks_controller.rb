class GuidebooksController < ApplicationController
  before_action :require_login, only: [:new, :create]
  before_action :set_guidebook, only: [:show, :edit, :update, :destroy]

  def index
    guidebooks = if logged_in?
      Guidebook.where(published: true)
        .or(Guidebook.where(author: current_user))
        .or(Guidebook.where(id: current_user.guidebook_memberships.select(:guidebook_id)))
    else
      Guidebook.where(published: true)
    end

    render inertia: "Guidebook/Index", props: {
      guidebooks: guidebooks.order(updated_at: :desc).map { |g| guidebook_summary(g) },
      current_user: user_props
    }
  end

  def show
    if @guidebook.visible_to?(current_user)
      render inertia: "Guidebook/Show", props: {
        guidebook: guidebook_detail(@guidebook),
        current_user: user_props
      }
    elsif logged_in?
      head :forbidden
    else
      redirect_to login_path
    end
  end

  def new
    render inertia: "Guidebook/Edit", props: {
      guidebook: nil,
      current_user: user_props
    }
  end

  def create
    guidebook = current_user.guidebooks.build(guidebook_params)

    if guidebook.save
      redirect_to edit_guidebook_path(guidebook)
    else
      redirect_to new_guidebook_path, inertia: { errors: guidebook.errors }
    end
  end

  def edit
    if @guidebook.editable_by?(current_user)
      render inertia: "Guidebook/Edit", props: {
        guidebook: guidebook_detail(@guidebook),
        current_user: user_props
      }
    else
      head :forbidden
    end
  end

  def update
    if @guidebook.editable_by?(current_user)
      if @guidebook.update(guidebook_params)
        redirect_to edit_guidebook_path(@guidebook)
      else
        redirect_to edit_guidebook_path(@guidebook), inertia: { errors: @guidebook.errors }
      end
    else
      head :forbidden
    end
  end

  def destroy
    if @guidebook.owned_by?(current_user)
      @guidebook.destroy
      redirect_to guidebooks_path
    else
      head :forbidden
    end
  end

  private
    def set_guidebook
      @guidebook = Guidebook.find(params[:id])
    end

    def guidebook_params
      params.require(:guidebook).permit(:content)
    end

    def guidebook_summary(guidebook)
      {
        id: guidebook.id,
        title: guidebook.title,
        published: guidebook.published,
        frontmatter: guidebook.frontmatter_cache,
        updated_at: guidebook.updated_at,
        author: { id: guidebook.author.id, name: guidebook.author.name },
        editable: guidebook.editable_by?(current_user),
        owned: guidebook.owned_by?(current_user)
      }
    end

    def guidebook_detail(guidebook)
      guidebook_summary(guidebook).merge(
        content: guidebook.content,
        publishable: guidebook.publishable?
      )
    end

    def user_props
      if current_user
        { id: current_user.id, name: current_user.name, avatar_url: current_user.avatar_url }
      end
    end
end
