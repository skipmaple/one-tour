# syntax=docker/dockerfile:1
# check=error=true

# This Dockerfile is designed for production, not development. Use with Kamal or build'n'run by hand:
# docker build -t one-tour .
# docker run -d -p 80:80 -e RAILS_MASTER_KEY=<value from config/master.key> --name one-tour one-tour

# For a containerized dev environment, see Dev Containers: https://guides.rubyonrails.org/getting_started_with_devcontainer.html

# Make sure RUBY_VERSION matches the Ruby version in .ruby-version
ARG RUBY_VERSION=3.4.8
ARG NODE_VERSION=22

# JavaScript dependencies stage — cached independently from Ruby gems
FROM node:${NODE_VERSION}-slim AS node_modules
WORKDIR /rails
# .npmrc 含 legacy-peer-deps=true(vite-plugin-pwa@1.2 peer 卡 vite@7,project
# 用 vite@8,实际兼容只是 strict 拒)。漏 COPY 它 → npm ci ERESOLVE → build 失败。
COPY .npmrc package.json package-lock.json ./
# Skip Playwright chromium download in production build (~150MB,e2e 仅本地用):
# @playwright/test 是 devDep,但 npm ci 默认装全部依赖。环境变量阻止
# postinstall 脚本下载浏览器二进制。详见 https://playwright.dev/docs/browsers#install-system-dependencies
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

# Rails app lives here
WORKDIR /rails

# Install base packages
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libjemalloc2 libvips postgresql-client && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Set production environment
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development"

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build gems
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Install application gems
COPY Gemfile Gemfile.lock ./
RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile --gemfile

# Copy application code
COPY . .

# Import Node.js binary and npm packages from node_modules stage.
# This comes after COPY . . so it is never overwritten by the build context.
COPY --from=node_modules /usr/local/bin/node /usr/local/bin/node
COPY --from=node_modules /rails/node_modules ./node_modules

# Precompile bootsnap code for faster boot times
RUN bundle exec bootsnap precompile app/ lib/

# Precompile assets; node_modules are not needed in the final image.
# Sentry secrets are mounted so Vite can (a) bake the frontend DSN into the
# bundle and (b) upload source maps via @sentry/vite-plugin.
RUN --mount=type=secret,id=VITE_SENTRY_DSN_FRONTEND,env=VITE_SENTRY_DSN_FRONTEND \
    --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=SENTRY_ORG,env=SENTRY_ORG \
    --mount=type=secret,id=SENTRY_PROJECT_FRONTEND,env=SENTRY_PROJECT_FRONTEND \
    SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile && \
    rm -rf node_modules




# Final stage for app image
FROM base

# Copy built artifacts: gems, application
COPY --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --from=build /rails /rails

# Run and own only the runtime files as a non-root user for security
RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp
USER 1000:1000

# Entrypoint prepares the database.
ENTRYPOINT ["/rails/bin/docker-entrypoint"]

# Start server via Thruster by default, this can be overwritten at runtime
EXPOSE 80
CMD ["./bin/thrust", "./bin/rails", "server"]
