FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies for native builds (bcrypt)
RUN apk add --no-cache python3 make g++ openssl

FROM base AS deps
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm install --omit=optional --ignore-scripts

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN cd shared && npx tsc -b
RUN cd server && npx prisma generate
RUN cd server && npx tsc -b

FROM node:20-alpine AS runtime
WORKDIR /app
# openssl: prisma client. python3+ffmpeg+yt-dlp: media resolver (server/src/media/YtDlpResolver.ts)
RUN apk add --no-cache openssl python3 py3-pip ffmpeg \
 && pip3 install --no-cache-dir --break-system-packages yt-dlp
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/prisma ./server/prisma
WORKDIR /app/server
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
