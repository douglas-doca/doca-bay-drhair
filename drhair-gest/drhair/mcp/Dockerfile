FROM node:20-alpine

ENV TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY src/ ./src/
COPY tsconfig.json ./

# Copiar configs de clientes
COPY clientes/ ./clientes/

# Copiar chave GestIA
COPY keys/ ./keys/

# Compilar TypeScript
RUN npx tsc

RUN npm prune --omit=dev --legacy-peer-deps
RUN mkdir -p logs

EXPOSE 3103

CMD ["node", "dist/index.js"]