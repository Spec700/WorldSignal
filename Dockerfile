FROM node:24.19.0-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder

COPY . .
RUN npm run build

FROM dependencies AS verification

COPY . .
RUN npm run format:check
RUN npm run lint
RUN npm test
RUN npm run build
RUN npm run typecheck

FROM base AS tooling

ENV NODE_ENV=development

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

CMD ["npm", "run", "docker:bootstrap"]

FROM base AS runner

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
