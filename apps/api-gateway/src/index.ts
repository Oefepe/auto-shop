import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'
import httpProxy from '@fastify/http-proxy'

const fastify = Fastify({ logger: true })

const AUTH_URL      = process.env.AUTH_SERVICE_URL      ?? 'http://localhost:3001'
const PRODUCT_URL   = process.env.PRODUCT_SERVICE_URL   ?? 'http://localhost:3002'
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:3003'
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? 'http://localhost:3004'
const POS_SERVICE_URL   = process.env.POS_SERVICE_URL   ?? 'http://localhost:3005'
const ML_SERVICE_URL    = process.env.ML_SERVICE_URL    ?? 'http://localhost:3006'
const META_SERVICE_URL  = process.env.META_SERVICE_URL  ?? 'http://localhost:3007'
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3008'
const REPORTING_SERVICE_URL    = process.env.REPORTING_SERVICE_URL    ?? 'http://localhost:3009'

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
})

// Proxy routes
await fastify.register(httpProxy, { upstream: AUTH_URL,      prefix: '/auth',     rewritePrefix: '/auth' })
await fastify.register(httpProxy, { upstream: PRODUCT_URL,   prefix: '/products', rewritePrefix: '/products' })
await fastify.register(httpProxy, { upstream: INVENTORY_URL, prefix: '/stock',    rewritePrefix: '/stock' })
await fastify.register(httpProxy, { upstream: ORDER_SERVICE_URL, prefix: '/orders', rewritePrefix: '/orders' })
await fastify.register(httpProxy, { upstream: POS_SERVICE_URL,   prefix: '/pos',    rewritePrefix: '/pos' })
await fastify.register(httpProxy, { upstream: ML_SERVICE_URL,    prefix: '/ml',     rewritePrefix: '/ml' })
await fastify.register(httpProxy, { upstream: META_SERVICE_URL,  prefix: '/meta',   rewritePrefix: '/meta' })
await fastify.register(httpProxy, { upstream: NOTIFICATION_SERVICE_URL, prefix: '/notifications', rewritePrefix: '/notifications' })
await fastify.register(httpProxy, { upstream: REPORTING_SERVICE_URL,    prefix: '/reports',       rewritePrefix: '/reports' })

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'api-gateway',
  upstreams: { auth: AUTH_URL, products: PRODUCT_URL, inventory: INVENTORY_URL, orders: ORDER_SERVICE_URL, pos: POS_SERVICE_URL, ml: ML_SERVICE_URL, meta: META_SERVICE_URL, notifications: NOTIFICATION_SERVICE_URL, reports: REPORTING_SERVICE_URL },
}))

const port = Number(process.env.PORT ?? 3000)
await fastify.listen({ port, host: '0.0.0.0' })
