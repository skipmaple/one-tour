# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

OneTour is a collaborative travel guidebook application for creating, editing, publishing, and sharing interactive travel guides with maps. Authors write guidebook content in Markdown with YAML frontmatter that encodes structured trip data (routes, coordinates, daily itineraries, points of interest). The app renders this as an interactive map experience with Leaflet.

Built with Rails 8 + React 19, connected via Inertia.js (no separate API layer).

## Development Commands

### Setup and Server
```bash
bin/setup              # Install gems, npm deps, create/migrate DB
bin/dev                # Start Rails + Vite dev servers (foreman with Procfile.dev)
```

Development URL: http://localhost:3000
Login: Use the "Developer Login" button (OmniAuth developer strategy, dev only)

### Testing
```bash
bundle exec rspec                        # All Ruby specs
bundle exec rspec spec/models/           # Model specs only
bundle exec rspec spec/requests/         # Request specs only
bundle exec rspec spec/path/to_spec.rb   # Single file
npm test                                 # JS tests (vitest)
npm run test:watch                       # JS tests in watch mode
```

### Database
```bash
bin/rails db:create db:migrate
bin/rails db:seed         # Creates admin@example.com user; reads guidebook markdown from sibling ../tour-of-xinjiang repo
```

### Linting
```bash
bundle exec rubocop       # Ruby (rubocop-rails-omakase)
```

## Deploy

Kamal + Docker deployment. Config in `config/deploy.yml`.

- Image: `your-user/tour_of_xinjiang_app` (Docker Hub)
- Secrets: `RAILS_MASTER_KEY` (from `config/master.key`)
- Production runs Puma behind Thruster (HTTP accelerator), port 80
- SSL via Let's Encrypt through Kamal proxy
- Production uses separate PostgreSQL databases for primary, cache (SolidCache), queue (SolidQueue), and cable (SolidCable)

## Architecture Overview

### Inertia.js Bridge

There is no REST API. Rails controllers render Inertia responses with props, and React components receive them directly. This is the central architectural pattern:

```
Controller action → render_inertia("Page/Name", props: {...}) → React component receives props
```

- Page components live at `app/javascript/pages/{Controller}/{Action}.jsx` matching Rails routing conventions
- Page resolution: `import.meta.glob('../pages/**/*.jsx', { eager: true })` in `app/javascript/entrypoints/inertia.jsx`
- Navigation uses Inertia `<Link>` and `router.visit/post/put/delete` — never raw fetch or axios
- `preserveState: true` and `preserveScroll: true` on auto-save requests to maintain editor state

**Key insight**: When adding new pages, create the Rails controller action returning Inertia props AND the matching React page component. The Inertia middleware handles the JSON↔HTML negotiation automatically.

### Authentication (OmniAuth)

Passwordless OAuth authentication with multiple providers:
- GitHub, Google, WeChat, Feishu (production)
- Developer strategy (development only — form at GET `/auth/developer`)

Flow: `/auth/:provider/callback` → `SessionsController#create` → finds or creates `OauthIdentity` + `User` → sets `session[:user_id]`

A single User can have multiple OauthIdentity records (login with GitHub and Google → same account if email matches).

Test helper: `POST /login_test` with `user_id` param (test env only).

### Authorization Model

Authorization is enforced at the model level with three permission methods on `Guidebook`:

- `owned_by?(user)` — is this user the author?
- `editable_by?(user)` — owner OR has editor membership
- `visible_to?(user)` — published (anyone) OR owner/member (private)

Roles via `GuidebookMembership`: `reader` (0) and `editor` (1).

Controllers check these methods in before_actions and actions. The frontend receives `editable` and `owned` boolean props to conditionally render UI, but the backend is always the source of truth.

**Key insight**: Only the guidebook author can publish, unpublish, manage members, or delete. Editors can modify content but not control access.

### Content Model (Markdown + YAML Frontmatter)

Guidebook content is a single text field containing Markdown with YAML frontmatter. The frontmatter encodes structured trip data: title, dates, vehicle, route coordinates, day-by-day itineraries with schedules, meals, lodging, points of interest with tags and photos.

**Dual parsing** — the same content is parsed in two places:
- **Backend**: `FrontmatterParser` service (`app/services/frontmatter_parser.rb`) — validates on save, populates `frontmatter_cache` JSONB column, extracts title
- **Frontend**: `useFrontmatter` hook (`app/javascript/hooks/useFrontmatter.js`) — parses with `js-yaml` for real-time preview while editing

The `before_validation :update_frontmatter_cache` callback on `Guidebook` keeps the cache in sync: when `content` changes, it re-parses frontmatter, updates `frontmatter_cache`, and extracts the `title` field.

**Publishing requirements** (enforced by `FrontmatterParser#publishable?`):
1. Valid YAML frontmatter with no parse errors
2. `title` field present
3. ALL days must have a `coordinates` array (required for map rendering)

### Auto-Save

The `useAutoSave` hook (`app/javascript/hooks/useAutoSave.js`) implements debounced auto-saving:

1. User types in CodeMirror editor → `rawContent` state updates
2. After 5 seconds of inactivity, hook fires `router.put(/guidebooks/:id, { guidebook: { content } })`
3. Controller updates model → `before_validation` callback re-parses frontmatter cache
4. Response preserves editor state and scroll position
5. StatusBar component shows "Saving..." / "Saved at HH:MM:SS" / error

The hook also registers a `beforeunload` handler to warn about unsaved changes on page leave.

**Key insight**: No WebSocket or real-time collaboration — this is a simple HTTP PUT with debounce. Last-write-wins for concurrent editors.

### Core Domain Models

**User** — has_many `oauth_identities`, has_many `guidebooks` (as author), has_many `guidebook_memberships`

**Guidebook** — belongs_to `author` (User), has_many `guidebook_memberships`, has_many `members` (through memberships). Key fields: `content` (text), `frontmatter_cache` (jsonb), `published` (boolean). Key methods: `owned_by?`, `editable_by?`, `visible_to?`, `publishable?`, `parsed_content`

**GuidebookMembership** — join table with `role` enum (reader: 0, editor: 1). Unique on (guidebook_id, user_id)

**OauthIdentity** — belongs_to `user`. Stores provider, uid, credentials (jsonb). Unique on (provider, uid)

### Frontend Stack

- **React 19** with **Mantine UI 9** (component library + theming via Emotion)
- **Leaflet / react-leaflet** for interactive maps with routes, markers, popups
- **CodeMirror 6** for the markdown editor with YAML + markdown syntax highlighting
- **react-markdown** with remark-gfm and rehype-raw for preview rendering
- Entry point: `app/javascript/entrypoints/inertia.jsx` — configures Inertia, MantineProvider, AppLayout
- `AppLayout` wraps all pages except `Show.jsx` (full-screen map) and `Login.jsx` (centered form), which set their own `layout` property
- Active Storage for image uploads with thumb (600x360) and HD (1200x800) variants

### Routes Structure

```ruby
resources :guidebooks do
  resource :publication, only: [:create, :destroy]      # publish/unpublish
  resources :memberships, only: [:index, :create, :update, :destroy]  # sharing
end
```

OAuth: `/auth/:provider/callback` → `sessions#create`
Login: `GET /login` → `sessions#new`
Root: `guidebooks#index`

New REST resources preferred over custom actions (see CRUD controllers in STYLE.md).

## Tools

### Chrome MCP (Local Dev)

URL: http://localhost:3000
Login: Use "Developer Login" button on the login page (no credentials needed in development)

Use Chrome DevTools MCP tools to interact with the running dev app for UI testing and debugging.

## Coding style

@STYLE.md
