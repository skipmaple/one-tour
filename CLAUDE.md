# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Rails 8 + React 19 travel guidebook app for creating and sharing interactive guides with maps. Users author guidebook content in markdown with YAML frontmatter; the app renders previews with interactive Leaflet maps.

## Commands

### Development
```bash
bin/dev                  # Start Rails + Vite dev servers (uses Procfile.dev with foreman)
bin/rails s              # Rails server only (port 3000)
bin/vite dev             # Vite dev server only
```

### Testing
```bash
bundle exec rspec                    # Run all Ruby specs
bundle exec rspec spec/models/       # Run model specs
bundle exec rspec spec/requests/     # Run request specs
bundle exec rspec spec/path_spec.rb  # Run single spec file
npm test                             # Run JS tests (vitest)
npm run test:watch                   # JS tests in watch mode
```

### Database
```bash
bin/rails db:create db:migrate db:seed
```

### Linting
```bash
bundle exec rubocop                  # Ruby linting (rubocop-rails-omakase)
```

## Architecture

### Backend-Frontend Integration
- **Inertia.js** bridges Rails controllers and React components — no separate API layer
- Controllers render Inertia responses with props; React components receive them directly
- Page components live in `app/javascript/pages/{Controller}/{Action}.jsx` matching Rails routes
- Navigation uses Inertia `<Link>` and `router.visit/post/put/delete` — not fetch/axios

### Frontend Stack
- **Mantine UI 9** for components, **Leaflet** for maps, **CodeMirror 6** for markdown editing
- Entry point: `app/javascript/entrypoints/inertia.jsx` — sets up Inertia, MantineProvider, AppLayout
- Page resolution via `import.meta.glob('../pages/**/*.jsx', { eager: true })`
- Custom hooks: `useFrontmatter` (parse YAML frontmatter client-side), `useAutoSave` (debounced PUT)

### Data Model
- `User` → has_many `Guidebook` (as author), has_many `OauthIdentity`
- `Guidebook` → has_many `GuidebookMembership` → `User` (viewers/editors)
- Guidebook content is markdown with YAML frontmatter; parsed by `FrontmatterParser` service (Ruby) and `useFrontmatter` hook (JS)
- `frontmatter_cache` JSONB column stores parsed frontmatter on save

### Authentication
- OmniAuth with multiple providers (GitHub, Google, WeChat, Feishu) + developer strategy in dev
- Session-based auth via `session[:user_id]`
- Authorization via model methods: `owned_by?`, `editable_by?`, `visible_to?`

### Routes Structure
- `resources :guidebooks` with nested `publication` (publish/unpublish) and `memberships`
- OAuth: `/auth/:provider/callback` → `sessions#create`
- New REST resources preferred over custom actions (see CRUD controllers in STYLE.md)

## Code Style (from STYLE.md)

- **Expanded conditionals** over guard clauses (except early returns at method start)
- **Method ordering**: class methods → initialize → public → private, ordered by invocation (top-down call chain)
- **Visibility modifiers**: no blank line after `private`, indent content under it
- **No `!` suffix** unless a non-bang counterpart exists
- **Vanilla Rails**: thin controllers calling rich model APIs directly; services/form objects are fine but not the default
- **CRUD controllers**: model endpoints as CRUD on resources; introduce new resources instead of custom actions
- **Async**: shallow job classes with `_later`/`_now` method naming convention
