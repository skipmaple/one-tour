# User Profile Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in users edit their nickname and upload a custom avatar via a Modal opened from the header avatar menu.

**Architecture:** Add `has_one_attached :avatar` to `User` (Active Storage → R2), add regex/length validation to `name`, backfill existing names to satisfy the new validation, and sanitize OAuth/email-code signup paths going forward. Expose a new `has_custom_avatar` prop and a resolved `avatar_url` (attachment variant → column → nil) through `inertia_share`. Add REST endpoints `PATCH /profile` and `DELETE /profile/avatar` with thin controllers. Frontend: one Modal component triggered from `AppLayout`.

**Tech Stack:** Rails 8.0 · Active Storage (image_processing gem) · inertia_rails 3.20 · Mantine v9 · React + Inertia · Vitest + React Testing Library · RSpec.

**Spec:** [docs/superpowers/specs/2026-04-18-user-profile-edit-design.md](../specs/2026-04-18-user-profile-edit-design.md)

---

## File Structure

**New files:**
- `spec/fixtures/files/avatar.png` — 1×1 PNG fixture for Active Storage tests
- `app/controllers/profiles_controller.rb` — PATCH /profile
- `app/controllers/profiles/avatars_controller.rb` — DELETE /profile/avatar
- `app/javascript/components/ProfileSettingsModal.jsx` — Modal UI
- `app/javascript/components/__tests__/ProfileSettingsModal.test.jsx` — Vitest tests
- `spec/requests/profiles_spec.rb` — PATCH endpoint specs
- `spec/requests/profiles/avatars_spec.rb` — DELETE endpoint specs
- `spec/requests/inertia_current_user_spec.rb` — verifies inertia_share props shape
- `db/migrate/<timestamp>_sanitize_existing_user_names.rb` — one-shot backfill

**Modified files:**
- `app/models/user.rb` — attachment + validations + display methods
- `app/controllers/application_controller.rb` — extend `inertia_share current_user`
- `app/controllers/sessions_controller.rb` — `sanitize_name` helper + use it on create
- `app/javascript/layouts/AppLayout.jsx` — menu item + modal mount
- `config/routes.rb` — `resource :profile do resource :avatar`
- `spec/models/user_spec.rb` — tests for new validations + methods
- `spec/factories/users.rb` — factory default name must satisfy new validation

---

## Task 1: Avatar test fixture

**Files:**
- Create: `spec/fixtures/files/avatar.png`

- [ ] **Step 1: Create a minimal valid 1×1 PNG file**

PNG files are binary; create via shell using the smallest possible valid PNG (built into ImageMagick):

Run:
```sh
mkdir -p spec/fixtures/files
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\xb6\xe0s\x8e\x00\x00\x00\x00IEND\xaeB`\x82' > spec/fixtures/files/avatar.png
```

Expected: file exists, ~70 bytes.

Verify:
```sh
file spec/fixtures/files/avatar.png
```
Expected output: `spec/fixtures/files/avatar.png: PNG image data, 1 x 1, 8-bit/color RGBA, non-interlaced`

- [ ] **Step 2: Commit**

```sh
git add spec/fixtures/files/avatar.png
git commit -m "test: add 1x1 PNG fixture for avatar specs"
```

---

## Task 2: User model — Active Storage avatar + display methods

**Files:**
- Modify: `app/models/user.rb`
- Modify: `spec/models/user_spec.rb`

- [ ] **Step 1: Write failing tests for `#has_custom_avatar?` and `#display_avatar_url`**

Append to `spec/models/user_spec.rb`:

```ruby
  describe "avatar attachment" do
    let(:user) { create(:user) }

    def attach_fixture
      user.avatar.attach(
        io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")),
        filename: "avatar.png",
        content_type: "image/png"
      )
    end

    describe "#has_custom_avatar?" do
      it "is false when nothing is attached" do
        expect(user.has_custom_avatar?).to eq(false)
      end

      it "is true when an avatar is attached" do
        attach_fixture
        expect(user.has_custom_avatar?).to eq(true)
      end
    end

    describe "#display_avatar_url" do
      it "falls back to the avatar_url column when no attachment" do
        user.update_column(:avatar_url, "https://example.com/pic.png")
        expect(user.display_avatar_url).to eq("https://example.com/pic.png")
      end

      it "returns a rails-served attachment URL when attached" do
        attach_fixture
        expect(user.display_avatar_url).to match(%r{/rails/active_storage/})
      end

      it "returns nil when neither attachment nor column is present" do
        expect(user.display_avatar_url).to be_nil
      end
    end
  end
```

- [ ] **Step 2: Run tests to verify failure**

Run: `mise exec -- bundle exec rspec spec/models/user_spec.rb -e "avatar attachment"`
Expected: FAIL — `NoMethodError: undefined method 'has_custom_avatar?'` (or similar).

- [ ] **Step 3: Implement the attachment and the two display methods**

Replace the content of `app/models/user.rb` with:

```ruby
class User < ApplicationRecord
  has_one_attached :avatar

  has_many :oauth_identities, dependent: :destroy
  has_many :guidebooks, foreign_key: :author_id, dependent: :destroy
  has_many :guidebook_memberships, dependent: :destroy
  has_many :conversations, dependent: :destroy

  validates :name, presence: true
  validates :email, presence: true, uniqueness: true

  def display_avatar_url
    if avatar.attached?
      Rails.application.routes.url_helpers.rails_representation_url(
        avatar.variant(resize_to_limit: [ 512, 512 ]),
        only_path: true
      )
    else
      avatar_url
    end
  end

  def has_custom_avatar?
    avatar.attached?
  end
end
```

- [ ] **Step 4: Run tests to verify pass**

Run: `mise exec -- bundle exec rspec spec/models/user_spec.rb`
Expected: all specs PASS (including the pre-existing email ones).

- [ ] **Step 5: Commit**

```sh
git add app/models/user.rb spec/models/user_spec.rb
git commit -m "feat(user): add has_one_attached :avatar + display_avatar_url / has_custom_avatar?"
```

---

## Task 3: Fix user factory default name

The new name format validation (Task 4) will reject `"Test User"` (space). Clean the factory first so nothing breaks when validation lands.

**Files:**
- Modify: `spec/factories/users.rb`

- [ ] **Step 1: Edit the factory to use a validation-safe default**

Replace `spec/factories/users.rb` with:

```ruby
FactoryBot.define do
  factory :user do
    sequence(:name) { |n| "TestUser#{n}" }
    sequence(:email) { |n| "user#{n}@example.com" }
  end
end
```

- [ ] **Step 2: Run full RSpec to confirm nothing regressed**

Run: `mise exec -- bundle exec rspec`
Expected: all tests still PASS.

- [ ] **Step 3: Commit**

```sh
git add spec/factories/users.rb
git commit -m "test: make :user factory name satisfy upcoming format validation"
```

---

## Task 4: User model — name format & length validation

**Files:**
- Modify: `app/models/user.rb`
- Modify: `spec/models/user_spec.rb`

- [ ] **Step 1: Write failing tests for name validations**

Append to the `describe "validations"` block in `spec/models/user_spec.rb`:

```ruby
    it "rejects a name containing a space" do
      user = User.new(name: "Drew Lee", email: "a@example.com")
      expect(user).not_to be_valid
      expect(user.errors[:name]).to be_present
    end

    it "rejects a name containing a hyphen" do
      user = User.new(name: "drew-lee", email: "a@example.com")
      expect(user).not_to be_valid
    end

    it "rejects a name containing an emoji" do
      user = User.new(name: "drew😀", email: "a@example.com")
      expect(user).not_to be_valid
    end

    it "rejects a name longer than 30 characters" do
      user = User.new(name: "a" * 31, email: "a@example.com")
      expect(user).not_to be_valid
      expect(user.errors[:name]).to include(a_string_matching(/30/))
    end

    it "accepts ASCII alphanumeric names" do
      user = User.new(name: "skipmaple42", email: "a@example.com")
      expect(user).to be_valid
    end

    it "accepts pure Chinese names" do
      user = User.new(name: "路书", email: "a@example.com")
      expect(user).to be_valid
    end

    it "accepts mixed alphanumeric + Chinese names" do
      user = User.new(name: "drew路书42", email: "a@example.com")
      expect(user).to be_valid
    end
```

- [ ] **Step 2: Run tests to verify failure**

Run: `mise exec -- bundle exec rspec spec/models/user_spec.rb`
Expected: seven new failures (all the new specs fail because current validation only checks `presence`).

- [ ] **Step 3: Add the validation to the model**

Replace the `validates :name` line in `app/models/user.rb` with:

```ruby
  validates :name, presence: true,
                   length: { maximum: 30 },
                   format: {
                     with: /\A[A-Za-z0-9\u4e00-\u9fff]+\z/,
                     message: "只能包含字母、数字或中文"
                   }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `mise exec -- bundle exec rspec spec/models/user_spec.rb`
Expected: all specs PASS.

- [ ] **Step 5: Commit**

```sh
git add app/models/user.rb spec/models/user_spec.rb
git commit -m "feat(user): validate name format (alphanumeric + Chinese) and length (≤30)"
```

---

## Task 5: User model — avatar format & size validation

**Files:**
- Modify: `app/models/user.rb`
- Modify: `spec/models/user_spec.rb`

- [ ] **Step 1: Write failing tests for the avatar validator**

Append to `spec/models/user_spec.rb` inside the existing `describe "avatar attachment"` block:

```ruby
    describe "format and size validation" do
      it "rejects non-image content types" do
        user.avatar.attach(
          io: StringIO.new("not an image"),
          filename: "bad.txt",
          content_type: "text/plain"
        )
        expect(user).not_to be_valid
        expect(user.errors[:avatar]).to include("格式不支持")
      end

      it "rejects files over 5MB" do
        user.avatar.attach(
          io: StringIO.new("x" * (5.megabytes + 1)),
          filename: "big.png",
          content_type: "image/png"
        )
        expect(user).not_to be_valid
        expect(user.errors[:avatar]).to include("不能超过 5MB")
      end

      it "accepts a valid PNG under 5MB" do
        attach_fixture
        expect(user).to be_valid
      end
    end
```

- [ ] **Step 2: Run tests to verify failure**

Run: `mise exec -- bundle exec rspec spec/models/user_spec.rb -e "format and size validation"`
Expected: first two specs FAIL (validation not yet defined).

- [ ] **Step 3: Add the validation**

Add the following to `app/models/user.rb` after the existing `validates` lines:

```ruby
  validate :avatar_format_and_size, if: -> { avatar.attached? }

  private
    def avatar_format_and_size
      unless %w[image/jpeg image/png image/webp].include?(avatar.content_type)
        errors.add(:avatar, "格式不支持")
      end
      if avatar.byte_size > 5.megabytes
        errors.add(:avatar, "不能超过 5MB")
      end
    end
```

- [ ] **Step 4: Run tests to verify pass**

Run: `mise exec -- bundle exec rspec spec/models/user_spec.rb`
Expected: all specs PASS.

- [ ] **Step 5: Commit**

```sh
git add app/models/user.rb spec/models/user_spec.rb
git commit -m "feat(user): validate avatar content type (jpeg/png/webp) and size (≤5MB)"
```

---

## Task 6: sanitize_name + sessions_controller create paths

**Files:**
- Modify: `app/controllers/sessions_controller.rb`
- Create: `spec/requests/sessions_controller_sanitize_name_spec.rb`

- [ ] **Step 1: Write failing tests for the two create paths**

Create `spec/requests/sessions_controller_sanitize_name_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "Sessions controller name sanitization", type: :request do
  describe "email-code signup" do
    before do
      allow(EmailVerification::RateLimit).to receive(:check_send!)
      allow(EmailVerification::RateLimit).to receive(:check_verify!)
    end

    it "strips punctuation from the email prefix when creating a user" do
      email = "drew.lee+test@example.com"
      _record, code = EmailVerification.issue!(email: email, ip: "1.2.3.4")
      post "/auth/email/verify", params: { email: email, code: code }
      user = User.find_by(email: "drew.lee+test@example.com")
      expect(user).to be_present
      expect(user.name).to eq("drewleetest")
    end

    it "falls back to 'user' when sanitization produces empty string" do
      email = "+.+.@example.com"
      _record, code = EmailVerification.issue!(email: email, ip: "1.2.3.4")
      post "/auth/email/verify", params: { email: email, code: code }
      user = User.find_by(email: "+.+.@example.com")
      expect(user).to be_present
      expect(user.name).to eq("user")
    end
  end

  describe "OAuth signup" do
    before do
      OmniAuth.config.test_mode = true
      OmniAuth.config.mock_auth[:github] = OmniAuth::AuthHash.new(
        provider: "github",
        uid: "12345",
        info: { email: "drew@example.com", name: "Drew Lee", image: "https://example.com/a.png" },
        credentials: {}
      )
    end

    after  { OmniAuth.config.test_mode = false }

    it "strips spaces from the OAuth-provided name" do
      get "/auth/github/callback"
      user = User.find_by(email: "drew@example.com")
      expect(user).to be_present
      expect(user.name).to eq("DrewLee")
    end
  end
end
```

- [ ] **Step 2: Run tests to verify failure**

Run: `mise exec -- bundle exec rspec spec/requests/sessions_controller_sanitize_name_spec.rb`
Expected: FAIL — user is created with un-sanitized name, or `User.create!` raises because `"Drew Lee"` now fails format validation.

- [ ] **Step 3: Update sessions_controller to sanitize**

In `app/controllers/sessions_controller.rb`, replace the private section (starting at `private` through `def fallback_email`) with:

```ruby
  private
    def find_or_create_user_by_email(raw_email)
      email = EmailVerification.normalize_email(raw_email)
      User.find_by(email: email) || User.create!(
        email: email,
        name:  sanitize_name(email.split("@").first, fallback: "user")
      )
    end

    def find_or_create_identity(auth)
      identity = OauthIdentity.find_by(provider: auth.provider, uid: auth.uid)
      credentials = auth.credentials ? auth.credentials.to_h : {}

      if identity
        identity.update(credentials: credentials)
        identity
      else
        user = find_or_create_user(auth)
        user.oauth_identities.create!(
          provider: auth.provider,
          uid: auth.uid,
          credentials: credentials
        )
      end
    end

    def find_or_create_user(auth)
      email = auth.info.email.presence || fallback_email(auth)
      if user = User.find_by(email: email)
        user
      else
        raw_name = auth.info.name.presence || auth.info.nickname
        User.create!(
          email: email,
          name: sanitize_name(raw_name, fallback: "user"),
          avatar_url: auth.info.image
        )
      end
    end

    def sanitize_name(raw, fallback:)
      cleaned = raw.to_s.gsub(/[^A-Za-z0-9\u4e00-\u9fff]/, "")[0, 30]
      cleaned.presence || fallback
    end

    def fallback_email(auth)
      case auth.provider
      when "github"
        "#{auth.uid}+#{auth.info.nickname}@users.noreply.github.com"
      when "feishu"
        "#{auth.uid}@feishu.noreply.lark.com"
      else
        raise "No email returned from #{auth.provider}"
      end
    end
```

- [ ] **Step 4: Run tests to verify pass**

Run: `mise exec -- bundle exec rspec spec/requests/sessions_controller_sanitize_name_spec.rb`
Expected: all three specs PASS.

- [ ] **Step 5: Run the full suite to catch regressions in any other auth spec**

Run: `mise exec -- bundle exec rspec`
Expected: all PASS.

- [ ] **Step 6: Commit**

```sh
git add app/controllers/sessions_controller.rb spec/requests/sessions_controller_sanitize_name_spec.rb
git commit -m "feat(auth): sanitize name on signup so OAuth/email-code users pass new validation"
```

---

## Task 7: Data migration — backfill existing user names

**Files:**
- Create: `db/migrate/<timestamp>_sanitize_existing_user_names.rb`

- [ ] **Step 1: Generate a migration**

Run:
```sh
mise exec -- bundle exec rails generate migration SanitizeExistingUserNames
```

Expected: creates `db/migrate/<timestamp>_sanitize_existing_user_names.rb`.

- [ ] **Step 2: Replace the generated file's contents**

Replace the migration body with:

```ruby
class SanitizeExistingUserNames < ActiveRecord::Migration[8.0]
  def up
    User.reset_column_information
    User.find_each do |u|
      clean = u.name.to_s.gsub(/[^A-Za-z0-9\u4e00-\u9fff]/, "")[0, 30]
      clean = "user#{u.id}" if clean.empty?
      u.update_columns(name: clean) if clean != u.name
    end
  end

  def down
    # Irreversible — original names are not recoverable.
  end
end
```

- [ ] **Step 3: Prepare the test database (also runs new migration)**

Run: `mise exec -- bundle exec rails db:test:prepare`
Expected: migration runs cleanly, no output or a success line.

- [ ] **Step 4: Verify existing specs still pass after migration**

Run: `mise exec -- bundle exec rspec`
Expected: all PASS.

- [ ] **Step 5: Verify in dev DB (manual check)**

Run (from the worktree):
```sh
mise exec -- bundle exec rails db:migrate
mise exec -- bundle exec rails runner 'User.find_each { |u| puts "#{u.id} => #{u.name}" }'
```
Expected: every listed name matches `/\A[A-Za-z0-9\u4e00-\u9fff]+\z/` and is ≤ 30 characters.

- [ ] **Step 6: Commit**

```sh
git add db/migrate
git commit -m "db: backfill existing user names to satisfy new format validation"
```

---

## Task 8: ProfilesController#update + routes

**Files:**
- Modify: `config/routes.rb`
- Create: `app/controllers/profiles_controller.rb`
- Create: `spec/requests/profiles_spec.rb`

- [ ] **Step 1: Write the failing request spec**

Create `spec/requests/profiles_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "PATCH /profile", type: :request do
  let(:user) { create(:user, name: "Original") }

  def login_as(u)
    post "/login_test", params: { user_id: u.id }
  end

  def valid_png
    Rack::Test::UploadedFile.new(
      Rails.root.join("spec/fixtures/files/avatar.png"),
      "image/png"
    )
  end

  it "redirects to /login when not logged in" do
    patch "/profile", params: { user: { name: "Changed" } }
    expect(response).to redirect_to(login_path)
  end

  describe "when logged in" do
    before { login_as(user) }

    it "updates the name with a valid value" do
      patch "/profile", params: { user: { name: "Changed" } }
      expect(response).to have_http_status(:redirect)
      expect(user.reload.name).to eq("Changed")
    end

    it "returns errors for an invalid name" do
      patch "/profile", params: { user: { name: "bad name" } }, headers: { "X-Inertia" => "true" }
      expect(user.reload.name).to eq("Original")
    end

    it "attaches an uploaded avatar" do
      patch "/profile", params: { user: { avatar: valid_png } }
      expect(user.reload.avatar).to be_attached
    end

    it "rejects an oversized file" do
      oversize = Tempfile.new([ "big", ".png" ], binmode: true)
      oversize.write("x" * (5.megabytes + 1))
      oversize.rewind
      patch "/profile", params: { user: { avatar: Rack::Test::UploadedFile.new(oversize.path, "image/png") } }
      user.reload
      expect(user.avatar).not_to be_attached
    end
  end
end
```

- [ ] **Step 2: Run tests to verify failure**

Run: `mise exec -- bundle exec rspec spec/requests/profiles_spec.rb`
Expected: FAIL — `ActionController::RoutingError: No route matches [PATCH] "/profile"`.

- [ ] **Step 3: Add the route**

Open `config/routes.rb`. Add this line after the `delete "/logout"` line:

```ruby
  resource :profile, only: [ :update ] do
    resource :avatar, only: [ :destroy ]
  end
```

- [ ] **Step 4: Create the controller**

Create `app/controllers/profiles_controller.rb`:

```ruby
class ProfilesController < ApplicationController
  before_action :require_login

  def update
    if current_user.update(profile_params)
      redirect_back_or_to(root_path, notice: "已保存")
    else
      redirect_back_or_to(root_path, inertia: { errors: current_user.errors.to_hash(true) })
    end
  end

  private
    def profile_params
      params.require(:user).permit(:name, :avatar)
    end
end
```

- [ ] **Step 5: Run tests to verify pass**

Run: `mise exec -- bundle exec rspec spec/requests/profiles_spec.rb`
Expected: all PASS.

- [ ] **Step 6: Commit**

```sh
git add config/routes.rb app/controllers/profiles_controller.rb spec/requests/profiles_spec.rb
git commit -m "feat(profile): PATCH /profile to update nickname and avatar"
```

---

## Task 9: Profiles::AvatarsController#destroy

**Files:**
- Create: `app/controllers/profiles/avatars_controller.rb`
- Create: `spec/requests/profiles/avatars_spec.rb`

- [ ] **Step 1: Write the failing request spec**

Create `spec/requests/profiles/avatars_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "DELETE /profile/avatar", type: :request do
  let(:user) { create(:user) }

  def login_as(u)
    post "/login_test", params: { user_id: u.id }
  end

  def attach_fixture(u)
    u.avatar.attach(
      io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")),
      filename: "avatar.png",
      content_type: "image/png"
    )
  end

  it "redirects to /login when not logged in" do
    delete "/profile/avatar"
    expect(response).to redirect_to(login_path)
  end

  describe "when logged in" do
    before { login_as(user) }

    it "enqueues ActiveStorage::PurgeJob when an avatar is attached" do
      attach_fixture(user)
      expect {
        delete "/profile/avatar"
      }.to have_enqueued_job(ActiveStorage::PurgeJob)
    end

    it "is a harmless no-op when no avatar attached" do
      expect {
        delete "/profile/avatar"
      }.not_to raise_error
      expect(response).to have_http_status(:redirect)
    end
  end
end
```

- [ ] **Step 2: Run tests to verify failure**

Run: `mise exec -- bundle exec rspec spec/requests/profiles/avatars_spec.rb`
Expected: FAIL — `uninitialized constant Profiles::AvatarsController`.

- [ ] **Step 3: Create the controller**

Create `app/controllers/profiles/avatars_controller.rb`:

```ruby
class Profiles::AvatarsController < ApplicationController
  before_action :require_login

  def destroy
    current_user.avatar.purge_later if current_user.avatar.attached?
    redirect_back_or_to(root_path, notice: "已恢复默认头像")
  end
end
```

- [ ] **Step 4: Run tests to verify pass**

Run: `mise exec -- bundle exec rspec spec/requests/profiles/avatars_spec.rb`
Expected: all PASS.

- [ ] **Step 5: Commit**

```sh
git add app/controllers/profiles/avatars_controller.rb spec/requests/profiles/avatars_spec.rb
git commit -m "feat(profile): DELETE /profile/avatar to clear custom avatar"
```

---

## Task 10: Extend inertia_share current_user

**Files:**
- Modify: `app/controllers/application_controller.rb`
- Create: `spec/requests/inertia_current_user_spec.rb`

- [ ] **Step 1: Write the failing request spec**

Create `spec/requests/inertia_current_user_spec.rb`:

```ruby
require "rails_helper"

RSpec.describe "inertia_share current_user", type: :request do
  let(:user) { create(:user) }

  def login_as(u)
    post "/login_test", params: { user_id: u.id }
  end

  def inertia_props
    get "/", headers: { "X-Inertia" => "true", "Accept" => "application/json" }
    JSON.parse(response.body).fetch("props")
  end

  before { login_as(user) }

  it "exposes avatar_url (null when no attachment and no column value)" do
    expect(inertia_props["current_user"]).to have_key("avatar_url")
    expect(inertia_props["current_user"]["avatar_url"]).to be_nil
  end

  it "exposes has_custom_avatar=false when no attachment" do
    expect(inertia_props["current_user"]["has_custom_avatar"]).to eq(false)
  end

  it "exposes has_custom_avatar=true after an attachment" do
    user.avatar.attach(
      io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")),
      filename: "avatar.png",
      content_type: "image/png"
    )
    expect(inertia_props["current_user"]["has_custom_avatar"]).to eq(true)
    expect(inertia_props["current_user"]["avatar_url"]).to match(%r{/rails/active_storage/})
  end
end
```

- [ ] **Step 2: Run tests to verify failure**

Run: `mise exec -- bundle exec rspec spec/requests/inertia_current_user_spec.rb`
Expected: FAIL — `has_custom_avatar` key missing or avatar_url not derived from attachment.

- [ ] **Step 3: Update the shared block**

In `app/controllers/application_controller.rb`, replace the `inertia_share current_user` line with:

```ruby
  inertia_share current_user: -> {
    next unless current_user
    current_user.as_json(only: [ :id, :name, :email ])
                .merge(
                  "avatar_url"        => current_user.display_avatar_url,
                  "has_custom_avatar" => current_user.has_custom_avatar?
                )
  }
```

- [ ] **Step 4: Run tests to verify pass**

Run: `mise exec -- bundle exec rspec spec/requests/inertia_current_user_spec.rb`
Expected: all PASS.

- [ ] **Step 5: Run the full suite to check nothing reading `current_user` broke**

Run: `mise exec -- bundle exec rspec`
Expected: all PASS.

- [ ] **Step 6: Commit**

```sh
git add app/controllers/application_controller.rb spec/requests/inertia_current_user_spec.rb
git commit -m "feat(inertia): expose display_avatar_url and has_custom_avatar in current_user props"
```

---

## Task 11: ProfileSettingsModal component + Vitest tests

**Files:**
- Create: `app/javascript/components/ProfileSettingsModal.jsx`
- Create: `app/javascript/components/__tests__/ProfileSettingsModal.test.jsx`

- [ ] **Step 1: Write the failing Vitest spec**

Create `app/javascript/components/__tests__/ProfileSettingsModal.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { vi } from 'vitest'
import ProfileSettingsModal from '../ProfileSettingsModal'

// Keep the real useForm (it's just useState underneath). Only mock usePage
// (component reads current_user from it) and router (component calls
// router.delete for avatar removal).
vi.mock('@inertiajs/react', async () => {
  const actual = await vi.importActual('@inertiajs/react')
  return {
    ...actual,
    usePage: () => ({
      props: {
        current_user: {
          id: 1,
          name: 'skipmaple',
          email: 'skip@example.com',
          avatar_url: null,
          has_custom_avatar: false,
        },
      },
    }),
    router: { delete: vi.fn() },
  }
})

function renderModal(overrides = {}) {
  return render(
    <MantineProvider>
      <ProfileSettingsModal opened onClose={() => {}} {...overrides} />
    </MantineProvider>
  )
}

describe('ProfileSettingsModal', () => {
  test('disables save when the nickname is empty', async () => {
    renderModal()
    const input = screen.getByLabelText(/昵称/)
    await userEvent.clear(input)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  test('disables save and shows error when nickname has disallowed chars', async () => {
    renderModal()
    const input = screen.getByLabelText(/昵称/)
    await userEvent.clear(input)
    await userEvent.type(input, 'bad name')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByText('只能包含字母、数字或中文')).toBeInTheDocument()
  })

  test('hides "使用默认头像" when has_custom_avatar is false', () => {
    renderModal()
    expect(screen.queryByText('使用默认头像')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- ProfileSettingsModal`
Expected: FAIL — `Cannot find module '../ProfileSettingsModal'`.

- [ ] **Step 3: Implement the component**

Create `app/javascript/components/ProfileSettingsModal.jsx`:

```jsx
import { Modal, Stack, TextInput, FileInput, Button, Group, Avatar, Anchor } from '@mantine/core'
import { useForm, usePage, router } from '@inertiajs/react'
import { useMemo } from 'react'

const NAME_RE = /^[A-Za-z0-9\u4e00-\u9fff]+$/

export default function ProfileSettingsModal({ opened, onClose }) {
  const { current_user } = usePage().props
  const form = useForm({ name: current_user.name, avatar: null })

  const previewUrl = useMemo(() => {
    if (form.data.avatar) return URL.createObjectURL(form.data.avatar)
    return current_user.avatar_url || null
  }, [form.data.avatar, current_user.avatar_url])

  const clientNameError = (() => {
    const v = (form.data.name || '').trim()
    if (v.length === 0) return '昵称不能为空'
    if (v.length > 30) return '昵称不能超过 30 字符'
    if (!NAME_RE.test(v)) return '只能包含字母、数字或中文'
    return null
  })()

  function submit(e) {
    e.preventDefault()
    if (clientNameError) return
    form.patch('/profile', {
      forceFormData: true,
      preserveScroll: true,
      onSuccess: onClose,
    })
  }

  function removeAvatar() {
    router.delete('/profile/avatar', { preserveScroll: true })
  }

  const showRemoveAvatar = current_user.has_custom_avatar && !form.data.avatar

  return (
    <Modal opened={opened} onClose={onClose} title="个人设置" centered>
      <form onSubmit={submit}>
        <Stack>
          <Group>
            <Avatar src={previewUrl} size={72} radius="xl">
              {current_user.name?.[0]?.toUpperCase()}
            </Avatar>
            <Stack gap={4} style={{ flex: 1 }}>
              <FileInput
                placeholder="选择图片 (JPG/PNG/WebP, ≤5MB)"
                accept="image/jpeg,image/png,image/webp"
                value={form.data.avatar}
                onChange={(f) => form.setData('avatar', f)}
                error={form.errors.avatar}
                size="xs"
              />
              {showRemoveAvatar && (
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  c="dimmed"
                  onClick={removeAvatar}
                >
                  使用默认头像
                </Anchor>
              )}
            </Stack>
          </Group>

          <TextInput
            label="昵称"
            value={form.data.name}
            onChange={(e) => form.setData('name', e.currentTarget.value)}
            error={form.errors.name || clientNameError}
            maxLength={30}
            required
          />

          <TextInput label="邮箱" value={current_user.email} readOnly disabled />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>取消</Button>
            <Button
              type="submit"
              loading={form.processing}
              disabled={Boolean(clientNameError)}
            >
              保存
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: Run Vitest to verify tests pass**

Run: `npm test -- ProfileSettingsModal`
Expected: all three tests PASS.

- [ ] **Step 5: Run the whole Vitest suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```sh
git add app/javascript/components/ProfileSettingsModal.jsx app/javascript/components/__tests__/ProfileSettingsModal.test.jsx
git commit -m "feat(profile): ProfileSettingsModal with client-side name validation + avatar preview"
```

---

## Task 12: AppLayout — add menu item and mount modal

**Files:**
- Modify: `app/javascript/layouts/AppLayout.jsx`

This task is purely wiring — visual verification happens in Task 13.

- [ ] **Step 1: Replace the file with the wired version**

Replace the content of `app/javascript/layouts/AppLayout.jsx` with:

```jsx
import { AppShell, Group, Button, Avatar, Text, Menu } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Link, usePage } from '@inertiajs/react'
import ProfileSettingsModal from '../components/ProfileSettingsModal'

export default function AppLayout({ children }) {
  const { current_user } = usePage().props
  const [opened, { open, close }] = useDisclosure(false)

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Text fw={700} size="lg">路书</Text>
          </Link>

          <Group>
            {current_user ? (
              <>
                <Menu shadow="md" width={200}>
                  <Menu.Target>
                    <Avatar src={current_user.avatar_url} radius="xl" size="sm" style={{ cursor: 'pointer' }} />
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>{current_user.name}</Menu.Label>
                    {current_user.email && (
                      <Menu.Label c="dimmed" fz="xs" style={{ fontWeight: 'normal' }}>{current_user.email}</Menu.Label>
                    )}
                    <Menu.Divider />
                    <Menu.Item onClick={open}>个人设置</Menu.Item>
                    <Menu.Item component={Link} href="/logout" method="delete" as="button">
                      退出
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                <ProfileSettingsModal opened={opened} onClose={close} />
              </>
            ) : (
              <Button component={Link} href="/login" variant="light" size="sm">
                登录
              </Button>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  )
}
```

Note: kept icon-less to match the rest of the codebase (no icon library is currently in use).

- [ ] **Step 2: Run Vitest one more time**

Run: `npm test`
Expected: all PASS (no Vitest regression from the layout change).

- [ ] **Step 3: Commit**

```sh
git add app/javascript/layouts/AppLayout.jsx
git commit -m "feat(layout): wire ProfileSettingsModal into header avatar menu"
```

---

## Task 13: Browser smoke test

**Files:** none (manual).

This task verifies the feature end-to-end in the browser.

- [ ] **Step 1: Bring up the worktree dev server**

Run: `bin/worktree-dev up`
Expected: server starts on an isolated port (≥3100/9100). Note the URL printed.

- [ ] **Step 2: Log in via email-code**

Go to `/login`, request a code, verify. Confirm a user exists with a clean name.

- [ ] **Step 3: Open the "个人设置" modal**

Click the avatar in the top-right → click "个人设置". The modal should open with the current nickname and a placeholder file input.

- [ ] **Step 4: Try an invalid nickname**

Type `bad name` (with a space). The inline error `"只能包含字母、数字或中文"` should appear and the **保存** button should be disabled.

- [ ] **Step 5: Save a valid nickname**

Change the nickname to `"路书"`, click **保存**. Modal closes; top-bar menu label becomes `路书`.

- [ ] **Step 6: Upload an avatar**

Re-open the modal. Choose a PNG under 5 MB. Preview (72px circle) updates immediately. Click **保存**. Top-bar avatar becomes the uploaded image after modal closes.

- [ ] **Step 7: Verify "使用默认头像" appears and works**

Re-open the modal. `"使用默认头像"` text link should now be visible (`has_custom_avatar=true`). Click it. Top-bar avatar falls back to initials (email-code user with no `avatar_url`).

- [ ] **Step 8: Reject oversized upload**

Re-open modal. Choose a PNG > 5 MB (`dd if=/dev/urandom of=/tmp/big.png bs=1M count=6` for a dummy). Click **保存**. Expect the avatar field to show `不能超过 5MB` error; user's avatar unchanged.

- [ ] **Step 9: Shut the dev server down**

Run: `bin/worktree-dev down`

---

## Task 14: Run full local CI checks

**Files:** none.

CLAUDE.md commits the team to running these before claiming done.

- [ ] **Step 1: RSpec**

Run: `mise exec -- bundle exec rspec`
Expected: all PASS.

- [ ] **Step 2: Vitest**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 3: RuboCop**

Run: `bin/rubocop -f github`
Expected: `no offenses detected`. If offenses arise in new files, fix in place and amend the last related commit (or make a new cleanup commit).

- [ ] **Step 4: Brakeman**

Run: `bin/brakeman --no-pager`
Expected: `No warnings found`. Pay attention to any warning about mass assignment (`params.permit(:avatar)`) — the strong params whitelist is explicit so this should be clean.

- [ ] **Step 5: npm audit**

Run: `npm audit`
Expected: same baseline as before this branch. No new dependencies are introduced by this plan, so the advisory count should be unchanged.

- [ ] **Step 6: Final git state check**

Run: `git status && git log --oneline main..HEAD`
Expected: clean working tree; commits from Tasks 1–12 visible.

---

## Notes for the implementer

- **Commit discipline:** each task ends in one commit; do not batch across tasks.
- **Order matters for Task 4 vs Task 3:** never add the name format validation before the factory default is clean, or every factory-dependent spec will explode.
- **Task 6 (sanitize_name) and Task 7 (backfill) are both required for Task 4's validation to be production-safe.** They must land before any deploy that includes the strict validation; within this plan the order is: 4 (validation) → 5 (avatar validation) → 6 (sanitize on create) → 7 (backfill). The backfill is last because running it with strict validation already enforced is harmless (`update_columns` bypasses validation).
- **Do not touch `config/storage.yml`.** The R2 checksum flags are load-bearing (see CLAUDE.md).
- **Do not add features outside this plan.** Things like cropping, drag-and-drop upload, rate limits, image moderation are explicitly out of scope per the design spec.
