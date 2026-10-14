import mongoose, { Schema, Document } from 'mongoose'

export type SyncStatus = 'success' | 'failed' | 'skipped'

export interface ISyncLog extends Document {
  event_type: 'stock_push' | 'order_received' | 'listing_paused' | 'listing_activated'
  sku?: string
  ml_item_id?: string
  order_id?: string
  payload: Record<string, unknown>
  status: SyncStatus
  attempts: number
  error?: string
  created_at: Date
}

const SyncLogSchema = new Schema<ISyncLog>(
  {
    event_type: {
      type: String,
      enum: ['stock_push', 'order_received', 'listing_paused', 'listing_activated'],
      required: true,
    },
    sku:        { type: String },
    ml_item_id: { type: String },
    order_id:   { type: String },
    payload:    { type: Schema.Types.Mixed, default: {} },
    status:     { type: String, enum: ['success', 'failed', 'skipped'], default: 'success' },
    attempts:   { type: Number, default: 1 },
    error:      { type: String },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
)

// Auto-delete logs older than 90 days
SyncLogSchema.index({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 })
SyncLogSchema.index({ sku: 1, created_at: -1 })
SyncLogSchema.index({ status: 1 })

export const SyncLogModel = mongoose.model<ISyncLog>('SyncLog', SyncLogSchema)
