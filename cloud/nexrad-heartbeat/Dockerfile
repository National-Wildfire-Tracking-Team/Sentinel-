FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.mjs nexradPayloadFormat.js ./

# Cloud Run injects PORT at runtime; index.mjs reads process.env.PORT with
# an 8080 fallback for local `docker run` testing.
EXPOSE 8080
CMD ["node", "index.mjs"]
