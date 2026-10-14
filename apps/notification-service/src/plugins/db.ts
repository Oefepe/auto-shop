import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import mongoose from 'mongoose'

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  await mongoose.connect(uri)
  fastify.log.info('Connected to MongoDB (notifications_db)')
  fastify.addHook('onClose', async () => { await mongoose.disconnect() })
}

export default fp(dbPlugin, { name: 'db' })
