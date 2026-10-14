import { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/user.model.js'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register
  fastify.post<{
    Body: { name: string; email: string; password: string; role?: 'admin' | 'operator' }
  }>('/register', async (request, reply) => {
    const { name, email, password, role = 'operator' } = request.body

    const existing = await UserModel.findOne({ email })
    if (existing) {
      return reply.status(409).send({ success: false, error: 'Email already registered' })
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = await UserModel.create({ name, email, password: hashed, role })

    return reply.status(201).send({
      success: true,
      data: { id: user._id, name: user.name, email: user.email, role: user.role },
    })
  })

  // POST /auth/login
  fastify.post<{
    Body: { email: string; password: string }
  }>('/login', async (request, reply) => {
    const { email, password } = request.body

    const user = await UserModel.findOne({ email })
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' })
    }

    const payload = { id: user._id.toString(), email: user.email, role: user.role }
    const accessToken  = fastify.jwt.sign(payload, { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' })
    const refreshToken = fastify.jwt.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    } as any)

    return reply.send({
      success: true,
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      },
    })
  })

  // POST /auth/refresh
  fastify.post<{
    Body: { refresh_token: string }
  }>('/refresh', async (request, reply) => {
    try {
      const payload = fastify.jwt.verify<{ id: string; email: string; role: string }>(
        request.body.refresh_token,
        { secret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret' } as any
      )
      const accessToken = fastify.jwt.sign(
        { id: payload.id, email: payload.email, role: payload.role },
        { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' }
      )
      return reply.send({ success: true, data: { access_token: accessToken } })
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid or expired refresh token' })
    }
  })

  // GET /auth/me  (protected)
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const user = await UserModel.findById((request.user as { id: string }).id).select('-password')
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' })
    return reply.send({ success: true, data: user })
  })
}

export default authRoutes
