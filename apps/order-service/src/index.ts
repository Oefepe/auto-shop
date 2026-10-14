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
import orderRoutes from './routes/order.routes.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(fjwt, { secret: process.env.JWT_SECRET ?? 'jwt-secret' })

fastify.decorate('authenticate', async function (request: any, reply: any) {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

await fastify.register(dbPlugin)
await fastify.register(rabbitmqPlugin)
await fastify.register(orderRoutes, { prefix: '/orders' })

fastify.get('/health', async () => ({ status: 'ok', service: 'order-service' }))

const port = Number(process.env.PORT ?? 3004)
await fastify.listen({ port, host: '0.0.0.0' })
