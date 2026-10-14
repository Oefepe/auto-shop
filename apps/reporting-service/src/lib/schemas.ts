import { Schema } from 'mongoose'
import type { Connection } from 'mongoose'

// ── Orders DB ────────────────────────────────────────────────────────────────

const OrderItemSchema = new Schema({
  sku:        String,
  name:       String,
  qty:        Number,
  unit_price: Number,
}, { _id: false })

const OrderSchema = new Schema({
  order_id:   String,
  source:     String,
  status:     String,
  items:      [OrderItemSchema],
  total:      Number,
  currency:   String,
  created_at: Date,
  updated_at: Date,
}, { timestamps: false })

// ── Inventory DB ─────────────────────────────────────────────────────────────

const StockLevelSchema = new Schema({
  sku:                 String,
  quantity:            Number,
  reserved:            Number,
  available:           Number,
  low_stock_threshold: Number,
  location:            String,
  updated_at:          Date,
}, { timestamps: false })

const StockMovementSchema = new Schema({
  sku:        String,
  delta:      Number,
  reason:     String,
  source:     String,
  order_id:   String,
  created_at: Date,
}, { timestamps: false })

// ── Products DB ──────────────────────────────────────────────────────────────

const ProductSchema = new Schema({
  sku:       String,
  name:      String,
  category:  String,
  price:     Number,
  currency:  String,
  is_active: Boolean,
}, { timestamps: false })

export function getModels(db: { orders: Connection; inventory: Connection; products: Connection }) {
  return {
    Order:         db.orders.model('Order', OrderSchema),
    StockLevel:    db.inventory.model('StockLevel', StockLevelSchema),
    StockMovement: db.inventory.model('StockMovement', StockMovementSchema),
    Product:       db.products.model('Product', ProductSchema),
  }
}
