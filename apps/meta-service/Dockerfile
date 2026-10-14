FROM node:20-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/meta-service/package.json ./apps/meta-service/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/meta-service ./apps/meta-service
RUN pnpm --filter @auto-shop/shared build && pnpm --filter @auto-shop/meta-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
WORKDIR /app/apps/meta-service
COPY --from=build /app/apps/meta-service/dist ./dist
EXPOSE 3007
CMD ["node", "dist/index.js"]
