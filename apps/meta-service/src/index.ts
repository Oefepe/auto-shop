import 'dotenv/config'
import Fastify from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>
  }
}
import fjwt from '@fastify/jwt'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import dbPlugin from './plugins/db.js'
import rabbitmqPlugin from './plugins/rabbitmq.js'
import metaRoutes from './routes/meta.routes.js'
import { startMetaStockConsumer } from './consumers/stock.consumer.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(fjwt, { secret: process.env.JWT_SECRET ?? 'jwt-secret' })

fastify.decorate('authenticate', async function (request: any, reply: any) {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

await fastify.register(dbPlugin)
await fastify.register(rabbitmqPlugin)
await fastify.register(metaRoutes, { prefix: '/meta' })

// Auto-start stock consumer if access token is configured
if (process.env.META_ACCESS_TOKEN) {
  await startMetaStockConsumer(fastify, '')
  fastify.log.info('Meta stock consumer auto-started')
} else {
  fastify.log.warn('META_ACCESS_TOKEN not set — stock consumer not started')
}

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'meta-service',
  meta_configured: !!process.env.META_ACCESS_TOKEN,
  catalog_configured: !!process.env.META_CATALOG_ID,
}))

const port = Number(process.env.PORT ?? 3007)
await fastify.listen({ port, host: '0.0.0.0' })
