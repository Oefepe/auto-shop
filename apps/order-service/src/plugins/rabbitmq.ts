import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import amqp, { Channel, Connection } from 'amqplib'

declare module 'fastify' {
  interface FastifyInstance {
    rabbitmq: {
      channel: Channel
      publish: (routingKey: string, payload: unknown) => boolean
    }
  }
}

const EXCHANGE = 'auto-shop'

const rabbitmqPlugin: FastifyPluginAsync = async (fastify) => {
  const url = process.env.RABBITMQ_URL ?? 'amqp://localhost'

  let connection: any
  let channel!: Channel

  // Retry connection up to 10 times (RabbitMQ may start slow)
  for (let i = 1; i <= 10; i++) {
    try {
      connection = await amqp.connect(url)
      channel = await connection.createChannel()
      await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
      fastify.log.info('Connected to RabbitMQ')
      break
    } catch (err) {
      if (i === 10) throw err
      fastify.log.warn(`RabbitMQ not ready, retrying (${i}/10)...`)
      await new Promise(r => setTimeout(r, 3000))
    }
  }

  fastify.decorate('rabbitmq', {
    channel,
    publish(routingKey: string, payload: unknown): boolean {
      return channel.publish(
        EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true }
      )
    },
  })

  fastify.addHook('onClose', async () => {
    await channel.close()
    await connection.close()
  })
}

export default fp(rabbitmqPlugin, { name: 'rabbitmq' })
