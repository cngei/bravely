# One image for both jobs: the default command serves the app, and the same image runs the
# migrations before a rollout (`npm run db:migrate`, e.g. as an initContainer or a Job).
# No value is baked in: DATABASE_URL, APP_URL, SESSION_SECRET, KEYCLOAK_* and BACKEND_URL all
# come from the environment at runtime.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN npm run build

# Runtime dependencies only. tsx is one of them: the migration runner is TypeScript.
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY package.json next.config.ts ./
COPY public ./public
COPY lib ./lib
COPY scripts ./scripts
COPY migrations ./migrations
USER node
EXPOSE 3000
# All interfaces inside the container, so the cluster Service can reach the pod. Exposure is
# decided by the Service and Ingress, not here: the pod port must never be published directly.
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
