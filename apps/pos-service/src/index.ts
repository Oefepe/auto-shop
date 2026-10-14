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
import posRoutes from './routes/pos.routes.js'
import { OfflineQueue } from './queue/offline.queue.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(fjwt, { secret: process.env.JWT_SECRET ?? 'jwt-secret' })

fastify.decorate('authenticate', async function (request: any, reply: any) {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

await fastify.register(posRoutes, { prefix: '/pos' })

// Background flush — automatically retry queued sales every FLUSH_INTERVAL_MS
const FLUSH_INTERVAL = Number(process.env.FLUSH_INTERVAL_MS ?? 10_000)
const queue = new OfflineQueue(process.env.SQLITE_PATH ?? './data/offline-queue.db')

setInterval(async () => {
  const pending = queue.peek(20)
  if (pending.length === 0) return

  fastify.log.info(`Auto-flushing ${pending.length} queued sale(s)...`)
  // We need a valid token to forward — in production this would use a service-to-service token.
  // For now, log a warning if there are pending items (manual flush via /pos/queue/flush).
  fastify.log.warn('Queued sales detected. Use POST /pos/queue/flush with a valid token to sync.')
}, FLUSH_INTERVAL)

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'pos-service',
  queue_size: queue.size(),
}))

const port = Number(process.env.PORT ?? 3005)
await fastify.listen({ port, host: '0.0.0.0' })
