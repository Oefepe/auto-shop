FROM node:20-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/ml-service/package.json ./apps/ml-service/
RUN pnpm install --no-frozen-lockfile
COPY packages/shared ./packages/shared
COPY apps/ml-service ./apps/ml-service
RUN pnpm --filter @auto-shop/shared build && pnpm --filter @auto-shop/ml-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
WORKDIR /app/apps/ml-service
COPY --from=build /app/apps/ml-service/dist ./dist
EXPOSE 3006
CMD ["node", "dist/index.js"]
