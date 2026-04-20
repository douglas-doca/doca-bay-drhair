FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY keys/ ./keys/

EXPOSE 3202

CMD ["node", "src/server.js"]
