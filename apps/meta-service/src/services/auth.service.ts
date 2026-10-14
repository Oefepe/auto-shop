import { MetaAuthModel, IMetaAuth } from '../models/auth.model.js'

const META_APP_ID     = process.env.META_APP_ID     ?? ''
const META_APP_SECRET = process.env.META_APP_SECRET ?? ''
const META_BASE       = 'https://graph.facebook.com/v21.0'

export async function getStoredAuth(ownerId: string): Promise<IMetaAuth | null> {
  return MetaAuthModel.findOne({ owner_id: ownerId })
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  ownerId: string,
): Promise<IMetaAuth> {
  // Exchange code for short-lived token
  const tokenUrl = `${META_BASE}/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
  const res = await fetch(tokenUrl)
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`)
  const { access_token } = await res.json() as { access_token: string }

  // Exchange for long-lived token
  const longLivedUrl = `${META_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${access_token}`
  const longRes = await fetch(longLivedUrl)
  const longData = await longRes.json() as { access_token: string; expires_in?: number }
  const finalToken = longData.access_token ?? access_token

  // Get Meta user info
  const meRes = await fetch(`${META_BASE}/me?fields=id,name&access_token=${finalToken}`)
  const me = await meRes.json() as { id: string; name: string }

  const expires_at = longData.expires_in ? new Date(Date.now() + longData.expires_in * 1000) : undefined

  const auth = await MetaAuthModel.findOneAndUpdate(
    { owner_id: ownerId },
    { owner_id: ownerId, meta_user_id: me.id, user_name: me.name, access_token: finalToken, expires_at },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  return auth!
}

export async function updateSelectedCatalog(
  ownerId: string,
  catalogId: string,
  catalogName: string,
): Promise<void> {
  await MetaAuthModel.findOneAndUpdate(
    { owner_id: ownerId },
    { catalog_id: catalogId, catalog_name: catalogName },
    { upsert: true },
  )
}

export async function disconnectMeta(ownerId: string): Promise<void> {
  await MetaAuthModel.deleteOne({ owner_id: ownerId })
}
