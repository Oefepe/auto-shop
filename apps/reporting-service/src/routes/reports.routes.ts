import { FastifyPluginAsync } from 'fastify'
import { getModels } from '../lib/schemas.js'
import { toCsv } from '../lib/csv.js'

function parseDateRange(from?: string, to?: string): { $gte: Date; $lte: Date } {
  const now   = new Date()
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1) // start of current month
  const end   = to   ? new Date(to)   : now
  end.setHours(23, 59, 59, 999)
  return { $gte: start, $lte: end }
}

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }
  const M    = () => getModels(fastify.db)

  // ── Summary ────────────────────────────────────────────────────────────────

  // GET /reports/summary  — key metrics for dashboard widgets
  fastify.get('/summary', auth, async (request: any, reply) => {
    const { from, to } = request.query as Record<string, string>
    const dateRange = parseDateRange(from, to)
    const { Order, StockLevel, Product } = M()

    const [
      totalOrders,
      totalRevenue,
      totalProducts,
      totalStock,
      ordersBySource,
      lowStockCount,
    ] = await Promise.all([
      Order.countDocuments({ created_at: dateRange, status: { $ne: 'cancelled' } }),

      Order.aggregate([
        { $match: { created_at: dateRange, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]).then(r => r[0]?.total ?? 0),

      Product.countDocuments({ is_active: true }),

      StockLevel.aggregate([
        { $group: { _id: null, total: { $sum: '$available' } } },
      ]).then(r => r[0]?.total ?? 0),

      Order.aggregate([
        { $match: { created_at: dateRange, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$source', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $sort: { revenue: -1 } },
      ]),

      StockLevel.countDocuments({ $expr: { $lte: ['$available', '$low_stock_threshold'] } }),
    ])

    return reply.send({
      success: true,
      data: {
        total_orders:   totalOrders,
        total_revenue:  totalRevenue,
        total_products: totalProducts,
        total_stock:    totalStock,
        low_stock_count: lowStockCount,
        orders_by_source: ordersBySource,
      },
    })
  })

  // ── Sales ──────────────────────────────────────────────────────────────────

  // GET /reports/sales  — daily sales grouped by date
  fastify.get('/sales', auth, async (request: any, reply) => {
    const { from, to, granularity = 'day' } = request.query as Record<string, string>
    const dateRange = parseDateRange(from, to)
    const { Order } = M()

    const dateFormat = granularity === 'month' ? '%Y-%m' : granularity === 'week' ? '%Y-%U' : '%Y-%m-%d'

    const data = await Order.aggregate([
      { $match: { created_at: dateRange, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id:     { date: { $dateToString: { format: dateFormat, date: '$created_at' } }, source: '$source' },
          revenue: { $sum: '$total' },
          orders:  { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
      {
        $group: {
          _id:     '$_id.date',
          total_revenue: { $sum: '$revenue' },
          total_orders:  { $sum: '$orders' },
          by_source: {
            $push: { source: '$_id.source', revenue: '$revenue', orders: '$orders' },
          },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', total_revenue: 1, total_orders: 1, by_source: 1 } },
    ])

    return reply.send({ success: true, data })
  })

  // GET /reports/sales/by-channel  — totals grouped by source channel
  fastify.get('/sales/by-channel', auth, async (request: any, reply) => {
    const { from, to } = request.query as Record<string, string>
    const dateRange = parseDateRange(from, to)
    const { Order } = M()

    const data = await Order.aggregate([
      { $match: { created_at: dateRange, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id:            '$source',
          total_revenue:  { $sum: '$total' },
          total_orders:   { $sum: 1 },
          avg_order_value: { $avg: '$total' },
        },
      },
      { $sort: { total_revenue: -1 } },
      {
        $project: {
          _id: 0,
          source:           '$_id',
          total_revenue:    1,
          total_orders:     1,
          avg_order_value:  { $round: ['$avg_order_value', 2] },
        },
      },
    ])

    return reply.send({ success: true, data })
  })

  // GET /reports/sales/top-products  — best-selling SKUs by qty and revenue
  fastify.get('/sales/top-products', auth, async (request: any, reply) => {
    const { from, to, limit = 10 } = request.query as Record<string, string>
    const dateRange = parseDateRange(from, to)
    const { Order } = M()

    const data = await Order.aggregate([
      { $match: { created_at: dateRange, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id:           '$items.sku',
          name:          { $first: '$items.name' },
          total_qty:     { $sum: '$items.qty' },
          total_revenue: { $sum: { $multiply: ['$items.qty', '$items.unit_price'] } },
          order_count:   { $sum: 1 },
        },
      },
      { $sort: { total_revenue: -1 } },
      { $limit: Number(limit) },
      {
        $project: {
          _id: 0,
          sku:           '$_id',
          name:          1,
          total_qty:     1,
          total_revenue: { $round: ['$total_revenue', 2] },
          order_count:   1,
        },
      },
    ])

    return reply.send({ success: true, data })
  })

  // ── Stock ──────────────────────────────────────────────────────────────────

  // GET /reports/stock/snapshot  — current stock value per SKU
  fastify.get('/stock/snapshot', auth, async (_request, reply) => {
    const { StockLevel, Product } = M()

    const [levels, products] = await Promise.all([
      StockLevel.find({}).lean(),
      Product.find({ is_active: true }).lean(),
    ])

    const priceMap = new Map(products.map((p: any) => [p.sku, { price: p.price, name: p.name, category: p.category }]))

    const rows = levels.map((s: any) => {
      const info = priceMap.get(s.sku) as { price?: number; name?: string; category?: string } | undefined
      const price = info?.price ?? 0
      return {
        sku:             s.sku,
        name:            info?.name ?? s.sku,
        category:        info?.category ?? '—',
        quantity:        s.quantity,
        reserved:        s.reserved,
        available:       s.available,
        threshold:       s.low_stock_threshold,
        unit_price:      price,
        stock_value:     parseFloat((s.available * price).toFixed(2)),
        status:          s.available === 0 ? 'out_of_stock' : s.available <= s.low_stock_threshold ? 'low_stock' : 'ok',
        location:        s.location,
      }
    })

    const totalValue = rows.reduce((sum, r) => sum + r.stock_value, 0)

    return reply.send({
      success: true,
      data: {
        items:       rows,
        total_value: parseFloat(totalValue.toFixed(2)),
        total_skus:  rows.length,
        out_of_stock: rows.filter(r => r.status === 'out_of_stock').length,
        low_stock:    rows.filter(r => r.status === 'low_stock').length,
      },
    })
  })

  // GET /reports/stock/history/:sku  — movement history for one SKU with running balance
  fastify.get<{ Params: { sku: string } }>('/stock/history/:sku', auth, async (request: any, reply) => {
    const sku = request.params.sku.toUpperCase()
    const { from, to } = request.query as Record<string, string>
    const dateRange = parseDateRange(from, to)
    const { StockMovement } = M()

    const movements = await StockMovement.find({
      sku,
      created_at: dateRange,
    }).sort({ created_at: 1 }).lean()

    // Compute running balance
    let balance = 0
    const data = (movements as any[]).map(m => {
      balance += m.delta
      return {
        date:     m.created_at,
        delta:    m.delta,
        reason:   m.reason,
        source:   m.source,
        order_id: m.order_id,
        balance:  balance,
      }
    })

    return reply.send({ success: true, data })
  })

  // GET /reports/stock/turnover  — units sold / avg available per SKU
  fastify.get('/stock/turnover', auth, async (request: any, reply) => {
    const { from, to, limit = 20 } = request.query as Record<string, string>
    const dateRange = parseDateRange(from, to)
    const { StockMovement, StockLevel } = M()

    const [sales, levels] = await Promise.all([
      StockMovement.aggregate([
        { $match: { reason: 'sale', created_at: dateRange } },
        { $group: { _id: '$sku', units_sold: { $sum: { $abs: '$delta' } } } },
        { $sort: { units_sold: -1 } },
        { $limit: Number(limit) },
      ]),
      StockLevel.find({}).lean(),
    ])

    const stockMap = new Map((levels as any[]).map((s: any) => [s.sku, s.available]))

    const data = (sales as any[]).map(s => {
      const currentStock = stockMap.get(s._id) ?? 0
      const turnoverRate = currentStock > 0 ? parseFloat((s.units_sold / currentStock).toFixed(2)) : null
      return {
        sku:           s._id,
        units_sold:    s.units_sold,
        current_stock: currentStock,
        turnover_rate: turnoverRate,
      }
    })

    return reply.send({ success: true, data })
  })

  // ── CSV Export ─────────────────────────────────────────────────────────────

  // GET /reports/export/sales.csv
  fastify.get('/export/sales.csv', auth, async (request: any, reply) => {
    const { from, to } = request.query as Record<string, string>
    const dateRange = parseDateRange(from, to)
    const { Order } = M()

    const orders = await Order.find({
      created_at: dateRange,
      status: { $ne: 'cancelled' },
    }).lean()

    const rows = (orders as any[]).flatMap(o =>
      (o.items as any[]).map(item => ({
        order_id:   o.order_id,
        date:       new Date(o.created_at).toISOString().split('T')[0],
        source:     o.source,
        status:     o.status,
        sku:        item.sku,
        product:    item.name,
        qty:        item.qty,
        unit_price: item.unit_price,
        subtotal:   (item.qty * item.unit_price).toFixed(2),
        currency:   o.currency,
      }))
    )

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="sales.csv"')
    return reply.send(toCsv(rows))
  })

  // GET /reports/export/inventory.csv
  fastify.get('/export/inventory.csv', auth, async (_request, reply) => {
    const { StockLevel, Product } = M()

    const [levels, products] = await Promise.all([
      StockLevel.find({}).lean(),
      Product.find({}).lean(),
    ])

    const priceMap = new Map((products as any[]).map((p: any) => [p.sku, p]))

    const rows = (levels as any[]).map((s: any) => {
      const p = priceMap.get(s.sku) as any
      return {
        sku:             s.sku,
        name:            p?.name ?? '',
        category:        p?.category ?? '',
        quantity:        s.quantity,
        reserved:        s.reserved,
        available:       s.available,
        threshold:       s.low_stock_threshold,
        unit_price:      p?.price ?? 0,
        stock_value:     ((s.available ?? 0) * (p?.price ?? 0)).toFixed(2),
        location:        s.location,
        status:          s.available === 0 ? 'out_of_stock' : s.available <= s.low_stock_threshold ? 'low_stock' : 'ok',
        last_updated:    s.updated_at ? new Date(s.updated_at).toISOString() : '',
      }
    })

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="inventory.csv"')
    return reply.send(toCsv(rows))
  })
}

export default reportsRoutes
