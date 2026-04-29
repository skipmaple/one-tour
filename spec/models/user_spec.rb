require "rails_helper"

RSpec.describe User, type: :model do
  describe "role enum" do
    it "defaults to :user" do
      user = create(:user)
      expect(user.role).to eq("user")
      expect(user.admin?).to be false
    end

    it "admin? returns true after promotion" do
      user = create(:user)
      user.update!(role: :admin)
      expect(user.admin?).to be true
    end
  end

  describe "associations (post-rename cleanup)" do
    it "has_many :tours (not :guidebooks)" do
      expect(User.reflect_on_association(:tours)).not_to be_nil
      expect(User.reflect_on_association(:guidebooks)).to be_nil
    end

    it "has_many :tour_memberships (not :guidebook_memberships)" do
      expect(User.reflect_on_association(:tour_memberships)).not_to be_nil
      expect(User.reflect_on_association(:guidebook_memberships)).to be_nil
    end
  end

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

    it "rejects a name containing a space" do
      user = User.new(name: "Drew Lee", email: "a@example.com")
      expect(user).not_to be_valid
      expect(user.errors[:name]).to be_present
    end

    it "rejects a name containing a hyphen" do
      user = User.new(name: "drew-lee", email: "a@example.com")
      expect(user).not_to be_valid
    end

    it "rejects a name containing an emoji" do
      user = User.new(name: "drew😀", email: "a@example.com")
      expect(user).not_to be_valid
    end

    it "rejects a name longer than 30 characters" do
      user = User.new(name: "a" * 31, email: "a@example.com")
      expect(user).not_to be_valid
      expect(user.errors[:name]).to include(a_string_matching(/30/))
    end

    it "accepts exactly 30 characters" do
      user = User.new(name: "a" * 30, email: "a@example.com")
      expect(user).to be_valid
    end

    it "accepts ASCII alphanumeric names" do
      user = User.new(name: "skipmaple42", email: "a@example.com")
      expect(user).to be_valid
    end

    it "accepts pure Chinese names" do
      user = User.new(name: "张三", email: "a@example.com")
      expect(user).to be_valid
    end

    it "accepts mixed alphanumeric + Chinese names" do
      user = User.new(name: "drew张三42", email: "a@example.com")
      expect(user).to be_valid
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

    describe "format and size validation" do
      it "rejects non-image content types" do
        user.avatar.attach(
          io: StringIO.new("not an image"),
          filename: "bad.txt",
          content_type: "text/plain"
        )
        expect(user).not_to be_valid
        expect(user.errors[:avatar]).to include("格式不支持")
      end

      it "rejects files over 5MB" do
        user.avatar.attach(
          io: StringIO.new("x" * (5.megabytes + 1)),
          filename: "big.png",
          content_type: "image/png"
        )
        expect(user).not_to be_valid
        expect(user.errors[:avatar]).to include("不能超过 5MB")
      end

      it "accepts a valid PNG under 5MB" do
        attach_fixture
        expect(user).to be_valid
      end

      it "rejects a non-image with a spoofed image/png content_type" do
        user.avatar.attach(
          io: StringIO.new("totally not a PNG"),
          filename: "evil.png",
          content_type: "image/png"
        )
        expect(user).not_to be_valid
        expect(user.errors[:avatar]).to include("格式不支持")
      end
    end
  end
end
