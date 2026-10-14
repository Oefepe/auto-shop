import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import mongoose, { Connection } from 'mongoose'

declare module 'fastify' {
  interface FastifyInstance {
    db: {
      orders:    Connection
      inventory: Connection
      products:  Connection
    }
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const ordersUri    = process.env.ORDERS_DB_URI
  const inventoryUri = process.env.INVENTORY_DB_URI
  const productsUri  = process.env.PRODUCTS_DB_URI

  if (!ordersUri || !inventoryUri || !productsUri) {
    throw new Error('One or more DB URIs are not set (ORDERS_DB_URI, INVENTORY_DB_URI, PRODUCTS_DB_URI)')
  }

  const [orders, inventory, products] = await Promise.all([
    mongoose.createConnection(ordersUri).asPromise(),
    mongoose.createConnection(inventoryUri).asPromise(),
    mongoose.createConnection(productsUri).asPromise(),
  ])

  fastify.log.info('Connected to orders_db, inventory_db, products_db (read-only)')

  fastify.decorate('db', { orders, inventory, products })

  fastify.addHook('onClose', async () => {
    await Promise.all([orders.close(), inventory.close(), products.close()])
  })
}

export default fp(dbPlugin, { name: 'db' })
