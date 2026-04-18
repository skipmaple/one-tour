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

  describe "avatar attachment" do
    let(:user) { create(:user) }

    def attach_fixture
      user.avatar.attach(
        io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")),
        filename: "avatar.png",
        content_type: "image/png"
      )
    end

    describe "#has_custom_avatar?" do
      it "is false when nothing is attached" do
        expect(user.has_custom_avatar?).to eq(false)
      end

      it "is true when an avatar is attached" do
        attach_fixture
        expect(user.has_custom_avatar?).to eq(true)
      end
    end

    describe "#display_avatar_url" do
      it "falls back to the avatar_url column when no attachment" do
        user.update_column(:avatar_url, "https://example.com/pic.png")
        expect(user.display_avatar_url).to eq("https://example.com/pic.png")
      end

      it "returns a rails-served attachment URL when attached" do
        attach_fixture
        expect(user.display_avatar_url).to match(%r{/rails/active_storage/})
      end

      it "returns nil when neither attachment nor column is present" do
        expect(user.display_avatar_url).to be_nil
      end
    end
  end
end
