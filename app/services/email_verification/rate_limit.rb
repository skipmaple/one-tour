class EmailVerification::RateLimit
  Error = Class.new(StandardError)

  SEND_PER_EMAIL_WINDOW     = 60.seconds
  SEND_PER_EMAIL_HOUR_LIMIT = 5
  SEND_PER_IP_HOUR_LIMIT    = 20
  VERIFY_PER_IP_WINDOW      = 1.minute
  VERIFY_PER_IP_LIMIT       = 10

  def self.check_send!(email:, ip:)
    normalized = EmailVerification.normalize_email(email)

    recent = EmailVerification.where(email: normalized)
      .where("created_at > ?", SEND_PER_EMAIL_WINDOW.ago)
      .order(created_at: :desc).first
    if recent
      seconds = (recent.created_at + SEND_PER_EMAIL_WINDOW - Time.current).ceil
      raise Error, "请 #{seconds} 秒后再试"
    end

    if EmailVerification.where(email: normalized).where("created_at > ?", 1.hour.ago).count >= SEND_PER_EMAIL_HOUR_LIMIT
      raise Error, "该邮箱请求过于频繁，请 1 小时后再试"
    end

    if ip.present? && EmailVerification.where(requested_ip: ip).where("created_at > ?", 1.hour.ago).count >= SEND_PER_IP_HOUR_LIMIT
      raise Error, "请求过于频繁，请稍后再试"
    end
  end

  def self.check_verify!(ip:)
    return if ip.blank?

    attempts_in_window = EmailVerification
      .where(requested_ip: ip)
      .where("updated_at > ?", VERIFY_PER_IP_WINDOW.ago)
      .sum(:attempts)

    if attempts_in_window >= VERIFY_PER_IP_LIMIT
      raise Error, "验证请求过于频繁，请稍后再试"
    end
  end
end
