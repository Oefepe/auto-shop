FROM node:20-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api-gateway/package.json ./apps/api-gateway/
RUN pnpm install --no-frozen-lockfile
COPY apps/api-gateway ./apps/api-gateway
RUN pnpm --filter @auto-shop/api-gateway build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/apps/api-gateway
COPY --from=build /app/apps/api-gateway/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
