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
COPY base-playable-main/public ./base-playable-main/public
COPY scripts ./scripts
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SITE_NAME
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_PRIMARY_COLOR
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_SITE_NAME=${NEXT_PUBLIC_SITE_NAME} \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_PRIMARY_COLOR=${NEXT_PUBLIC_PRIMARY_COLOR}
RUN npm run build:web

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/base-game-nextjs/.next/standalone ./
COPY --from=builder --chown=node:node /app/base-game-nextjs/.next/static ./base-game-nextjs/.next/static
COPY --from=builder --chown=node:node /app/base-game-nextjs/public ./base-game-nextjs/public
USER node
CMD ["node", "base-game-nextjs/server.js"]
