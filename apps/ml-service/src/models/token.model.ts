import mongoose, { Schema, Document } from 'mongoose'

export interface IToken extends Document {
  provider: 'mercado_livre'
  owner_id: string       // system user ID (our app's user)
  ml_user_id: string     // ML seller's own user ID (from ML API)
  access_token: string
  refresh_token: string
  expires_at: Date
  scope: string
  created_at: Date
  updated_at: Date
}

const TokenSchema = new Schema<IToken>(
  {
    provider:      { type: String, enum: ['mercado_livre'], required: true },
    owner_id:      { type: String, required: true },
    ml_user_id:    { type: String, required: true },
    access_token:  { type: String, required: true },
    refresh_token: { type: String, required: true },
    expires_at:    { type: Date, required: true },
    scope:         { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
)

// One ML connection per system user
TokenSchema.index({ provider: 1, owner_id: 1 }, { unique: true })
// Lookup by ML's own user_id (for webhook routing)
TokenSchema.index({ provider: 1, ml_user_id: 1 })

export const TokenModel = mongoose.model<IToken>('Token', TokenSchema)
