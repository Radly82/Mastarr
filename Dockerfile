FROM node:24.20.0-alpine3.24@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS runtime
FROM alpine:3.24.2@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

LABEL org.opencontainers.image.title="Mastarr" \
      org.opencontainers.image.description="Your private movie and series control room" \
      org.opencontainers.image.source="https://github.com/Radly82/Mastarr" \
      org.opencontainers.image.version="2.0.11"

RUN apk upgrade --no-cache && apk add --no-cache libstdc++ ca-certificates su-exec \
    && addgroup -g 1000 node && adduser -D -H -u 1000 -G node node \
    && mkdir -p /config && chmod 700 /config
COPY --from=runtime /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production CONFIG_DIR=/config PORT=8686 HOST=0.0.0.0 PUID=99 PGID=100
WORKDIR /app
COPY --chown=node:node server.js package.json ./
COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node web/ ./web/
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
VOLUME ["/config"]
EXPOSE 8686
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8686/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
