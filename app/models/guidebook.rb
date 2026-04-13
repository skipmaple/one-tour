class Guidebook < ApplicationRecord
  include Guidebook::Generation

  belongs_to :author, class_name: "User"
  has_many :guidebook_memberships, dependent: :destroy
  has_many :members, through: :guidebook_memberships, source: :user
  has_many :conversations, dependent: :destroy
  has_one_attached :source_document

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

  def frontmatter_diff
    if saved_change_to_frontmatter_cache?
      old_cache, new_cache = saved_changes["frontmatter_cache"]
      compute_semantic_diff(old_cache || {}, new_cache || {})
    end
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

    def compute_semantic_diff(old_fm, new_fm)
      old_days = index_days(old_fm["days"])
      new_days = index_days(new_fm["days"])

      added = new_days.keys - old_days.keys
      removed = old_days.keys - new_days.keys
      modified = (old_days.keys & new_days.keys).select { |k| old_days[k] != new_days[k] }

      top_level_changed = (old_fm.keys | new_fm.keys)
        .reject { |k| k == "days" }
        .select { |k| old_fm[k] != new_fm[k] }

      diff = {
        added_days: added,
        removed_days: removed,
        modified_days: modified,
        changed_top_level_fields: top_level_changed
      }

      diff if added.any? || removed.any? || modified.any? || top_level_changed.any?
    end

    def index_days(days)
      if days.is_a?(Array)
        days.index_by { |d| d["day"] if d.is_a?(Hash) }
      else
        {}
      end
    end
end
