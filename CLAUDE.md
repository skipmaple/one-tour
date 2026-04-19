# CLAUDE.md

Guidance for Claude Code working on this repo. Human-facing setup and command reference live in [README.md](README.md); this file only covers things you cannot learn by reading the code.

## Coding style

[STYLE.md](STYLE.md) is load-bearing and non-negotiable. When in doubt, match nearby existing code — not generic Rails conventions, which STYLE.md deliberately diverges from in several places (method ordering, conditional style, CRUD-over-custom-actions).

## Before claiming done

CI runs **only** `bin/rubocop`, `bin/brakeman`, and `npm audit` — no tests. If you did not run these locally, the change is unverified:

- `mise exec -- bundle exec rspec` — Ruby tests (RSpec)
- `npm test` — JS tests (Vitest)
- `bin/rubocop -f github` — Ruby lint (CI-matching format)
- `bin/brakeman --no-pager` — Ruby security scan
- `npm audit` — JS dependency audit

Failing to run tests locally and claiming "CI will catch it" is a lie — CI won't.

## When to stop and ask

Do not proceed without explicit user confirmation for:
- Any change to `.env.production` or `.kamal/secrets` (production credentials)
- `kamal deploy` or `kamal app exec` in production
- Destructive migrations (drop column, backfill on large tables, index drops)
- Changes to `config/storage.yml` R2/Cloudflare config
- Rewriting git history on shared branches

## Gotchas

Each entry below is "if you see X, consider Y" — match on the trigger, don't memorize as timeless fact.

- **`bundle exec` failing with bundler/Ruby version error** — On some local setups, shebang `/usr/bin/env ruby` resolves to macOS system Ruby 2.6, which cannot load this project's bundler. Work around with `mise exec -- bundle exec ...` or an explicit `BUNDLER_VERSION=...`. Applies to `rspec`, `rubocop`, `kamal` equally.
- **Starting a dev server in a secondary worktree** — `bin/dev` collides with the main worktree (fixed port 9000, shared DB, stale Vite modules). Use `bin/worktree-dev up` / `down` — it picks free ports (9100+/3100+), creates an isolated Postgres DB via `docker exec one-tour-postgres createdb`, symlinks `.env` + `config/master.key` from main, and writes `.env.development.local` so dotenv-rails layers `DATABASE_URL` + `PORT` + `VITE_RUBY_PORT` over defaults. It goes through `mise exec -- bundle exec rails/vite` to bypass the shebang-to-system-Ruby-2.6 trap. `KEEP_DB=1 bin/worktree-dev down` preserves the DB across restarts. Assumes Postgres is in the `one-tour-postgres` Docker container (not host-native) — revisit when team grows.
- **Tuning `ChatStreamJob` `max_tokens`** — On SiliconFlow this parameter is near-total context, not an output cap. Leave ~10k for input (current cap: 32_768, not 128K). Verify against the provider's current docs if the provider changes.
- **Editing `ChatStreamJob#replay_history`** — Kimi degrades into token loops ("DIN DIN DIN…") when prior degenerate output is replayed. The filter is load-bearing — don't remove it without re-testing long conversations.
- **`Message#tool_calls` / `#metadata`** — Both jsonb columns are provisioned but always `nil`/empty in current prod data. Don't read them as if populated; don't drop them either — they exist for forthcoming tool-calling support.
- **Production secrets** — `.env.production` is the real source and is git-ignored. `.kamal/secrets` only references it via shell — editing `.kamal/secrets` alone changes nothing deployed.
- **A `.superpowers/` directory appears** — Local tooling state, must stay out of git. `.gitignore` covers it; history has been filter-branched clean once — don't re-add.
- **`bin/rails db:migrate`** — Only migrates the primary DB. Cache/queue/cable live in separate DBs with their own migrations under `db/cache_migrate`, `db/queue_migrate`, `db/cable_migrate`.
- **Adding a network call from the frontend** — Use Inertia `router.*`. The one exception is `useChat.js` (streaming + DELETE-then-refetch don't fit Inertia) — don't add a second exception without a similarly strong reason.
- **Touching `config/storage.yml`** — Keep `request_checksum_calculation: when_required` and `response_checksum_validation: when_required`. R2 rejects aws-sdk-s3's default CRC32 checksum.
- **Reasoning about user identity** — OAuth logins and email-code logins resolve to the **same** `User` when the email matches. One user may have multiple `OauthIdentity` rows on one account.
- **改 expense / settlement 数学** — `paid_cents` 刻意排除各付各(各付各不进结算,否则产生幽灵应收);`my_spend_cents`(owed + 我付的各付各)才是预算卡用的"我实际承担"。四字段完整定义 + 为什么这么拆 在 `app/models/expense/summarize.rb` 类头注释,改之前读完。
- **写 Inertia mutation 控制器 action** — 必须 `inertia_request?` 分流:Inertia 走 `redirect_to + flash[:alert/:notice]`,fetch/specs 走 `render json:`。返 JSON 给 Inertia 会让前端弹 "invalid response" modal(曾有 4 个 mutation endpoint 踩过)。照抄 `ExpensesController#update` 或 `SettlementsController#create`,详细理由在 `ApplicationController#inertia_request?` 注释里。

## Where the sharp edges are

Don't trust a hardcoded list here — it will rot. Find the current sharp edge:

```sh
git log --since='3 months ago' --name-only --pretty=format: \
  | grep -v '^$' | sort | uniq -c | sort -rn | head -20
```

The top-churned files are where recent bugs are still warm. Before editing one of them, read its last ~10 commits and corresponding specs for failure modes not captured here.

## Architecture notes not obvious from code

**AI Travel Assistant cross-file flow** (the one part you cannot reconstruct by reading a single file):

- `ChatPanel.jsx` → `POST /guidebooks/:id/conversations/:cid/messages` → `ChatStreamJob` → RubyLLM (OpenAI-compatible endpoint) → ActionCable channel `chat_guidebook_<guidebook_id>_user_<user_id>` → `useChat.js`
- User-selectable modes: `auto` (apply to editor on success), `ask` (show apply button), `plan` (describe changes only)
- System prompt is built from `FrontmatterSchema.to_prompt_description` — schema edits propagate to the LLM automatically; don't hand-sync them
- One `Conversation` per (guidebook, user) via `find_or_create_by`; reset via `DELETE /guidebooks/:id/conversations/:cid`
- Exact event payload shapes live in `ChatChannel` / `ChatStreamJob` — read there, don't mirror here

**Model invariants** (enforced by DB-level uniques / enums — don't bypass in code):

- `Conversation` unique on (guidebook_id, user_id)
- `Message.role` enum: `user: 0, assistant: 1, system: 2`
- `OauthIdentity` unique on (provider, uid); one `User` may have many
- `GuidebookMembership.role` enum: `reader: 0, editor: 1`

Everything else (Inertia bridge, authorization predicates, dual frontmatter parsing, auto-save semantics) is documented in [README.md](README.md) and/or apparent from the code — don't duplicate it here.

**Error monitoring (Sentry SaaS)**:

- Org `skipmaple` @ [sentry.io](https://skipmaple.sentry.io). Two projects: `one-tour-rails` (backend, `sentry-rails`) and `one-tour-react` (browser, `@sentry/react`). Events tagged `environment=development|production`.
- Secrets live in `.env.production` (git-ignored): `SENTRY_DSN_BACKEND`, `SENTRY_DSN_FRONTEND`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_FRONTEND`. Dev uses `.env`. `.kamal/secrets` grep's these into BuildKit secret mounts (see [Dockerfile](Dockerfile)'s `assets:precompile` RUN step).
- **Debugging live issues**: Sentry MCP is registered at user scope (`https://mcp.sentry.dev/sse`, OAuth). Any Claude Code session can call `search_issues` / `get_issue_details` directly — don't ask the user to paste stacktraces by hand.
- PII filter is load-bearing: `send_default_pii: false` on both ends, browser `beforeSend` drops `request.data.content`, `ChatStreamJob` passes `extra: { conversation_id, tour_id, user_id }` — never the message body. Don't remove these without discussing.
- Source maps upload on Vite build via `@sentry/vite-plugin` (disabled locally when `SENTRY_AUTH_TOKEN` is unset).

## Testing patterns

- Request specs log in via the test-only route: `post "/login_test", params: { user_id: user.id }`. Conventional helper: `def login_as(user); post "/login_test", params: { user_id: user.id }; end`
- Factories under `spec/factories/`: `:user`, `:guidebook` (defaults `author: create(:user)`), `:guidebook_membership`, `:conversation`, `:message`, `:oauth_identity`
- WebMock is loaded globally (`spec/rails_helper.rb`); unstubbed external HTTP fails the test
- Ad-hoc prod inspection: `mise exec -- bundle exec kamal app exec --reuse "bin/rails runner '...'"`

## Deploy

Kamal + Docker. All host/image/domain details live in [config/deploy.yml](config/deploy.yml) — read that file rather than trusting a copy here. Production Active Storage service is `:cloudflare` (R2 via S3-compatible API).
