import { FastifyPluginAsync } from 'fastify'
import { ProductModel } from '../models/product.model.js'

const productRoutes: FastifyPluginAsync = async (fastify) => {
  const auth = { onRequest: [fastify.authenticate] }

  // GET /products
  fastify.get('/', auth, async (request: any, reply) => {
    const { page = 1, limit = 20, category, active } = request.query as Record<string, string>
    const filter: Record<string, unknown> = {}
    if (category) filter.category = category
    if (active !== undefined) filter.is_active = active === 'true'

    const skip = (Number(page) - 1) * Number(limit)
    const [items, total] = await Promise.all([
      ProductModel.find(filter).skip(skip).limit(Number(limit)).sort({ created_at: -1 }),
      ProductModel.countDocuments(filter),
    ])

    return reply.send({
      success: true,
      data: {
        items,
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    })
  })

  // GET /products/:sku
  fastify.get<{ Params: { sku: string } }>('/:sku', auth, async (request, reply) => {
    const product = await ProductModel.findOne({ sku: request.params.sku.toUpperCase() })
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' })
    return reply.send({ success: true, data: product })
  })

  // POST /products
  fastify.post<{
    Body: {
      sku: string; name: string; description?: string; category: string
      attributes?: Record<string, unknown>; images?: string[]
      marketplace_ids?: { mercado_livre?: string; meta?: string }
      price: number; currency?: string
    }
  }>('/', auth, async (request, reply) => {
    const existing = await ProductModel.findOne({ sku: request.body.sku.toUpperCase() })
    if (existing) return reply.status(409).send({ success: false, error: 'SKU already exists' })

    const product = await ProductModel.create({
      ...request.body,
      sku: request.body.sku.toUpperCase(),
    })
    return reply.status(201).send({ success: true, data: product })
  })

  // PUT /products/:sku
  fastify.put<{
    Params: { sku: string }
    Body: Partial<{ name: string; description: string; category: string; attributes: Record<string, unknown>; images: string[]; marketplace_ids: { mercado_livre?: string; meta?: string }; price: number; currency: string; is_active: boolean }>
  }>('/:sku', auth, async (request, reply) => {
    const product = await ProductModel.findOneAndUpdate(
      { sku: request.params.sku.toUpperCase() },
      { $set: request.body },
      { new: true }
    )
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' })
    return reply.send({ success: true, data: product })
  })

  // DELETE /products/:sku  (soft delete)
  fastify.delete<{ Params: { sku: string } }>('/:sku', auth, async (request, reply) => {
    const product = await ProductModel.findOneAndUpdate(
      { sku: request.params.sku.toUpperCase() },
      { $set: { is_active: false } },
      { new: true }
    )
    if (!product) return reply.status(404).send({ success: false, error: 'Product not found' })
    return reply.send({ success: true, message: 'Product deactivated' })
  })
}

export default productRoutes
