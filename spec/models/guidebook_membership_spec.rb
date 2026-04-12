require "rails_helper"

RSpec.describe GuidebookMembership, type: :model do
  describe "validations" do
    it "prevents duplicate membership for same guidebook and user" do
      membership = create(:guidebook_membership)
      duplicate = build(:guidebook_membership,
        guidebook: membership.guidebook,
        user: membership.user)
      expect(duplicate).not_to be_valid
    end
  end

  describe "role enum" do
    it "supports reader and editor roles" do
      membership = build(:guidebook_membership, role: :editor)
      expect(membership).to be_editor
      expect(membership).not_to be_reader
    end
  end
end
