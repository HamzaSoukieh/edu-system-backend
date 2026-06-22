FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src

RUN mkdir -p /app/uploads /app/storage \
    && chown -R node:node /app/uploads /app/storage

USER node

EXPOSE 5000

CMD ["npm", "start"]
