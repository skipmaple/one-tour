module Admin
  class DashboardController < BaseController
    def show
      render inertia: "Admin/Dashboard", props: {}
    end
  end
end
