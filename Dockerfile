FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN npm run build

USER node

EXPOSE 4321

CMD ["node", "./server.mjs"]
