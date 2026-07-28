FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
# Опциональные зависимости не пропускаем: платформенный бинарник rollup
# (@rollup/rollup-linux-x64-musl) объявлен именно опциональным, и без него
# vite build падает. Раньше это не проявлялось только потому, что слой
# node_modules приходил из кэша сборки.
RUN npm install --ignore-scripts

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY shared ./shared
COPY client ./client
RUN cd shared && npx tsc -b
# Явно ограничиваем кучу V8: на VPS с 1 ГБ памяти Node выбирает меньший
# лимит по умолчанию, и vite build падает по OOM посреди бандла.
RUN cd client && npx tsc -b && NODE_OPTIONS=--max-old-space-size=1536 npx vite build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
