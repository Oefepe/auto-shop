import mongoose, { Schema, Document } from 'mongoose'

export interface INotificationConfig extends Document {
  // null sku = global config; specific sku = per-product override
  sku: string | null
  email_recipients: string[]
  cooldown_hours: number
  email_enabled: boolean
  in_app_enabled: boolean
  updated_at: Date
}

const NotificationConfigSchema = new Schema<INotificationConfig>(
  {
    sku:              { type: String, default: null, uppercase: true },
    email_recipients: { type: [String], default: [] },
    cooldown_hours:   { type: Number, default: 4, min: 0 },
    email_enabled:    { type: Boolean, default: true },
    in_app_enabled:   { type: Boolean, default: true },
  },
  { timestamps: { createdAt: false, updatedAt: 'updated_at' } }
)

NotificationConfigSchema.index({ sku: 1 }, { unique: true, sparse: true })

export const NotificationConfigModel = mongoose.model<INotificationConfig>(
  'NotificationConfig',
  NotificationConfigSchema
)
