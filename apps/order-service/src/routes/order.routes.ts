import { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'crypto'
import { OrderModel } from '../models/order.model.js'

const orderRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }

  // GET /orders
  fastify.get('/', auth, async (request: any, reply) => {
    const { page = 1, limit = 20, source, status } = request.query as Record<string, string>
    const filter: Record<string, unknown> = {}
    if (source) filter.source = source
    if (status) filter.status = status

    const skip = (Number(page) - 1) * Number(limit)
    const [items, total] = await Promise.all([
      OrderModel.find(filter).skip(skip).limit(Number(limit)).sort({ created_at: -1 }),
      OrderModel.countDocuments(filter),
    ])

    return reply.send({
      success: true,
      data: { items, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    })
  })

  // GET /orders/:id
  fastify.get<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    const order = await OrderModel.findOne({
      $or: [{ order_id: request.params.id }, { _id: request.params.id }],
    })
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
    return reply.send({ success: true, data: order })
  })

  // POST /orders  — create order and publish event
  fastify.post<{
    Body: {
      source: 'pos' | 'mercado_livre' | 'meta' | 'manual'
      external_order_id?: string
      idempotency_key?: string
      customer?: { name?: string; email?: string; document?: string }
      items: Array<{ sku: string; name: string; qty: number; unit_price: number }>
      currency?: string
    }
  }>('/', auth, async (request, reply) => {
    const { source, external_order_id, idempotency_key, customer, items, currency = 'BRL' } = request.body

    const ikey = idempotency_key ?? randomUUID()

    // Idempotency check
    const existing = await OrderModel.findOne({ idempotency_key: ikey })
    if (existing) {
      return reply.status(200).send({ success: true, data: existing, message: 'Duplicate — existing order returned' })
    }

    const total = items.reduce((sum, i) => sum + i.qty * i.unit_price, 0)
    const order_id = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const order = await OrderModel.create({
      order_id,
      source,
      external_order_id,
      idempotency_key: ikey,
      customer: customer ?? {},
      items,
      total,
      currency,
    })

    // Publish event
    fastify.rabbitmq.publish('order.created', {
      order_id: order.order_id,
      source: order.source,
      items: order.items,
      idempotency_key: ikey,
    })

    fastify.log.info({ order_id: order.order_id }, 'Order created — event published')

    return reply.status(201).send({ success: true, data: order })
  })

  // PATCH /orders/:id/status
  fastify.patch<{
    Params: { id: string }
    Body: { status: 'pending' | 'confirmed' | 'shipped' | 'cancelled' }
  }>('/:id/status', auth, async (request, reply) => {
    const order = await OrderModel.findOneAndUpdate(
      { $or: [{ order_id: request.params.id }, { _id: request.params.id }] },
      { $set: { status: request.body.status } },
      { new: true }
    )
    if (!order) return reply.status(404).send({ success: false, error: 'Order not found' })
    return reply.send({ success: true, data: order })
  })
}

export default orderRoutes
