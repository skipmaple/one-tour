Rails.application.routes.draw do
  # OAuth callbacks
  match "/auth/:provider/callback", to: "sessions#create", via: [ :get, :post ]
  get "/auth/failure", to: "sessions#failure"
  # OmniAuth developer strategy serves a form at GET /auth/developer (handled by middleware)
  delete "/logout", to: "sessions#destroy"

  resource :profile, only: [ :update ] do
    resource :avatar, only: [ :destroy ], controller: "profiles/avatars"
  end

  # Email + verification code auth
  post "/auth/email/send",   to: "sessions#send_code"
  post "/auth/email/verify", to: "sessions#verify_code"

  # ActionCable
  mount ActionCable.server => "/cable"

  # Tours (Trip Planner)
  resources :tours, except: [ :new, :edit ] do
    resource :constitution, only: [ :show, :update ], controller: "tours/constitutions" do
      post :accept, on: :member
    end
    resource  :timeline, only: [ :show ], controller: "tours/timelines"
    resource  :overrides, only: [ :create, :destroy ], controller: :constraint_overrides
    resources :members, controller: :tour_memberships, only: [ :create, :update, :destroy ]
    resources :days, only: [ :create, :update, :destroy ] do
      resources :activities, only: [ :create ]
    end
    resources :backlog_activities, only: [ :create ], controller: :activities
    resources :expenses, only: [ :create ]
    resources :budgets, only: [ :create ], controller: :tour_budgets
    resources :settlements, only: [ :create ]
    resources :route_legs, only: [ :create ]
    resource  :route_legs_batch, only: [ :create ], controller: "route_legs_batches"
    resource  :conversation, only: [ :show, :destroy ] do
      resources :messages, only: [ :create ], controller: "conversations/messages"
    end
  end

  resources :activities, only: [ :update, :destroy ] do
    resource :position, only: [ :update ], controller: :activity_positions
    resources :images, only: [ :create ], controller: :activity_images
    resource :participants, only: [ :update ], controller: :activity_participants
  end
  resources :activity_images, only: [ :update, :destroy ]

  resources :expenses, only: [ :update, :destroy ] do
    resources :receipts, only: [ :create ], controller: :expense_receipts
  end
  resources :expense_receipts, only: [ :destroy ]
  resources :tour_budgets, only: [ :update, :destroy ]
  resources :settlements,  only: [ :destroy ]
  resources :route_legs, only: [ :destroy ]

  get "/poi_search", to: "poi_searches#index"

  # Admin namespace
  namespace :admin do
    root to: "dashboard#show"
    resources :users, only: [ :index, :show ]
    resources :tours, only: [ :index, :show ]
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
