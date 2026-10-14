import { FastifyPluginAsync } from 'fastify'
import { createMetaApi, createMetaApiWithToken } from '../services/meta-api.service.js'
import { verifyWebhookSignature, verifyHubToken } from '../services/webhook.service.js'
import { MetaSyncLogModel } from '../models/sync-log.model.js'
import { startMetaStockConsumer } from '../consumers/stock.consumer.js'
import { exchangeCodeForToken, updateSelectedCatalog, disconnectMeta, getStoredAuth } from '../services/auth.service.js'
import { MetaAuthModel } from '../models/auth.model.js'

const ORDER_SERVICE = process.env.ORDER_SERVICE_URL ?? 'http://localhost:3004'
const JWT_SECRET    = process.env.JWT_SECRET ?? 'jwt-secret'

let stockConsumerStarted = false

/** Encode owner_id into OAuth state */
function encodeState(ownerId: string): string {
  return Buffer.from(JSON.stringify({ ownerId })).toString('base64url')
}

function decodeState(state: string): string | null {
  try {
    const { ownerId } = JSON.parse(Buffer.from(state, 'base64url').toString())
    return typeof ownerId === 'string' ? ownerId : null
  } catch {
    return null
  }
}

/** Verify a JWT and return its payload */
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

const metaRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }

  // ── Status ─────────────────────────────────────────────────────────────────

  fastify.get('/status', auth, async (request: any, reply) => {
    const ownerId = request.user.id
    const stored = await getStoredAuth(ownerId)
    if (!stored) {
      return reply.send({ success: true, data: { connected: false } })
    }
    try {
      const metaApi = createMetaApi(ownerId)
      const user = await metaApi.getMe()
      return reply.send({
        success: true,
        data: {
          connected:       true,
          user,
          catalog_id:      stored.catalog_id ?? null,
          catalog_ready:   !!stored.catalog_id,
          consumer_active: stockConsumerStarted,
        },
      })
    } catch (err: any) {
      return reply.send({ success: true, data: { connected: false, error: err.message } })
    }
  })

  // ── OAuth ──────────────────────────────────────────────────────────────────

  /**
   * GET /meta/auth?token=<jwt>
   * Initiates OAuth. Accepts the user's JWT via query param (browser redirect, no Auth header).
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

    const appId = process.env.META_APP_ID
    if (!appId) {
      return reply.status(400).send({ success: false, error: 'META_APP_ID is not configured' })
    }

    const redirectUri = process.env.META_REDIRECT_URI ?? 'http://localhost:3000/meta/auth/callback'
    const params = new URLSearchParams({
      client_id:     appId,
      redirect_uri:  redirectUri,
      scope:         'catalog_management',
      response_type: 'code',
      state:         encodeState(user.id),
    })
    return reply.redirect(`https://www.facebook.com/dialog/oauth?${params}`)
  })

  /**
   * GET /meta/auth/callback?code=...&state=...
   * Meta redirects here after authorization.
   */
  fastify.get<{ Querystring: { code?: string; error?: string; error_description?: string; state?: string } }>(
    '/auth/callback', async (request, reply) => {
      const { code, error, state } = request.query

      if (error || !code) {
        return reply.redirect(`http://localhost:4000/oauth/callback?provider=meta&status=error&error=${error ?? 'no_code'}`)
      }

      const ownerId = state ? decodeState(state) : null
      if (!ownerId) {
        return reply.redirect('http://localhost:4000/oauth/callback?provider=meta&status=error&error=invalid_state')
      }

      try {
        const redirectUri = process.env.META_REDIRECT_URI ?? 'http://localhost:3000/meta/auth/callback'
        await exchangeCodeForToken(code, redirectUri, ownerId)
        return reply.redirect('http://localhost:4000/oauth/callback?provider=meta&status=success')
      } catch (err: any) {
        fastify.log.error({ err: err.message }, 'Meta OAuth failed')
        return reply.redirect('http://localhost:4000/oauth/callback?provider=meta&status=error&error=auth_failed')
      }
    },
  )

  // GET /meta/me
  fastify.get('/me', auth, async (request: any, reply) => {
    const ownerId = request.user.id
    const stored = await getStoredAuth(ownerId)
    if (!stored) {
      return reply.send({ success: true, data: { connected: false } })
    }
    try {
      const metaApi = createMetaApi(ownerId)
      const user = await metaApi.getMe()
      return reply.send({
        success: true,
        data: {
          connected:    true,
          user,
          catalog_id:   stored.catalog_id ?? null,
          catalog_name: stored.catalog_name ?? null,
        },
      })
    } catch (err: any) {
      return reply.send({ success: true, data: { connected: false, error: err.message } })
    }
  })

  // GET /meta/catalogs
  fastify.get('/catalogs', auth, async (request: any, reply) => {
    try {
      const metaApi = createMetaApi(request.user.id)
      const catalogs = await metaApi.getAllCatalogs()
      return reply.send({ success: true, data: catalogs })
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message })
    }
  })

  // POST /meta/catalog/select
  fastify.post<{ Body: { catalog_id: string; catalog_name: string } }>(
    '/catalog/select', auth, async (request: any, reply) => {
      const { catalog_id, catalog_name } = request.body
      await updateSelectedCatalog(request.user.id, catalog_id, catalog_name)
      return reply.send({ success: true, message: `Catalog "${catalog_name}" selected` })
    },
  )

  // DELETE /meta/disconnect
  fastify.delete('/disconnect', auth, async (request: any, reply) => {
    await disconnectMeta(request.user.id)
    return reply.send({ success: true, message: 'Meta disconnected' })
  })

  // ── Webhooks ───────────────────────────────────────────────────────────────

  fastify.get<{
    Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string }
  }>('/notifications', async (request, reply) => {
    const mode        = request.query['hub.mode']
    const verifyToken = request.query['hub.verify_token']
    const challenge   = request.query['hub.challenge']

    if (mode === 'subscribe' && verifyToken && verifyHubToken(verifyToken)) {
      fastify.log.info('Meta webhook verified successfully')
      return reply.status(200).type('text/plain').send(challenge ?? 'ok')
    }

    fastify.log.warn({ mode, verifyToken }, 'Meta webhook verification failed')
    return reply.status(403).send({ success: false, error: 'Webhook verification failed' })
  })

  fastify.post('/notifications', { config: { rawBody: true } }, async (request: any, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string ?? ''
    const rawBody   = request.rawBody as Buffer ?? Buffer.from(JSON.stringify(request.body))

    if (!verifyWebhookSignature(rawBody, signature)) {
      fastify.log.warn('Meta webhook signature mismatch')
      return reply.status(401).send({ success: false, error: 'Invalid signature' })
    }

    reply.status(200).send({ success: true })

    setImmediate(async () => {
      try {
        const payload = request.body as {
          object?: string
          entry?: Array<{
            id: string
            changes?: Array<{ value: { order_id?: string; [k: string]: unknown }; field: string }>
          }>
        }

        if (payload.object !== 'commerce_order' && payload.object !== 'page') return

        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            if (change.field !== 'commerce_order') continue
            const orderId = change.value?.order_id as string | undefined
            if (!orderId) continue
            await processMetaOrder(orderId, fastify)
          }
        }
      } catch (err: any) {
        fastify.log.error({ err: err.message }, 'Failed to process Meta webhook')
      }
    })
  })

  // ── Catalog ────────────────────────────────────────────────────────────────

  fastify.get('/catalog', auth, async (request: any, reply) => {
    const ownerId = request.user.id
    try {
      const stored = await getStoredAuth(ownerId)
      if (!stored?.catalog_id) throw new Error('No catalog selected. Choose a catalog in Integrations.')
      const metaApi = createMetaApi(ownerId)
      const products = await metaApi.getCatalogProducts(stored.catalog_id)
      return reply.send({ success: true, data: products })
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message })
    }
  })

  fastify.post<{
    Params: { sku: string }
    Body: { available: number; retailer_id?: string }
  }>('/sync/:sku', auth, async (request: any, reply) => {
    const { sku } = request.params
    const { available, retailer_id } = request.body
    const rid = retailer_id ?? sku

    const ownerId = request.user.id
    const stored = await getStoredAuth(ownerId)
    if (!stored?.catalog_id) {
      return reply.status(400).send({ success: false, error: 'No catalog selected' })
    }

    try {
      const metaApi = createMetaApi(ownerId)
      await metaApi.batchUpdateStock(stored.catalog_id, [{ retailer_id: rid, quantity: available }])
      await MetaSyncLogModel.create({
        event_type: available === 0 ? 'listing_unavailable' : 'stock_push',
        sku,
        retailer_id: rid,
        payload: { available },
        status: 'success',
      })
      return reply.send({ success: true, message: `Meta catalog updated for ${sku} (qty: ${available})` })
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message })
    }
  })

  fastify.get('/sync-logs', auth, async (request: any, reply) => {
    const { page = 1, limit = 50, status, sku } = request.query as Record<string, string>
    const filter: Record<string, unknown> = {}
    if (status) filter.status = status
    if (sku) filter.sku = sku.toUpperCase()

    const skip = (Number(page) - 1) * Number(limit)
    const [items, total] = await Promise.all([
      MetaSyncLogModel.find(filter).skip(skip).limit(Number(limit)).sort({ created_at: -1 }),
      MetaSyncLogModel.countDocuments(filter),
    ])
    return reply.send({
      success: true,
      data: { items, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    })
  })

  fastify.decorate('startMetaConsumer', async (internalToken: string) => {
    if (!stockConsumerStarted) {
      await startMetaStockConsumer(fastify, internalToken)
      stockConsumerStarted = true
    }
  })
}

async function processMetaOrder(orderId: string, fastify: any) {
  // Find an owner that has this order's catalog connected — try any connected account
  // In a full implementation the webhook payload would include the page/catalog ID to scope this
  const auth = await MetaAuthModel.findOne({ catalog_id: { $exists: true } })
  if (!auth) {
    fastify.log.warn({ orderId }, 'Meta order: no connected account with a catalog found')
    return
  }

  try {
    const metaApi = createMetaApiWithToken(auth.access_token)
    const metaOrder = await metaApi.getOrder(orderId)

    const totalAmount = metaOrder.estimated_payment_details?.total_amount?.amount
      ? parseFloat(metaOrder.estimated_payment_details.total_amount.amount)
      : metaOrder.items.data.reduce(
          (sum, i) => sum + parseFloat(i.price_per_unit.amount) * i.quantity,
          0,
        )

    const currency = metaOrder.estimated_payment_details?.total_amount?.currency
      ?? metaOrder.items.data[0]?.price_per_unit?.currency
      ?? 'BRL'

    const orderPayload = {
      source:            'meta',
      external_order_id: metaOrder.id,
      idempotency_key:   `meta-${metaOrder.id}`,
      customer: {
        name:  metaOrder.buyer_details?.name,
        email: metaOrder.buyer_details?.email,
      },
      items: metaOrder.items.data.map(i => ({
        sku:        i.retailer_id,
        name:       i.name,
        qty:        i.quantity,
        unit_price: parseFloat(i.price_per_unit.amount),
      })),
      total: totalAmount,
      currency,
    }

    const token = await getInternalServiceToken()
    const res = await fetch(`${ORDER_SERVICE}/orders`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(orderPayload),
    })

    if (!res.ok) throw new Error(`Order service returned ${res.status}`)

    await MetaSyncLogModel.create({
      event_type: 'order_received',
      order_id:   `meta-${metaOrder.id}`,
      payload:    { meta_order_id: metaOrder.id },
      status:     'success',
    })

    fastify.log.info({ meta_order_id: metaOrder.id }, 'Meta order forwarded to order-service')
  } catch (err: any) {
    fastify.log.error({ err: err.message, orderId }, 'Failed to process Meta order')
    await MetaSyncLogModel.create({
      event_type: 'order_received',
      order_id:   `meta-${orderId}`,
      payload:    { meta_order_id: orderId },
      status:     'failed',
      error:      err.message,
    })
  }
}

async function getInternalServiceToken(): Promise<string> {
  const { createHmac } = await import('crypto')
  const payload = Buffer.from(JSON.stringify({ id: 'meta-service', role: 'service', iat: Math.floor(Date.now() / 1000) })).toString('base64url')
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const sig     = createHmac('sha256', process.env.JWT_SECRET ?? 'jwt-secret')
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${sig}`
}

export default metaRoutes
