Rails.application.routes.draw do
  # OAuth callbacks
  match "/auth/:provider/callback", to: "sessions#create", via: [ :get, :post ]
  get "/auth/failure", to: "sessions#failure"
  # OmniAuth developer strategy serves a form at GET /auth/developer (handled by middleware)
  delete "/logout", to: "sessions#destroy"

  # Email + verification code auth
  post "/auth/email/send",   to: "sessions#send_code"
  post "/auth/email/verify", to: "sessions#verify_code"

  # ActionCable
  mount ActionCable.server => "/cable"

  # Tours (Trip Planner)
  resources :tours, except: [ :new, :edit ] do
    resource  :constitution, only: [ :show, :update ], controller: "tours/constitutions"
    resources :members, controller: :tour_memberships, only: [ :create, :update, :destroy ]
    resources :days, only: [ :create, :update, :destroy ] do
      resources :activities, only: [ :create ]
    end
    resources :backlog_activities, only: [ :create ], controller: :activities
    resource  :conversation, only: [ :show, :destroy ] do
      resources :messages, only: [ :create ], controller: "conversations/messages"
    end
  end

  resources :activities, only: [ :update, :destroy ] do
    resource :position, only: [ :update ], controller: :activity_positions
  end

  # Login page
  get "/login", to: "sessions#new"

  root "tours#index"

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
