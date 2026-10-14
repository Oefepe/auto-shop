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
import mlRoutes, { startStockConsumer } from './routes/ml.routes.js'
import { TokenModel } from './models/token.model.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(fjwt, { secret: process.env.JWT_SECRET ?? 'jwt-secret' })

fastify.decorate('authenticate', async function (request: any, reply: any) {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

await fastify.register(dbPlugin)
await fastify.register(rabbitmqPlugin)
await fastify.register(mlRoutes, { prefix: '/ml' })

// Auto-start stock consumer if any account is already connected
const hasStoredToken = !!(await TokenModel.findOne({ provider: 'mercado_livre' }))

if (hasStoredToken) {
  await startStockConsumer(fastify, '')
  fastify.log.info('ML stock consumer auto-started')
} else {
  fastify.log.warn('No Mercado Livre accounts connected yet. Connect via /ml/auth.')
}

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'ml-service',
  ml_authorized: hasStoredToken,
}))

const port = Number(process.env.PORT ?? 3006)
await fastify.listen({ port, host: '0.0.0.0' })
