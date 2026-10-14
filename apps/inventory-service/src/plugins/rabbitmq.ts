import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import amqp, { Channel, ConsumeMessage } from 'amqplib'

declare module 'fastify' {
  interface FastifyInstance {
    rabbitmq: {
      channel: Channel
      consume: (queue: string, routingKey: string, handler: (msg: ConsumeMessage) => Promise<void>) => Promise<void>
      publish: (routingKey: string, payload: unknown) => boolean
    }
  }
}

const EXCHANGE = 'auto-shop'

const rabbitmqPlugin: FastifyPluginAsync = async (fastify) => {
  const url = process.env.RABBITMQ_URL ?? 'amqp://localhost'

  let connection: any
  let channel!: Channel

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
      return channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), { persistent: true })
    },
    async consume(queue: string, routingKey: string, handler: (msg: ConsumeMessage) => Promise<void>) {
      await channel.assertQueue(queue, { durable: true })
      await channel.bindQueue(queue, EXCHANGE, routingKey)
      channel.prefetch(1)
      await channel.consume(queue, async (msg) => {
        if (!msg) return
        try {
          await handler(msg)
          channel.ack(msg)
        } catch (err) {
          fastify.log.error({ err }, 'Consumer error — nacking message')
          channel.nack(msg, false, false) // send to dead-letter or discard
        }
      })
    },
  })

  fastify.addHook('onClose', async () => {
    await channel.close()
    await connection.close()
  })
}

export default fp(rabbitmqPlugin, { name: 'rabbitmq' })
