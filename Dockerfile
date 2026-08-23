FROM node:18-alpine

# Инсталираме Chromium системно в контейнера
RUN apk add --no-cache chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

EXPOSE 3000
CMD ["npm", "start"]
