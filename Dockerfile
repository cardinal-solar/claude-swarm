FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
