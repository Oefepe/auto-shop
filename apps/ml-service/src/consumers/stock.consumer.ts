import { FastifyInstance } from 'fastify'
import { createMlApiWithToken } from '../services/ml-api.service.js'
import { TokenModel } from '../models/token.model.js'
import { SyncLogModel } from '../models/sync-log.model.js'

interface StockUpdatedEvent {
  sku: string
  quantity: number
  available: number
  source: string
  order_id?: string
}

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL ?? 'http://localhost:3002'

async function getMLItemId(sku: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${PRODUCT_SERVICE_URL}/products/${sku}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json() as { data: { marketplace_ids?: { mercado_livre?: string } } }
    return data.data?.marketplace_ids?.mercado_livre ?? null
  } catch {
    return null
  }
}

export async function startStockConsumer(fastify: FastifyInstance, internalToken: string) {
  await fastify.rabbitmq.consume(
    'ml.stock.updated',
    'stock.updated',
    async (msg) => {
      const event: StockUpdatedEvent = JSON.parse(msg.content.toString())

      if (event.source === 'mercado_livre') return

      const mlItemId = await getMLItemId(event.sku, internalToken)
      if (!mlItemId) {
        fastify.log.debug({ sku: event.sku }, 'No ML listing found for SKU — skipping')
        await SyncLogModel.create({ event_type: 'stock_push', sku: event.sku, payload: event, status: 'skipped', error: 'No ML listing ID mapped to this SKU' })
        return
      }

      // Push stock update to all connected ML accounts
      const connections = await TokenModel.find({ provider: 'mercado_livre' })
      for (const conn of connections) {
        const mlApi = createMlApiWithToken(conn.access_token)
        try {
          if (event.available === 0) {
            await mlApi.pauseListing(mlItemId)
            await SyncLogModel.create({ event_type: 'listing_paused', sku: event.sku, ml_item_id: mlItemId, order_id: event.order_id, payload: event, status: 'success' })
            fastify.log.info({ sku: event.sku, mlItemId, owner: conn.owner_id }, 'ML listing paused (stock = 0)')
          } else {
            await mlApi.updateStock(mlItemId, event.available)
            await SyncLogModel.create({ event_type: 'stock_push', sku: event.sku, ml_item_id: mlItemId, order_id: event.order_id, payload: event, status: 'success' })
            fastify.log.info({ sku: event.sku, mlItemId, qty: event.available, owner: conn.owner_id }, 'ML stock updated')
          }
        } catch (err: any) {
          fastify.log.error({ err: err.message, sku: event.sku, mlItemId, owner: conn.owner_id }, 'ML stock push failed')
          await SyncLogModel.create({ event_type: 'stock_push', sku: event.sku, ml_item_id: mlItemId, order_id: event.order_id, payload: event, status: 'failed', error: err.message })
        }
      }
    },
  )

  fastify.log.info('ML stock consumer started — listening on ml.stock.updated')
}
