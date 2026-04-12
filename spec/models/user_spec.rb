require "rails_helper"

RSpec.describe User, type: :model do
  describe "associations" do
    it "has many oauth_identities" do
      association = described_class.reflect_on_association(:oauth_identities)
      expect(association.macro).to eq :has_many
      expect(association.options[:dependent]).to eq :destroy
    end
  end

  describe "validations" do
    it "requires email" do
      user = User.new(name: "Test", email: nil)
      expect(user).not_to be_valid
      expect(user.errors[:email]).to include("can't be blank")
    end

    it "requires unique email" do
      User.create!(name: "First", email: "test@example.com")
      duplicate = User.new(name: "Second", email: "test@example.com")
      expect(duplicate).not_to be_valid
    end
  end
end
