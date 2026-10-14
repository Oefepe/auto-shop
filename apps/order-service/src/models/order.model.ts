import mongoose, { Schema, Document } from 'mongoose'

export interface IOrderItem {
  sku: string
  name: string
  qty: number
  unit_price: number
}

export interface IOrder extends Document {
  order_id: string
  source: 'pos' | 'mercado_livre' | 'meta' | 'manual'
  external_order_id?: string
  status: 'pending' | 'confirmed' | 'shipped' | 'cancelled'
  customer: {
    name?: string
    email?: string
    document?: string
  }
  items: IOrderItem[]
  total: number
  currency: string
  stock_deducted: boolean
  idempotency_key: string
  created_at: Date
  updated_at: Date
}

const OrderItemSchema = new Schema<IOrderItem>({
  sku:        { type: String, required: true, uppercase: true },
  name:       { type: String, required: true },
  qty:        { type: Number, required: true, min: 1 },
  unit_price: { type: Number, required: true, min: 0 },
}, { _id: false })

const OrderSchema = new Schema<IOrder>(
  {
    order_id:          { type: String, required: true, unique: true },
    source:            { type: String, enum: ['pos', 'mercado_livre', 'meta', 'manual'], required: true },
    external_order_id: { type: String },
    status:            { type: String, enum: ['pending', 'confirmed', 'shipped', 'cancelled'], default: 'confirmed' },
    customer: {
      name:     { type: String },
      email:    { type: String },
      document: { type: String },
    },
    items:           { type: [OrderItemSchema], required: true },
    total:           { type: Number, required: true, min: 0 },
    currency:        { type: String, default: 'BRL' },
    stock_deducted:  { type: Boolean, default: false },
    idempotency_key: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
)

OrderSchema.index({ source: 1, created_at: -1 })
OrderSchema.index({ status: 1 })

export const OrderModel = mongoose.model<IOrder>('Order', OrderSchema)
