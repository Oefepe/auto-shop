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
import reportsRoutes from './routes/reports.routes.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(fjwt, { secret: process.env.JWT_SECRET ?? 'jwt-secret' })

fastify.decorate('authenticate', async function (request: any, reply: any) {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

await fastify.register(dbPlugin)
await fastify.register(reportsRoutes, { prefix: '/reports' })

fastify.get('/health', async () => ({ status: 'ok', service: 'reporting-service' }))

const port = Number(process.env.PORT ?? 3009)
await fastify.listen({ port, host: '0.0.0.0' })
