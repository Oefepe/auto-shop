import { TokenModel, IToken } from '../models/token.model.js'

const ML_TOKEN_URL  = 'https://api.mercadolibre.com/oauth/token'
const CLIENT_ID     = process.env.ML_CLIENT_ID     ?? ''
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET ?? ''

export interface TokenSet {
  access_token: string
  refresh_token: string
  expires_at: Date
  ml_user_id: string
  scope: string
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  ownerId: string,
): Promise<TokenSet> {
  const res = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri:  redirectUri,
    }),
  })

  if (!res.ok) throw new Error(`ML token exchange failed: ${await res.text()}`)

  const data = await res.json() as {
    access_token: string; refresh_token: string; expires_in: number; user_id: number; scope: string
  }

  const expires_at = new Date(Date.now() + data.expires_in * 1000)

  await TokenModel.findOneAndUpdate(
    { provider: 'mercado_livre', owner_id: ownerId },
    {
      provider:      'mercado_livre',
      owner_id:      ownerId,
      ml_user_id:    String(data.user_id),
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at,
      scope:         data.scope ?? '',
    },
    { upsert: true, new: true },
  )

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at,
    ml_user_id:    String(data.user_id),
    scope:         data.scope,
  }
}

export async function refreshAccessToken(token: IToken): Promise<string> {
  const res = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refresh_token,
    }),
  })

  if (!res.ok) throw new Error(`ML token refresh failed: ${await res.text()}`)

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const expires_at = new Date(Date.now() + data.expires_in * 1000)

  await TokenModel.updateOne(
    { _id: token._id },
    { access_token: data.access_token, refresh_token: data.refresh_token, expires_at },
  )

  return data.access_token
}

export async function getValidAccessToken(ownerId: string): Promise<string> {
  const token = await TokenModel.findOne({ provider: 'mercado_livre', owner_id: ownerId })
  if (!token) throw new Error('Mercado Livre is not connected for this account.')

  const bufferMs = 5 * 60 * 1000
  if (token.expires_at.getTime() - Date.now() < bufferMs) {
    return refreshAccessToken(token)
  }

  return token.access_token
}

export async function getStoredToken(ownerId: string): Promise<IToken | null> {
  return TokenModel.findOne({ provider: 'mercado_livre', owner_id: ownerId })
}

/** Find the system owner by ML's own user_id (for webhook routing) */
export async function getOwnerByMlUserId(mlUserId: string): Promise<IToken | null> {
  return TokenModel.findOne({ provider: 'mercado_livre', ml_user_id: mlUserId })
}
