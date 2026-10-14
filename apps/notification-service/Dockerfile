FROM node:20-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/notification-service/package.json ./apps/notification-service/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/notification-service ./apps/notification-service
RUN pnpm --filter @auto-shop/shared build && pnpm --filter @auto-shop/notification-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
WORKDIR /app/apps/notification-service
COPY --from=build /app/apps/notification-service/dist ./dist
EXPOSE 3008
CMD ["node", "dist/index.js"]
