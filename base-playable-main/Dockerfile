# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Moi bien build-time deu truyen tu .env / docker-compose -> khong hardcode.
ARG VITE_GAME_NAME=Playable
ARG VITE_SAVE_KEY=playable_save_v1
ARG VITE_SAVE_VERSION=1
ARG VITE_REWARD_EXTRA_TIME=extra_time
ENV VITE_GAME_NAME=$VITE_GAME_NAME \
    VITE_SAVE_KEY=$VITE_SAVE_KEY \
    VITE_SAVE_VERSION=$VITE_SAVE_VERSION \
    VITE_REWARD_EXTRA_TIME=$VITE_REWARD_EXTRA_TIME

COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build && npm run check

# ---- serve stage ----
FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ARG CONTAINER_PORT=80
ENV CONTAINER_PORT=$CONTAINER_PORT
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${CONTAINER_PORT}/healthz" || exit 1
CMD ["nginx", "-g", "daemon off;"]
