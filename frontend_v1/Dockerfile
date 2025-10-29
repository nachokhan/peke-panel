# ---- Development Stage ----
FROM node:22-alpine AS development

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]

# ---- Production Stage ----
# ---- Stage 1: build React app ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build


# ---- Stage 2: run Caddy to serve static + proxy /api ----
FROM caddy:2-alpine AS production

# Copiar build estático generado por React
COPY --from=build /app/build /srv

# Copiar la config de Caddy desde el repo al contenedor
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
