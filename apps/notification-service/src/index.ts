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
import notificationRoutes from './routes/notification.routes.js'
import { startStockAlertConsumer } from './consumers/stock-alert.consumer.js'
import { verifySmtpConnection } from './services/email.service.js'

const fastify = Fastify({ logger: true })

await fastify.register(cors, { origin: true })
await fastify.register(sensible)
await fastify.register(fjwt, { secret: process.env.JWT_SECRET ?? 'jwt-secret' })

fastify.decorate('authenticate', async function (request: any, reply: any) {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

await fastify.register(dbPlugin)
await fastify.register(rabbitmqPlugin)
await fastify.register(notificationRoutes, { prefix: '/notifications' })

await startStockAlertConsumer(fastify)

// Log SMTP status on startup (non-blocking)
verifySmtpConnection().then(ok => {
  if (ok) fastify.log.info('SMTP connection verified')
  else fastify.log.warn('SMTP connection failed — check SMTP_HOST/USER/PASS in .env')
})

fastify.get('/health', async () => ({
  status: 'ok',
  service: 'notification-service',
  smtp_configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
}))

const port = Number(process.env.PORT ?? 3008)
await fastify.listen({ port, host: '0.0.0.0' })
