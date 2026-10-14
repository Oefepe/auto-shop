import { FastifyInstance } from 'fastify'
import { StockLevelModel, StockMovementModel } from '../models/stock.model.js'

interface OrderCreatedEvent {
  order_id: string
  source: string
  idempotency_key: string
  items: Array<{ sku: string; name: string; qty: number; unit_price: number }>
}

export async function startOrderConsumer(fastify: FastifyInstance) {
  await fastify.rabbitmq.consume(
    'inventory.order.created',
    'order.created',
    async (msg) => {
      const event: OrderCreatedEvent = JSON.parse(msg.content.toString())
      fastify.log.info({ order_id: event.order_id }, 'Received order.created event')

      for (const item of event.items) {
        const sku = item.sku.toUpperCase()

        const stock = await StockLevelModel.findOne({ sku })
        if (!stock) {
          fastify.log.warn({ sku }, 'No stock entry found for SKU — skipping deduction')
          continue
        }

        const newQty = stock.quantity - item.qty
        if (newQty < 0) {
          fastify.log.warn({ sku, qty: item.qty, available: stock.available }, 'Insufficient stock — partial deduction to 0')
        }

        stock.quantity  = Math.max(0, newQty)
        stock.available = Math.max(0, stock.quantity - stock.reserved)
        await stock.save()

        await StockMovementModel.create({
          sku,
          delta: -item.qty,
          reason: 'sale',
          source: event.source,
          order_id: event.order_id,
        })

        // Publish stock.updated
        fastify.rabbitmq.publish('stock.updated', {
          sku,
          quantity: stock.quantity,
          available: stock.available,
          source: event.source,
          order_id: event.order_id,
        })

        // Publish stock.low if threshold breached
        if (stock.available <= stock.low_stock_threshold) {
          fastify.rabbitmq.publish('stock.low', {
            sku,
            available: stock.available,
            threshold: stock.low_stock_threshold,
          })
          fastify.log.warn({ sku, available: stock.available }, 'Low stock alert published')
        }
      }
    }
  )

  fastify.log.info('Order consumer started — listening on inventory.order.created')
}
