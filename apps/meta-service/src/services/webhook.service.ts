import { createHmac, timingSafeEqual } from 'crypto'

const APP_SECRET    = process.env.META_APP_SECRET    ?? ''
const VERIFY_TOKEN  = process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'dev-meta-verify-token'

/**
 * Verify the X-Hub-Signature-256 header sent by Meta on webhook POST requests.
 * Returns true if the signature is valid.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!APP_SECRET) {
    // In dev mode without an app secret, skip verification
    return true
  }

  const expected = `sha256=${createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Verify the hub.verify_token sent by Meta during webhook subscription.
 */
export function verifyHubToken(token: string): boolean {
  return token === VERIFY_TOKEN
}
