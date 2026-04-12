require "rails_helper"

RSpec.describe Guidebook, type: :model do
  let(:user) { create(:user) }

  describe "associations" do
    it "belongs to author (User)" do
      association = described_class.reflect_on_association(:author)
      expect(association.macro).to eq :belongs_to
      expect(association.options[:class_name]).to eq "User"
    end

    it "has many guidebook_memberships" do
      association = described_class.reflect_on_association(:guidebook_memberships)
      expect(association.macro).to eq :has_many
      expect(association.options[:dependent]).to eq :destroy
    end

    it "has many members through guidebook_memberships" do
      association = described_class.reflect_on_association(:members)
      expect(association.macro).to eq :has_many
      expect(association.options[:through]).to eq :guidebook_memberships
      expect(association.options[:source]).to eq :user
    end
  end

  describe "#visible_to?" do
    let(:guidebook) { create(:guidebook, author: user, published: false) }
    let(:stranger) { create(:user) }

    it "is visible to the owner" do
      expect(guidebook.visible_to?(user)).to be true
    end

    it "is visible when published" do
      guidebook.update!(published: true)
      expect(guidebook.visible_to?(stranger)).to be true
    end

    it "is visible to a reader member" do
      create(:guidebook_membership, guidebook: guidebook, user: stranger, role: :reader)
      expect(guidebook.visible_to?(stranger)).to be true
    end

    it "is not visible to a stranger when unpublished" do
      expect(guidebook.visible_to?(stranger)).to be false
    end

    it "is not visible to anonymous (nil user)" do
      expect(guidebook.visible_to?(nil)).to be false
    end

    it "is visible to anonymous when published" do
      guidebook.update!(published: true)
      expect(guidebook.visible_to?(nil)).to be true
    end
  end

  describe "#editable_by?" do
    let(:guidebook) { create(:guidebook, author: user) }
    let(:editor_user) { create(:user) }
    let(:reader_user) { create(:user) }
    let(:stranger) { create(:user) }

    before do
      create(:guidebook_membership, guidebook: guidebook, user: editor_user, role: :editor)
      create(:guidebook_membership, guidebook: guidebook, user: reader_user, role: :reader)
    end

    it "is editable by the owner" do
      expect(guidebook.editable_by?(user)).to be true
    end

    it "is editable by an editor member" do
      expect(guidebook.editable_by?(editor_user)).to be true
    end

    it "is not editable by a reader member" do
      expect(guidebook.editable_by?(reader_user)).to be false
    end

    it "is not editable by a stranger" do
      expect(guidebook.editable_by?(stranger)).to be false
    end

    it "is not editable by anonymous" do
      expect(guidebook.editable_by?(nil)).to be false
    end
  end

  describe "#owned_by?" do
    let(:guidebook) { create(:guidebook, author: user) }

    it "returns true for the author" do
      expect(guidebook.owned_by?(user)).to be true
    end

    it "returns false for others" do
      expect(guidebook.owned_by?(create(:user))).to be false
    end
  end

  describe "frontmatter_cache callback" do
    it "updates frontmatter_cache when content changes" do
      guidebook = create(:guidebook, content: "---\ntitle: Original\ndays: []\n---\n\n# Body")
      expect(guidebook.frontmatter_cache["title"]).to eq "Original"

      guidebook.update!(content: "---\ntitle: Updated\ndays: []\n---\n\n# New Body")
      expect(guidebook.frontmatter_cache["title"]).to eq "Updated"
      expect(guidebook.title).to eq "Updated"
    end
  end
end
