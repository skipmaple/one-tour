require "rails_helper"

RSpec.describe EmailVerificationMailer, type: :mailer do
  describe "#code_email" do
    let(:mail) { described_class.code_email(email: "user@example.com", code: "123456") }

    it "addresses the recipient" do
      expect(mail.to).to eq [ "user@example.com" ]
    end

    it "has a Chinese subject with the code" do
      expect(mail.subject).to include "123456"
      expect(mail.subject).to include "OneTour"
    end

    it "includes the code in the HTML body" do
      expect(mail.html_part.body.to_s).to include "123456"
    end

    it "includes the code in the text body" do
      expect(mail.text_part.body.to_s).to include "123456"
    end

    it "uses the configured from address" do
      expect(mail.from.first).not_to be_blank
    end
  end
end
