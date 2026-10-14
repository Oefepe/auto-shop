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
import inventoryRoutes from './routes/inventory.routes.js'
import { startOrderConsumer } from './consumers/order.consumer.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(fjwt, { secret: process.env.JWT_SECRET ?? 'jwt-secret' })

fastify.decorate('authenticate', async function (request: any, reply: any) {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

await fastify.register(dbPlugin)
await fastify.register(rabbitmqPlugin)
await fastify.register(inventoryRoutes, { prefix: '/stock' })

// Start consuming order events
await startOrderConsumer(fastify)

fastify.get('/health', async () => ({ status: 'ok', service: 'inventory-service' }))

const port = Number(process.env.PORT ?? 3003)
await fastify.listen({ port, host: '0.0.0.0' })
