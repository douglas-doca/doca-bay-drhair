FROM node:20-slim

# Dependências do Puppeteer/Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Variáveis para Puppeteer usar Chromium do sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo

WORKDIR /app

# Copiar package.json primeiro (cache de layers)
COPY package*.json ./
RUN npm install --production

# Copiar código
COPY . .

# Criar diretórios
RUN mkdir -p /app/data/cache /app/data/reservas /app/screenshots

EXPOSE 3001

CMD ["node", "index.js"]
