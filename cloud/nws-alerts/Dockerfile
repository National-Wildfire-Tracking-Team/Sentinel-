FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY alerts.mjs ./
COPY index.mjs ./

CMD ["node", "index.mjs"]
