require "rails_helper"

RSpec.describe EmailVerification::RateLimit do
  describe ".check_send!" do
    it "allows the first request" do
      expect { described_class.check_send!(email: "a@b.com", ip: "1.1.1.1") }.not_to raise_error
    end

    it "blocks within 60 seconds of previous request for same email" do
      EmailVerification.issue!(email: "a@b.com", ip: "1.1.1.1")
      expect {
        described_class.check_send!(email: "a@b.com", ip: "2.2.2.2")
      }.to raise_error(EmailVerification::RateLimit::Error, /秒后再试/)
    end

    it "allows again after 60 seconds" do
      EmailVerification.issue!(email: "a@b.com", ip: "1.1.1.1")
      travel_to(61.seconds.from_now) do
        expect { described_class.check_send!(email: "a@b.com", ip: "2.2.2.2") }.not_to raise_error
      end
    end

    it "blocks after 5 requests per hour for same email" do
      5.times do |i|
        travel_to(i.minutes.from_now + 61.seconds) do
          EmailVerification.issue!(email: "a@b.com", ip: "1.1.1.1")
        end
      end
      travel_to(6.minutes.from_now + 61.seconds) do
        expect {
          described_class.check_send!(email: "a@b.com", ip: "1.1.1.1")
        }.to raise_error(EmailVerification::RateLimit::Error, /1 小时/)
      end
    end

    it "blocks after 20 requests per hour from same IP" do
      20.times do |i|
        EmailVerification.create!(
          email: "u#{i}@example.com",
          code_digest: "x" * 64,
          expires_at: 10.minutes.from_now,
          requested_ip: "9.9.9.9"
        )
      end
      expect {
        described_class.check_send!(email: "new@example.com", ip: "9.9.9.9")
      }.to raise_error(EmailVerification::RateLimit::Error, /请求过于频繁/)
    end
  end

  describe ".check_verify!" do
    it "allows when total attempts under limit" do
      expect { described_class.check_verify!(ip: "1.1.1.1") }.not_to raise_error
    end

    it "blocks when 10+ attempts within 1 minute from same IP" do
      record = EmailVerification.create!(
        email: "a@b.com",
        code_digest: "x" * 64,
        expires_at: 10.minutes.from_now,
        requested_ip: "5.5.5.5",
        attempts: 10
      )
      expect {
        described_class.check_verify!(ip: "5.5.5.5")
      }.to raise_error(EmailVerification::RateLimit::Error, /验证请求过于频繁/)
    end
  end
end
