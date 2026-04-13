require "rails_helper"

RSpec.describe OauthIdentity, type: :model do
  describe "associations" do
    it "belongs to user" do
      association = described_class.reflect_on_association(:user)
      expect(association.macro).to eq :belongs_to
    end
  end

  describe "validations" do
    it "requires provider" do
      identity = build(:oauth_identity, provider: nil)
      expect(identity).not_to be_valid
      expect(identity.errors[:provider]).to include("can't be blank")
    end

    it "requires uid" do
      identity = build(:oauth_identity, uid: nil)
      expect(identity).not_to be_valid
      expect(identity.errors[:uid]).to include("can't be blank")
    end

    it "requires uid to be unique per provider" do
      existing = create(:oauth_identity, provider: "github", uid: "123")
      duplicate = build(:oauth_identity, provider: "github", uid: "123")
      expect(duplicate).not_to be_valid
    end

    it "allows same uid across different providers" do
      create(:oauth_identity, provider: "github", uid: "123")
      different = build(:oauth_identity, provider: "google_oauth2", uid: "123")
      expect(different).to be_valid
    end
  end
end
