# Agent World server + console in one image.
#
#   docker build -t agent-world .
#   docker run -p 8787:8787 -v agent-world-data:/data agent-world
#
# Auth is always on in the container (it listens on 0.0.0.0). On first start the
# admin token is printed once in the logs: `docker logs <container>`.

# ---- build: compile the packages and pack them like npm would ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
# the console renders these markdown files as its built-in docs
COPY README.md LICENSE ./
COPY docs ./docs
COPY integrations ./integrations
RUN npm ci --no-audit --no-fund
RUN npm run build:packages

# ---- runtime: install only the published server tarballs ----
FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/gideonabe/agent-world" \
      org.opencontainers.image.description="Agent World server and console" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/release/ /tmp/pkg/
RUN echo '{"name":"agent-world-runtime","private":true,"type":"module"}' > package.json \
 && npm install --omit=dev --no-audit --no-fund \
      /tmp/pkg/agent-viz-protocol-*.tgz /tmp/pkg/agent-viz-core-*.tgz /tmp/pkg/agent-viz-server-*.tgz \
 && rm -rf /tmp/pkg ~/.npm \
 && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
ENTRYPOINT ["node", "node_modules/@agent-viz/server/cli.js"]
CMD ["--host", "0.0.0.0", "--port", "8787", "--auth", "--data", "/data"]
