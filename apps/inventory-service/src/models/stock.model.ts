import mongoose, { Schema, Document } from 'mongoose'

export interface IStockLevel extends Document {
  sku: string
  quantity: number
  reserved: number
  available: number
  low_stock_threshold: number
  location: string
  updated_at: Date
}

export interface IStockMovement extends Document {
  sku: string
  delta: number
  reason: 'sale' | 'restock' | 'adjustment' | 'return'
  source: 'mercado_livre' | 'meta' | 'pos' | 'manual'
  order_id?: string
  created_at: Date
}

const StockLevelSchema = new Schema<IStockLevel>(
  {
    sku:                 { type: String, required: true, unique: true, uppercase: true },
    quantity:            { type: Number, required: true, min: 0 },
    reserved:            { type: Number, default: 0, min: 0 },
    available:           { type: Number, default: 0, min: 0 },
    low_stock_threshold: { type: Number, default: 5 },
    location:            { type: String, default: 'main-warehouse' },
  },
  { timestamps: { createdAt: false, updatedAt: 'updated_at' } }
)

const StockMovementSchema = new Schema<IStockMovement>(
  {
    sku:      { type: String, required: true, uppercase: true },
    delta:    { type: Number, required: true },
    reason:   { type: String, enum: ['sale', 'restock', 'adjustment', 'return'], required: true },
    source:   { type: String, enum: ['mercado_livre', 'meta', 'pos', 'manual'], default: 'manual' },
    order_id: { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
)

StockMovementSchema.index({ sku: 1, created_at: -1 })
StockMovementSchema.index({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }) // 1-year TTL

export const StockLevelModel    = mongoose.model<IStockLevel>('StockLevel', StockLevelSchema)
export const StockMovementModel = mongoose.model<IStockMovement>('StockMovement', StockMovementSchema)
