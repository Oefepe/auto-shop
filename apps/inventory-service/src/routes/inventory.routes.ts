import { FastifyPluginAsync } from 'fastify'
import { StockLevelModel, StockMovementModel } from '../models/stock.model.js'

const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }

  // GET /stock  — list all stock levels
  fastify.get('/', auth, async (request: any, reply) => {
    const { page = 1, limit = 20, low_stock } = request.query as Record<string, string>
    const filter: Record<string, unknown> = {}
    if (low_stock === 'true') {
      filter.$expr = { $lte: ['$available', '$low_stock_threshold'] }
    }
    const skip = (Number(page) - 1) * Number(limit)
    const [items, total] = await Promise.all([
      StockLevelModel.find(filter).skip(skip).limit(Number(limit)).sort({ sku: 1 }),
      StockLevelModel.countDocuments(filter),
    ])
    return reply.send({
      success: true,
      data: { items, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    })
  })

  // POST /stock  — initialize stock for a new SKU
  fastify.post<{
    Body: { sku: string; quantity: number; low_stock_threshold?: number; location?: string }
  }>('/', auth, async (request, reply) => {
    const { sku, quantity, low_stock_threshold, location } = request.body
    const existing = await StockLevelModel.findOne({ sku: sku.toUpperCase() })
    if (existing) return reply.status(409).send({ success: false, error: 'Stock entry already exists for this SKU' })

    const stock = await StockLevelModel.create({
      sku: sku.toUpperCase(),
      quantity,
      reserved: 0,
      available: quantity,
      low_stock_threshold: low_stock_threshold ?? Number(process.env.LOW_STOCK_DEFAULT_THRESHOLD ?? 5),
      location: location ?? 'main-warehouse',
    })

    await StockMovementModel.create({
      sku: sku.toUpperCase(),
      delta: quantity,
      reason: 'restock',
      source: 'manual',
    })

    return reply.status(201).send({ success: true, data: stock })
  })

  // GET /stock/:sku
  fastify.get<{ Params: { sku: string } }>('/:sku', auth, async (request, reply) => {
    const stock = await StockLevelModel.findOne({ sku: request.params.sku.toUpperCase() })
    if (!stock) return reply.status(404).send({ success: false, error: 'Stock not found for this SKU' })
    return reply.send({ success: true, data: stock })
  })

  // POST /stock/:sku/adjust  — adjust stock (add or remove)
  fastify.post<{
    Params: { sku: string }
    Body: { delta: number; reason: 'sale' | 'restock' | 'adjustment' | 'return'; source?: string; order_id?: string }
  }>('/:sku/adjust', auth, async (request, reply) => {
    const sku = request.params.sku.toUpperCase()
    const { delta, reason, source = 'manual', order_id } = request.body

    const stock = await StockLevelModel.findOne({ sku })
    if (!stock) return reply.status(404).send({ success: false, error: 'Stock not found for this SKU' })

    const newQuantity = stock.quantity + delta
    if (newQuantity < 0) {
      return reply.status(400).send({ success: false, error: 'Adjustment would result in negative stock' })
    }

    stock.quantity  = newQuantity
    stock.available = Math.max(0, newQuantity - stock.reserved)
    await stock.save()

    await StockMovementModel.create({ sku, delta, reason, source, order_id })

    const isLow = stock.available <= stock.low_stock_threshold
    return reply.send({
      success: true,
      data: stock,
      ...(isLow && { warning: `Stock is low (${stock.available} available)` }),
    })
  })

  // GET /stock/:sku/movements  — movement history
  fastify.get<{ Params: { sku: string } }>('/:sku/movements', auth, async (request: any, reply) => {
    const sku = request.params.sku.toUpperCase()
    const { page = 1, limit = 50 } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const [items, total] = await Promise.all([
      StockMovementModel.find({ sku }).skip(skip).limit(Number(limit)).sort({ created_at: -1 }),
      StockMovementModel.countDocuments({ sku }),
    ])

    return reply.send({
      success: true,
      data: { items, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    })
  })
}

export default inventoryRoutes
