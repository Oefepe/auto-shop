FROM node:20-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/reporting-service/package.json ./apps/reporting-service/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/reporting-service ./apps/reporting-service
RUN pnpm --filter @auto-shop/shared build && pnpm --filter @auto-shop/reporting-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
WORKDIR /app/apps/reporting-service
COPY --from=build /app/apps/reporting-service/dist ./dist
EXPOSE 3009
CMD ["node", "dist/index.js"]
