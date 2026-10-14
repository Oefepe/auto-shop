import { FastifyInstance } from 'fastify'
import { NotificationModel } from '../models/notification.model.js'
import { NotificationConfigModel } from '../models/notification-config.model.js'
import { sendLowStockEmail } from '../services/email.service.js'

interface StockLowEvent {
  sku: string
  available: number
  threshold: number
}

const DEFAULT_COOLDOWN_HOURS = Number(process.env.COOLDOWN_HOURS ?? 4)
const DEFAULT_RECIPIENTS = (process.env.ALERT_RECIPIENTS ?? '')
  .split(',')
  .map(r => r.trim())
  .filter(Boolean)

async function getConfig(sku: string) {
  // Per-SKU config takes precedence over global config
  const perSku = await NotificationConfigModel.findOne({ sku: sku.toUpperCase() })
  if (perSku) return perSku
  const global = await NotificationConfigModel.findOne({ sku: null })
  return global
}

async function isOnCooldown(sku: string, cooldownHours: number): Promise<boolean> {
  const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000)
  const recent = await NotificationModel.findOne({
    sku: sku.toUpperCase(),
    created_at: { $gte: since },
  })
  return !!recent
}

export async function startStockAlertConsumer(fastify: FastifyInstance) {
  // Listen to stock.low events
  await fastify.rabbitmq.consume(
    'notifications.stock.low',
    'stock.low',
    async (msg) => {
      const event: StockLowEvent = JSON.parse(msg.content.toString())
      const sku = event.sku.toUpperCase()
      const type = event.available === 0 ? 'out_of_stock' : 'low_stock'

      fastify.log.info({ sku, available: event.available, type }, 'Stock alert event received')

      const config = await getConfig(sku)
      const cooldownHours = config?.cooldown_hours ?? DEFAULT_COOLDOWN_HOURS
      const emailEnabled  = config?.email_enabled  ?? true
      const inAppEnabled  = config?.in_app_enabled ?? true
      const recipients    = (config?.email_recipients?.length ?? 0) > 0
        ? config!.email_recipients
        : DEFAULT_RECIPIENTS

      // Rate-limit check
      const onCooldown = await isOnCooldown(sku, cooldownHours)
      if (onCooldown) {
        fastify.log.debug({ sku }, `Alert suppressed — within ${cooldownHours}h cooldown`)
        return
      }

      const channelsSent: Array<'email' | 'in_app'> = []

      // In-app notification (always stored regardless of cooldown since we already checked)
      if (inAppEnabled) {
        await NotificationModel.create({
          type,
          sku,
          available: event.available,
          threshold: event.threshold,
          channels_sent: [],
          email_recipients: recipients,
          read: false,
        })
        channelsSent.push('in_app')
      }

      // Email notification
      if (emailEnabled && recipients.length > 0) {
        try {
          await sendLowStockEmail({ sku, available: event.available, threshold: event.threshold, type, recipients })
          channelsSent.push('email')
          fastify.log.info({ sku, recipients }, 'Low-stock email sent')
        } catch (err: any) {
          fastify.log.error({ err: err.message, sku }, 'Failed to send low-stock email')
          // Don't rethrow — email failure shouldn't nack the message
        }
      }

      // Update the notification record with what was actually sent
      if (channelsSent.includes('email')) {
        await NotificationModel.findOneAndUpdate(
          { sku, read: false, created_at: { $gte: new Date(Date.now() - 5000) } },
          { $set: { channels_sent: channelsSent } },
          { sort: { created_at: -1 } }
        )
      }

      fastify.log.info({ sku, channelsSent }, 'Stock alert processed')
    }
  )

  fastify.log.info('Stock alert consumer started — listening on notifications.stock.low')
}
