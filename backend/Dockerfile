FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
RUN apk add --no-cache python3 make g++
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM base AS runner
ENV NODE_ENV=production
ENV TS_NODE_BASEURL=dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY test ./test
COPY scripts ./scripts
USER node
EXPOSE 3000
CMD ["node", "-r", "tsconfig-paths/register", "dist/src/main.js"]
