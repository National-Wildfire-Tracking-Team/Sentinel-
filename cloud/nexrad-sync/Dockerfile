FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY sync.mjs nexradPayloadFormat.js ./

CMD ["node", "sync.mjs"]
