ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 CITY_BLOXX_STANDALONE=1
COPY package.json package-lock.json ./
COPY base-game-nextjs/package.json ./base-game-nextjs/package.json
COPY base-playable-main/package.json ./base-playable-main/package.json
COPY packages ./packages
RUN npm ci
COPY base-game-nextjs ./base-game-nextjs
COPY base-playable-main ./base-playable-main
COPY scripts ./scripts
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SITE_NAME
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_PRIMARY_COLOR
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_SITE_NAME=${NEXT_PUBLIC_SITE_NAME} \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_PRIMARY_COLOR=${NEXT_PUBLIC_PRIMARY_COLOR} \
    NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY} \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN} \
    NEXT_PUBLIC_FIREBASE_DATABASE_URL=${NEXT_PUBLIC_FIREBASE_DATABASE_URL} \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID} \
    NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}
RUN npm run build:web

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/base-game-nextjs/.next/standalone ./
COPY --from=builder --chown=node:node /app/base-game-nextjs/.next/static ./base-game-nextjs/.next/static
COPY --from=builder --chown=node:node /app/base-game-nextjs/public ./base-game-nextjs/public
USER node
CMD ["node", "base-game-nextjs/server.js"]
