import mongoose, { Schema, Document } from 'mongoose'

export interface IProduct extends Document {
  sku: string
  name: string
  description?: string
  category: string
  attributes: Record<string, unknown>
  images: string[]
  marketplace_ids: { mercado_livre?: string; meta?: string }
  price: number
  currency: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}

const ProductSchema = new Schema<IProduct>(
  {
    sku:         { type: String, required: true, unique: true, uppercase: true, trim: true },
    name:        { type: String, required: true, trim: true },
    description: { type: String },
    category:    { type: String, required: true, trim: true },
    attributes:  { type: Schema.Types.Mixed, default: {} },
    images:      { type: [String], default: [] },
    marketplace_ids: {
      mercado_livre: { type: String },
      meta:          { type: String },
    },
    price:    { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BRL' },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
)

ProductSchema.index({ category: 1 })
ProductSchema.index({ is_active: 1 })

export const ProductModel = mongoose.model<IProduct>('Product', ProductSchema)
