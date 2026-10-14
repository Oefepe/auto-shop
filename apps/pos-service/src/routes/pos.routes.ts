import { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'crypto'
import { OfflineQueue } from '../queue/offline.queue.js'

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? 'http://localhost:3004'
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:3002'
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:3003'
const SQLITE_PATH = process.env.SQLITE_PATH ?? './data/offline-queue.db'

const queue = new OfflineQueue(SQLITE_PATH)

async function forwardToOrderService(payload: unknown, token: string): Promise<unknown> {
  const res = await fetch(`${ORDER_SERVICE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Order service returned ${res.status}`)
  return res.json()
}

const posRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }

  // POST /pos/sale — register an in-person sale
  // If order service is unreachable, queues locally for later retry
  fastify.post<{
    Body: {
      idempotency_key?: string
      cashier_id?: string
      customer?: { name?: string }
      items: Array<{ sku: string; name: string; qty: number; unit_price: number }>
      currency?: string
    }
  }>('/sale', auth, async (request, reply) => {
    const { idempotency_key, cashier_id, customer, items, currency = 'BRL' } = request.body
    const ikey = idempotency_key ?? randomUUID()

    const orderPayload = {
      source: 'pos' as const,
      idempotency_key: ikey,
      customer: { ...customer, cashier_id },
      items,
      currency,
    }

    // Extract token for forwarding
    const token = request.headers.authorization?.replace('Bearer ', '') ?? ''

    try {
      const result = await forwardToOrderService(orderPayload, token)
      return reply.status(201).send({ success: true, data: result, queued: false })
    } catch (err: any) {
      // Order service unreachable — queue locally
      fastify.log.warn({ err: err.message }, 'Order service unavailable — queuing sale offline')
      const qid = queue.enqueue(ikey, orderPayload)
      return reply.status(202).send({
        success: true,
        queued: true,
        queue_id: qid,
        idempotency_key: ikey,
        message: 'Sale queued offline. Will be synced when connectivity is restored.',
      })
    }
  })

  // GET /pos/queue — inspect offline queue
  fastify.get('/queue', auth, async (_request, reply) => {
    return reply.send({
      success: true,
      data: { size: queue.size(), pending: queue.peek(20) },
    })
  })

  // POST /pos/queue/flush — manually trigger a flush
  fastify.post('/queue/flush', auth, async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '') ?? ''
    const pending = queue.peek(50)
    const results = { flushed: 0, failed: 0 }

    for (const entry of pending) {
      try {
        await forwardToOrderService(JSON.parse(entry.payload), token)
        queue.markSuccess(entry.id)
        results.flushed++
      } catch (err: any) {
        queue.markFailed(entry.id, err.message)
        results.failed++
      }
    }

    return reply.send({ success: true, data: results })
  })

  // GET /pos/products — product list with current stock (for POS terminal display)
  fastify.get('/products', auth, async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '') ?? ''
    const headers = { Authorization: `Bearer ${token}` }

    const [prodRes, stockRes] = await Promise.all([
      fetch(`${PRODUCT_SERVICE_URL}/products?limit=200&active=true`, { headers }).then(r => r.json()) as any,
      fetch(`${INVENTORY_SERVICE_URL}/stock?limit=200`, { headers }).then(r => r.json()) as any,
    ])

    const stockMap = new Map<string, { available: number; quantity: number }>(
      ((stockRes.data?.items ?? []) as Array<{ sku: string; available: number; quantity: number }>)
        .map(s => [s.sku, { available: s.available, quantity: s.quantity }])
    )

    const enriched = ((prodRes.data?.items ?? []) as Array<{ sku: string; [k: string]: unknown }>).map(p => ({
      ...p,
      stock: stockMap.get(p.sku) ?? { available: 0, quantity: 0 },
    }))

    return reply.send({ success: true, data: enriched })
  })
}

export default posRoutes
