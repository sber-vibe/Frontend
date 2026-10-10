FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* встраиваются в бандл на этапе сборки
ARG NEXT_PUBLIC_AUTO_CLASSIFY=false
ARG NEXT_PUBLIC_CONFIDENCE_THRESHOLD=0.8
ARG NEXT_PUBLIC_OIDC_ISSUER=
ARG NEXT_PUBLIC_OIDC_CLIENT_ID=
ARG NEXT_PUBLIC_DEMO_LOGIN=false
ARG NEXT_PUBLIC_MAX_FILE_MB=100
ENV NEXT_PUBLIC_AUTO_CLASSIFY=$NEXT_PUBLIC_AUTO_CLASSIFY \
    NEXT_PUBLIC_CONFIDENCE_THRESHOLD=$NEXT_PUBLIC_CONFIDENCE_THRESHOLD \
    NEXT_PUBLIC_OIDC_ISSUER=$NEXT_PUBLIC_OIDC_ISSUER \
    NEXT_PUBLIC_OIDC_CLIENT_ID=$NEXT_PUBLIC_OIDC_CLIENT_ID \
    NEXT_PUBLIC_DEMO_LOGIN=$NEXT_PUBLIC_DEMO_LOGIN \
    NEXT_PUBLIC_MAX_FILE_MB=$NEXT_PUBLIC_MAX_FILE_MB
# адрес backend для rewrites фиксируется при сборке; в compose это имя сервиса
ARG BACKEND_URL=http://backend:8080
ENV BACKEND_URL=$BACKEND_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
  CMD wget -qO- http://127.0.0.1:3000/login > /dev/null || exit 1
CMD ["node", "server.js"]
