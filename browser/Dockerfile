FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server.mjs asset-cache.mjs request-origin.mjs presence.mjs trusted-scripts.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node test ./test
RUN node --test test/*.test.mjs && mkdir -p /app/.cache && chown node:node /app/.cache
USER node
ENV HOST=0.0.0.0 PORT=4173
EXPOSE 4173
CMD ["node", "server.mjs"]
