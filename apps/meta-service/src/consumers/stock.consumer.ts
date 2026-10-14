import { FastifyInstance } from 'fastify'
import { createMetaApiWithToken } from '../services/meta-api.service.js'
import { MetaAuthModel } from '../models/auth.model.js'
import { MetaSyncLogModel } from '../models/sync-log.model.js'

interface StockUpdatedEvent {
  sku: string
  quantity: number
  available: number
  source: string
  order_id?: string
}

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:3002'

async function getMetaRetailerId(sku: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${PRODUCT_SERVICE_URL}/products/${sku}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json() as { data: { marketplace_ids?: { meta?: string } } }
    return data.data?.marketplace_ids?.meta ?? sku
  } catch {
    return sku
  }
}

export async function startMetaStockConsumer(fastify: FastifyInstance, internalToken: string) {
  await fastify.rabbitmq.consume(
    'meta.stock.updated',
    'stock.updated',
    async (msg) => {
      const event: StockUpdatedEvent = JSON.parse(msg.content.toString())

      if (event.source === 'meta') return

      const retailerId = await getMetaRetailerId(event.sku, internalToken)
      if (!retailerId) {
        fastify.log.debug({ sku: event.sku }, 'No Meta retailer_id found — skipping')
        await MetaSyncLogModel.create({ event_type: 'stock_push', sku: event.sku, payload: event, status: 'skipped', error: 'No retailer_id resolved for SKU' })
        return
      }

      // Push stock update to all connected Meta accounts that have a catalog selected
      const connections = await MetaAuthModel.find({ catalog_id: { $exists: true, $ne: null } })
      for (const conn of connections) {
        const metaApi = createMetaApiWithToken(conn.access_token)
        try {
          await metaApi.batchUpdateStock(conn.catalog_id!, [{ retailer_id: retailerId, quantity: event.available }])
          await MetaSyncLogModel.create({ event_type: event.available === 0 ? 'listing_unavailable' : 'stock_push', sku: event.sku, retailer_id: retailerId, order_id: event.order_id, payload: event, status: 'success' })
          fastify.log.info({ sku: event.sku, retailer_id: retailerId, qty: event.available, owner: conn.owner_id }, `Meta catalog updated`)
        } catch (err: any) {
          fastify.log.error({ err: err.message, sku: event.sku, owner: conn.owner_id }, 'Meta stock push failed')
          await MetaSyncLogModel.create({ event_type: 'stock_push', sku: event.sku, retailer_id: retailerId, order_id: event.order_id, payload: event, status: 'failed', error: err.message })
        }
      }
    },
  )

  fastify.log.info('Meta stock consumer started — listening on meta.stock.updated')
}
