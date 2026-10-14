import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  name: string
  email: string
  password: string
  role: 'admin' | 'operator'
  created_at: Date
}

const UserSchema = new Schema<IUser>(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'operator'], default: 'operator' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
)

export const UserModel = mongoose.model<IUser>('User', UserSchema)
