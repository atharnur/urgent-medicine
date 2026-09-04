FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY database ./database
RUN mkdir -p /app/storage/private && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:4000/ready || exit 1
CMD ["sh","-c","node dist/config/migrate.js && node dist/server.js"]
