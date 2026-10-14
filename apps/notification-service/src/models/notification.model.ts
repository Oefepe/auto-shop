import mongoose, { Schema, Document } from 'mongoose'

export type NotificationType = 'low_stock' | 'out_of_stock'
export type NotificationChannel = 'email' | 'in_app'

export interface INotification extends Document {
  type: NotificationType
  sku: string
  available: number
  threshold: number
  channels_sent: NotificationChannel[]
  email_recipients: string[]
  read: boolean
  created_at: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    type:             { type: String, enum: ['low_stock', 'out_of_stock'], required: true },
    sku:              { type: String, required: true, uppercase: true },
    available:        { type: Number, required: true },
    threshold:        { type: Number, required: true },
    channels_sent:    { type: [String], enum: ['email', 'in_app'], default: [] },
    email_recipients: { type: [String], default: [] },
    read:             { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
)

NotificationSchema.index({ sku: 1, created_at: -1 })
NotificationSchema.index({ read: 1, created_at: -1 })
// Auto-delete notifications older than 180 days
NotificationSchema.index({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 })

export const NotificationModel = mongoose.model<INotification>('Notification', NotificationSchema)
