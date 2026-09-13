FROM node:24.20.0-alpine3.24@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS runtime
FROM alpine:3.24.1@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

LABEL org.opencontainers.image.title="Mastarr" \
      org.opencontainers.image.description="Your private movie and series control room" \
      org.opencontainers.image.source="https://github.com/Radly82/Mastarr" \
      org.opencontainers.image.version="14.0.0"

RUN apk upgrade --no-cache && apk add --no-cache libstdc++ ca-certificates \
    && addgroup -g 1000 node && adduser -D -H -u 1000 -G node node \
    && mkdir -p /config && chown node:node /config && chmod 700 /config
COPY --from=runtime /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production CONFIG_DIR=/config PORT=8686 HOST=0.0.0.0
WORKDIR /app
COPY --chown=node:node server.js package.json ./
COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node web/ ./web/
USER node
VOLUME ["/config"]
EXPOSE 8686
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8686/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
