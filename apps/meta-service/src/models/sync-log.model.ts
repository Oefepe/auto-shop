import mongoose, { Schema, Document } from 'mongoose'

export type SyncStatus = 'success' | 'failed' | 'skipped'

export interface IMetaSyncLog extends Document {
  event_type: 'stock_push' | 'order_received' | 'catalog_update' | 'listing_unavailable'
  sku?: string
  retailer_id?: string
  order_id?: string
  payload: Record<string, unknown>
  status: SyncStatus
  attempts: number
  error?: string
  created_at: Date
}

const MetaSyncLogSchema = new Schema<IMetaSyncLog>(
  {
    event_type: {
      type: String,
      enum: ['stock_push', 'order_received', 'catalog_update', 'listing_unavailable'],
      required: true,
    },
    sku:         { type: String },
    retailer_id: { type: String },
    order_id:    { type: String },
    payload:     { type: Schema.Types.Mixed, default: {} },
    status:      { type: String, enum: ['success', 'failed', 'skipped'], default: 'success' },
    attempts:    { type: Number, default: 1 },
    error:       { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
)

MetaSyncLogSchema.index({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 })
MetaSyncLogSchema.index({ sku: 1, created_at: -1 })
MetaSyncLogSchema.index({ status: 1 })

export const MetaSyncLogModel = mongoose.model<IMetaSyncLog>('MetaSyncLog', MetaSyncLogSchema)
