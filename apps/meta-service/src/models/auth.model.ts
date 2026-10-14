import mongoose, { Schema, Document } from 'mongoose'

export interface IMetaAuth extends Document {
  owner_id: string      // system user ID (our app's user)
  meta_user_id: string  // Meta's own user ID (from Graph API)
  user_name: string
  access_token: string
  catalog_id?: string
  catalog_name?: string
  expires_at?: Date
  created_at: Date
  updated_at: Date
}

const MetaAuthSchema = new Schema<IMetaAuth>(
  {
    owner_id:      { type: String, required: true },
    meta_user_id:  { type: String, required: true },
    user_name:     { type: String, default: '' },
    access_token:  { type: String, required: true },
    catalog_id:    { type: String },
    catalog_name:  { type: String },
    expires_at:    { type: Date },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

// One Meta connection per system user
MetaAuthSchema.index({ owner_id: 1 }, { unique: true })

export const MetaAuthModel = mongoose.model<IMetaAuth>('MetaAuth', MetaAuthSchema)
