class Guidebook < ApplicationRecord
  belongs_to :author, class_name: "User"
  has_many :guidebook_memberships, dependent: :destroy
  has_many :members, through: :guidebook_memberships, source: :user

  validates :title, presence: true

  before_validation :update_frontmatter_cache

  def owned_by?(user)
    if user
      author_id == user.id
    else
      false
    end
  end

  def editable_by?(user)
    if user
      owned_by?(user) || editor_member?(user)
    else
      false
    end
  end

  def visible_to?(user)
    if published?
      true
    elsif user
      owned_by?(user) || member?(user)
    else
      false
    end
  end

  def parsed_content
    FrontmatterParser.new(content).parse
  end

  def publishable?
    parsed_content.publishable?
  end

  private
    def editor_member?(user)
      guidebook_memberships.exists?(user: user, role: :editor)
    end

    def member?(user)
      guidebook_memberships.exists?(user: user)
    end

    def update_frontmatter_cache
      if content_changed?
        result = parsed_content
        self.frontmatter_cache = result.frontmatter
        if result.frontmatter["title"].present?
          self.title = result.frontmatter["title"]
        end
      end
    end
end
