require "rails_helper"
require "rake"

RSpec.describe "admin rake tasks", type: :task do
  before(:all) do
    Rails.application.load_tasks if Rake::Task.tasks.empty?
  end

  before do
    Rake::Task["admin:grant"].reenable if Rake::Task.task_defined?("admin:grant")
    Rake::Task["admin:revoke"].reenable if Rake::Task.task_defined?("admin:revoke")
  end

  describe "admin:grant" do
    it "promotes the user to admin" do
      user = create(:user, email: "a@example.com")
      ENV["EMAIL"] = "a@example.com"
      Rake::Task["admin:grant"].invoke
      expect(user.reload.admin?).to be true
    ensure
      ENV.delete("EMAIL")
    end
  end

  describe "admin:revoke" do
    it "demotes admin to user" do
      user = create(:user, email: "b@example.com", role: :admin)
      ENV["EMAIL"] = "b@example.com"
      Rake::Task["admin:revoke"].invoke
      expect(user.reload.admin?).to be false
    ensure
      ENV.delete("EMAIL")
    end
  end
end
