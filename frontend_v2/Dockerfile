# ---- Development Stage ----
FROM node:22-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm","start"]

# ---- Production Build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ---- Runtime using Caddy ----
FROM caddy:2-alpine AS production

# Static assets
COPY --from=build /app/build /srv

# Caddy config
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
CMD ["caddy","run","--config","/etc/caddy/Caddyfile","--adapter","caddyfile"]
