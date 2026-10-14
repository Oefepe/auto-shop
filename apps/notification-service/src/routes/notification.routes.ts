import { FastifyPluginAsync } from 'fastify'
import { NotificationModel } from '../models/notification.model.js'
import { NotificationConfigModel } from '../models/notification-config.model.js'
import { sendTestEmail, verifySmtpConnection } from '../services/email.service.js'

const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }

  // ── Notifications ──────────────────────────────────────────────────────────

  // GET /notifications  — list with pagination and filters
  fastify.get('/', auth, async (request: any, reply) => {
    const { page = 1, limit = 30, read, type, sku } = request.query as Record<string, string>
    const filter: Record<string, unknown> = {}
    if (read !== undefined) filter.read = read === 'true'
    if (type) filter.type = type
    if (sku) filter.sku = sku.toUpperCase()

    const skip = (Number(page) - 1) * Number(limit)
    const [items, total, unreadCount] = await Promise.all([
      NotificationModel.find(filter).skip(skip).limit(Number(limit)).sort({ created_at: -1 }),
      NotificationModel.countDocuments(filter),
      NotificationModel.countDocuments({ read: false }),
    ])

    return reply.send({
      success: true,
      data: {
        items,
        total,
        unread_count: unreadCount,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    })
  })

  // GET /notifications/unread-count  — lightweight count for sidebar badge
  fastify.get('/unread-count', auth, async (_request, reply) => {
    const count = await NotificationModel.countDocuments({ read: false })
    return reply.send({ success: true, data: { count } })
  })

  // PATCH /notifications/:id/read  — mark single notification as read
  fastify.patch<{ Params: { id: string } }>('/:id/read', auth, async (request, reply) => {
    const notification = await NotificationModel.findByIdAndUpdate(
      request.params.id,
      { $set: { read: true } },
      { new: true }
    )
    if (!notification) return reply.status(404).send({ success: false, error: 'Notification not found' })
    return reply.send({ success: true, data: notification })
  })

  // POST /notifications/read-all  — mark all as read
  fastify.post('/read-all', auth, async (_request, reply) => {
    const result = await NotificationModel.updateMany({ read: false }, { $set: { read: true } })
    return reply.send({ success: true, data: { modified: result.modifiedCount } })
  })

  // DELETE /notifications/:id
  fastify.delete<{ Params: { id: string } }>('/:id', auth, async (request, reply) => {
    await NotificationModel.findByIdAndDelete(request.params.id)
    return reply.send({ success: true, message: 'Notification deleted' })
  })

  // ── Config ─────────────────────────────────────────────────────────────────

  // GET /notifications/config  — get global config (and optional per-SKU configs)
  fastify.get('/config', auth, async (_request, reply) => {
    const [global, perSku] = await Promise.all([
      NotificationConfigModel.findOne({ sku: null }),
      NotificationConfigModel.find({ sku: { $ne: null } }).sort({ sku: 1 }),
    ])
    return reply.send({ success: true, data: { global, per_sku: perSku } })
  })

  // PUT /notifications/config  — upsert global config
  fastify.put<{
    Body: {
      email_recipients?: string[]
      cooldown_hours?: number
      email_enabled?: boolean
      in_app_enabled?: boolean
    }
  }>('/config', auth, async (request, reply) => {
    const config = await NotificationConfigModel.findOneAndUpdate(
      { sku: null },
      { $set: request.body },
      { upsert: true, new: true }
    )
    return reply.send({ success: true, data: config })
  })

  // PUT /notifications/config/:sku  — upsert per-SKU config
  fastify.put<{
    Params: { sku: string }
    Body: {
      email_recipients?: string[]
      cooldown_hours?: number
      email_enabled?: boolean
      in_app_enabled?: boolean
    }
  }>('/config/:sku', auth, async (request, reply) => {
    const config = await NotificationConfigModel.findOneAndUpdate(
      { sku: request.params.sku.toUpperCase() },
      { $set: { ...request.body, sku: request.params.sku.toUpperCase() } },
      { upsert: true, new: true }
    )
    return reply.send({ success: true, data: config })
  })

  // DELETE /notifications/config/:sku  — remove per-SKU override
  fastify.delete<{ Params: { sku: string } }>('/config/:sku', auth, async (request, reply) => {
    await NotificationConfigModel.findOneAndDelete({ sku: request.params.sku.toUpperCase() })
    return reply.send({ success: true, message: 'Per-SKU config removed' })
  })

  // ── SMTP ───────────────────────────────────────────────────────────────────

  // GET /notifications/smtp/status  — verify SMTP connection
  fastify.get('/smtp/status', auth, async (_request, reply) => {
    const ok = await verifySmtpConnection()
    return reply.send({
      success: true,
      data: {
        connected: ok,
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
      },
    })
  })

  // POST /notifications/smtp/test  — send a test email
  fastify.post<{ Body: { recipient: string } }>('/smtp/test', auth, async (request, reply) => {
    try {
      await sendTestEmail(request.body.recipient)
      return reply.send({ success: true, message: `Test email sent to ${request.body.recipient}` })
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message })
    }
  })
}

export default notificationRoutes
