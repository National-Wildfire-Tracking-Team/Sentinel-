FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY atcf.mjs registry.mjs guidance.mjs service.mjs index.mjs ./

CMD ["node", "index.mjs"]
