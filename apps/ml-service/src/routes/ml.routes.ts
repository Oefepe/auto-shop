import { FastifyPluginAsync } from 'fastify'
import { createMlApi, createMlApiWithToken } from '../services/ml-api.service.js'
import { exchangeCodeForTokens, getStoredToken, getOwnerByMlUserId } from '../services/token.service.js'
import { SyncLogModel } from '../models/sync-log.model.js'
import { TokenModel } from '../models/token.model.js'
import { startStockConsumer } from '../consumers/stock.consumer.js'

const ML_AUTH_BASE  = 'https://auth.mercadolibre.com'
const CLIENT_ID     = process.env.ML_CLIENT_ID  ?? ''
const REDIRECT_URI  = process.env.ML_REDIRECT_URI ?? 'http://localhost:3000/ml/auth/callback'
const ORDER_SERVICE = process.env.ORDER_SERVICE_URL ?? 'http://localhost:3004'
const JWT_SECRET    = process.env.JWT_SECRET ?? 'jwt-secret'

let stockConsumerStarted = false

/** Encode owner_id into OAuth state (base64 JSON) */
function encodeState(ownerId: string): string {
  return Buffer.from(JSON.stringify({ ownerId })).toString('base64url')
}

/** Decode state back to owner_id; returns null if malformed */
function decodeState(state: string): string | null {
  try {
    const { ownerId } = JSON.parse(Buffer.from(state, 'base64url').toString())
    return typeof ownerId === 'string' ? ownerId : null
  } catch {
    return null
  }
}

/** Verify a JWT and return its payload (for the OAuth initiation redirect) */
async function verifyJwt(token: string): Promise<{ id: string } | null> {
  try {
    const { createHmac } = await import('crypto')
    const [header, payload, sig] = token.split('.')
    const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url')
    if (sig !== expected) return null
    return JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return null
  }
}

const mlRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }

  // ── OAuth ──────────────────────────────────────────────────────────────────

  /**
   * GET /ml/auth?token=<jwt>
   * Initiates OAuth. Accepts the user's JWT via query param (since this is a browser redirect,
   * not an AJAX call, so the Authorization header is unavailable).
   */
  fastify.get<{ Querystring: { token?: string } }>('/auth', async (request, reply) => {
    const jwt = request.query.token
    if (!jwt) {
      return reply.status(400).send({ success: false, error: 'Missing token query param' })
    }

    const user = await verifyJwt(jwt)
    if (!user?.id) {
      return reply.status(401).send({ success: false, error: 'Invalid or expired token' })
    }

    if (!CLIENT_ID) {
      return reply.status(400).send({ success: false, error: 'ML_CLIENT_ID is not configured' })
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      state:         encodeState(user.id),
    })
    return reply.redirect(`${ML_AUTH_BASE}/authorization?${params}`)
  })

  /**
   * GET /ml/auth/callback?code=...&state=...
   * ML redirects here after the user authorizes. Decodes state to find the system owner.
   */
  fastify.get<{ Querystring: { code?: string; error?: string; state?: string } }>(
    '/auth/callback', async (request, reply) => {
      const { code, error, state } = request.query

      if (error || !code) {
        return reply.redirect(`http://localhost:4000/oauth/callback?provider=ml&status=error&error=${error ?? 'no_code'}`)
      }

      const ownerId = state ? decodeState(state) : null
      if (!ownerId) {
        return reply.redirect('http://localhost:4000/oauth/callback?provider=ml&status=error&error=invalid_state')
      }

      try {
        await exchangeCodeForTokens(code, REDIRECT_URI, ownerId)

        if (!stockConsumerStarted) {
          const internalToken = await getValidInternalToken()
          await startStockConsumer(fastify, internalToken)
          stockConsumerStarted = true
        }

        return reply.redirect('http://localhost:4000/oauth/callback?provider=ml&status=success')
      } catch (err: any) {
        fastify.log.error({ err: err.message }, 'ML OAuth failed')
        return reply.redirect('http://localhost:4000/oauth/callback?provider=ml&status=error&error=auth_failed')
      }
    },
  )

  // ── Status / Me ────────────────────────────────────────────────────────────

  fastify.get('/me', auth, async (request: any, reply) => {
    const ownerId = request.user.id
    const stored = await getStoredToken(ownerId)
    if (!stored) {
      return reply.send({ success: true, data: { connected: false } })
    }
    try {
      const mlApi = createMlApi(ownerId)
      const user = await mlApi.getMe()
      return reply.send({ success: true, data: { connected: true, user, ml_user_id: stored.ml_user_id } })
    } catch (err: any) {
      return reply.send({ success: true, data: { connected: false, error: err.message } })
    }
  })

  fastify.get('/status', auth, async (request: any, reply) => {
    const ownerId = request.user.id
    const token = await getStoredToken(ownerId)
    if (!token) {
      return reply.send({
        success: true,
        data: {
          connected: false,
          auth_url: `${ML_AUTH_BASE}/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
        },
      })
    }

    try {
      const mlApi = createMlApi(ownerId)
      const user = await mlApi.getMe()
      return reply.send({ success: true, data: { connected: true, ml_user_id: token.ml_user_id, expires_at: token.expires_at, user } })
    } catch (err: any) {
      return reply.send({ success: true, data: { connected: false, error: err.message } })
    }
  })

  // DELETE /ml/disconnect
  fastify.delete('/disconnect', auth, async (request: any, reply) => {
    await TokenModel.deleteOne({ provider: 'mercado_livre', owner_id: request.user.id })
    return reply.send({ success: true, message: 'Mercado Livre disconnected' })
  })

  // ── Webhooks ───────────────────────────────────────────────────────────────

  fastify.get('/notifications', async (_request, reply) => {
    return reply.status(200).send('OK')
  })

  fastify.post<{
    Body: { resource: string; user_id: number; topic: string; application_id?: number; attempts?: number }
  }>('/notifications', async (request, reply) => {
    const { resource, topic, user_id: mlUserId } = request.body
    fastify.log.info({ topic, resource }, 'ML notification received')

    if (topic !== 'orders_v2' && topic !== 'orders') {
      return reply.status(200).send({ success: true, message: `Topic ${topic} ignored` })
    }

    reply.status(200).send({ success: true })

    setImmediate(async () => {
      try {
        const orderId = resource.split('/').pop()
        if (!orderId) return

        // Resolve which account this notification belongs to by ML user_id
        const tokenRecord = await getOwnerByMlUserId(String(mlUserId))
        if (!tokenRecord) {
          fastify.log.warn({ mlUserId }, 'ML notification: no matching owner found')
          return
        }

        const mlApi = createMlApiWithToken(tokenRecord.access_token)
        const mlOrder = await mlApi.getOrder(orderId)

        const orderPayload = {
          source:            'mercado_livre',
          external_order_id: String(mlOrder.id),
          idempotency_key:   `ml-${mlOrder.id}`,
          customer: {
            name:  mlOrder.buyer?.nickname,
            email: mlOrder.buyer?.email,
          },
          items: mlOrder.order_items.map(oi => ({
            sku:        oi.item.seller_sku ?? oi.item.id,
            name:       oi.item.title,
            qty:        oi.quantity,
            unit_price: oi.unit_price,
          })),
          currency: mlOrder.currency_id,
        }

        const token = await getValidInternalToken()
        const res = await fetch(`${ORDER_SERVICE}/orders`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify(orderPayload),
        })

        if (!res.ok) throw new Error(`Order service returned ${res.status}`)

        await SyncLogModel.create({
          event_type: 'order_received',
          order_id:   `ml-${mlOrder.id}`,
          payload:    { ml_order_id: mlOrder.id, topic, resource },
          status:     'success',
        })

        fastify.log.info({ ml_order_id: mlOrder.id }, 'ML order forwarded to order-service')
      } catch (err: any) {
        fastify.log.error({ err: err.message }, 'Failed to process ML order notification')
        await SyncLogModel.create({
          event_type: 'order_received',
          payload:    { topic, resource },
          status:     'failed',
          error:      err.message,
        })
      }
    })
  })

  // ── Catalog ────────────────────────────────────────────────────────────────

  fastify.get('/catalog', auth, async (request: any, reply) => {
    try {
      const mlApi = createMlApi(request.user.id)
      const items = await mlApi.listSellerItems()
      return reply.send({ success: true, data: items })
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message })
    }
  })

  // ── Manual sync ────────────────────────────────────────────────────────────

  fastify.post<{ Params: { sku: string }; Body: { available: number; ml_item_id: string } }>(
    '/sync/:sku', auth, async (request: any, reply) => {
      const { sku } = request.params
      const { available, ml_item_id } = request.body

      try {
        const mlApi = createMlApi(request.user.id)
        if (available === 0) {
          await mlApi.pauseListing(ml_item_id)
        } else {
          await mlApi.updateStock(ml_item_id, available)
        }

        await SyncLogModel.create({
          event_type: available === 0 ? 'listing_paused' : 'stock_push',
          sku,
          ml_item_id,
          payload: { available },
          status: 'success',
        })

        return reply.send({ success: true, message: `Stock synced for ${sku} → ML ${ml_item_id}` })
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message })
      }
    },
  )

  fastify.get('/sync-logs', auth, async (request: any, reply) => {
    const { page = 1, limit = 50, status, sku } = request.query as Record<string, string>
    const filter: Record<string, unknown> = {}
    if (status) filter.status = status
    if (sku) filter.sku = sku.toUpperCase()

    const skip = (Number(page) - 1) * Number(limit)
    const [items, total] = await Promise.all([
      SyncLogModel.find(filter).skip(skip).limit(Number(limit)).sort({ created_at: -1 }),
      SyncLogModel.countDocuments(filter),
    ])

    return reply.send({
      success: true,
      data: { items, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    })
  })
}

async function getValidInternalToken(): Promise<string> {
  const { createHmac } = await import('crypto')
  const payload = Buffer.from(JSON.stringify({ id: 'ml-service', role: 'service', iat: Math.floor(Date.now() / 1000) })).toString('base64url')
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const sig     = createHmac('sha256', process.env.JWT_SECRET ?? 'jwt-secret').update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

export { startStockConsumer }
export default mlRoutes
