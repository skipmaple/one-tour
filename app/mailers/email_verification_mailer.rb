class EmailVerificationMailer < ApplicationMailer
  def code_email(email:, code:)
    @code = code
    mail(to: email, subject: "【路书】您的登录验证码：#{code}")
  end
end
