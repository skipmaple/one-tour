class EmailVerification < ApplicationRecord
  EXPIRY       = 10.minutes
  MAX_ATTEMPTS = 5
  CODE_LENGTH  = 6

  validates :email,       presence: true, format: URI::MailTo::EMAIL_REGEXP
  validates :code_digest, presence: true
  validates :expires_at,  presence: true

  scope :active, -> { where(used_at: nil).where("expires_at > ?", Time.current) }

  class << self
    def issue!(email:, ip:)
      code = generate_code
      record = create!(
        email:        normalize_email(email),
        code_digest:  digest(code),
        expires_at:   EXPIRY.from_now,
        requested_ip: ip
      )
      [ record, code ]
    end

    def verify!(email:, code:)
      record = active.where(email: normalize_email(email)).order(created_at: :desc).first
      return [ :not_found, nil ] unless record
      return [ :exhausted, record ] if record.attempts >= MAX_ATTEMPTS

      if ActiveSupport::SecurityUtils.secure_compare(record.code_digest, digest(code))
        record.update!(used_at: Time.current)
        EmailVerification.active.where(email: record.email).update_all(used_at: Time.current)
        [ :ok, record ]
      else
        record.increment!(:attempts)
        [ :invalid, record ]
      end
    end

    def normalize_email(email)
      email.to_s.downcase.strip
    end

    private
      def generate_code
        SecureRandom.random_number(10**CODE_LENGTH).to_s.rjust(CODE_LENGTH, "0")
      end

      def digest(code)
        pepper = ENV["EMAIL_VERIFICATION_PEPPER"].to_s
        Digest::SHA256.hexdigest("#{pepper}:#{code}")
      end
  end
end
