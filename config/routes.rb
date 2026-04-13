Rails.application.routes.draw do
  # OAuth callbacks
  match "/auth/:provider/callback", to: "sessions#create", via: [:get, :post]
  get "/auth/failure", to: "sessions#failure"
  # OmniAuth developer strategy serves a form at GET /auth/developer (handled by middleware)
  delete "/logout", to: "sessions#destroy"

  # ActionCable
  mount ActionCable.server => "/cable"

  # Guidebooks
  resources :guidebooks do
    scope module: :guidebooks do
      resource :publication, only: [:create, :destroy]
      resources :memberships, only: [:index, :create, :update, :destroy]
      resources :images, only: [:create]
      resources :conversations, only: [:create, :show] do
        resources :messages, only: [:create]
      end
    end
  end

  # Login page
  get "/login", to: "sessions#new"

  root "guidebooks#index"

  # Redirect to localhost from 127.0.0.1 to use same IP address with Vite server
  constraints(host: "127.0.0.1") do
    get "(*path)", to: redirect { |params, req| "#{req.protocol}localhost:#{req.port}/#{params[:path]}" }
  end

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Test helper (only in test env)
  if Rails.env.test?
    post "/login_test", to: "sessions#test_login"
  end
end
