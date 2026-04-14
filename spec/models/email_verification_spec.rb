require "rails_helper"

RSpec.describe EmailVerification, type: :model do
  describe ".issue!" do
    it "creates a record and returns a 6-digit code" do
      record, code = EmailVerification.issue!(email: "Foo@Example.com", ip: "1.2.3.4")

      expect(record).to be_persisted
      expect(record.email).to eq "foo@example.com"
      expect(record.requested_ip).to eq "1.2.3.4"
      expect(record.attempts).to eq 0
      expect(record.used_at).to be_nil
      expect(record.expires_at).to be_within(5.seconds).of(10.minutes.from_now)
      expect(code).to match(/\A\d{6}\z/)
    end

    it "stores the code as a hash, not plaintext" do
      _record, code = EmailVerification.issue!(email: "a@b.com", ip: "1.1.1.1")
      expect(EmailVerification.last.code_digest).not_to include(code)
      expect(EmailVerification.last.code_digest.length).to eq 64 # SHA256 hex
    end

    it "uses pepper in hash — same code + different pepper = different digest" do
      ClimateControl.modify(EMAIL_VERIFICATION_PEPPER: "pepper1") do
        _r, code = EmailVerification.issue!(email: "a@b.com", ip: "1.1.1.1")
        digest1 = EmailVerification.last.code_digest

        ClimateControl.modify(EMAIL_VERIFICATION_PEPPER: "pepper2") do
          expected_with_pepper2 = Digest::SHA256.hexdigest("pepper2:#{code}")
          expect(expected_with_pepper2).not_to eq digest1
        end
      end
    end
  end

  describe ".verify!" do
    let(:email) { "user@example.com" }

    it "returns :ok and marks used_at on correct code" do
      _record, code = EmailVerification.issue!(email: email, ip: "1.1.1.1")

      result, rec = EmailVerification.verify!(email: email, code: code)

      expect(result).to eq :ok
      expect(rec.used_at).not_to be_nil
    end

    it "is case-insensitive on email" do
      _record, code = EmailVerification.issue!(email: "User@Example.com", ip: "1.1.1.1")

      result, _rec = EmailVerification.verify!(email: "USER@example.COM", code: code)

      expect(result).to eq :ok
    end

    it "returns :invalid and increments attempts on wrong code" do
      record, _code = EmailVerification.issue!(email: email, ip: "1.1.1.1")

      result, _rec = EmailVerification.verify!(email: email, code: "000000")

      expect(result).to eq :invalid
      expect(record.reload.attempts).to eq 1
    end

    it "returns :exhausted after MAX_ATTEMPTS wrong guesses" do
      record, _code = EmailVerification.issue!(email: email, ip: "1.1.1.1")
      record.update!(attempts: EmailVerification::MAX_ATTEMPTS)

      result, _rec = EmailVerification.verify!(email: email, code: "000000")

      expect(result).to eq :exhausted
    end

    it "returns :not_found when no active record exists" do
      result, rec = EmailVerification.verify!(email: "nobody@example.com", code: "123456")

      expect(result).to eq :not_found
      expect(rec).to be_nil
    end

    it "returns :not_found on expired records" do
      record, code = EmailVerification.issue!(email: email, ip: "1.1.1.1")
      record.update!(expires_at: 1.minute.ago)

      result, _rec = EmailVerification.verify!(email: email, code: code)

      expect(result).to eq :not_found
    end

    it "invalidates all other pending codes for the same email on success" do
      _r1, _c1 = EmailVerification.issue!(email: email, ip: "1.1.1.1")
      travel_to(61.seconds.from_now) do
        _r2, code2 = EmailVerification.issue!(email: email, ip: "1.1.1.1")

        result, _rec = EmailVerification.verify!(email: email, code: code2)
        expect(result).to eq :ok
      end

      # All active records for this email should now be used
      expect(EmailVerification.where(email: email, used_at: nil).count).to eq 0
    end
  end

  describe "validations" do
    it "rejects malformed emails" do
      expect {
        EmailVerification.create!(email: "not-an-email", code_digest: "x", expires_at: 1.minute.from_now)
      }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end
end
