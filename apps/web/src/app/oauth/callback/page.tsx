'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

/**
 * This page is the OAuth redirect target for both ML and Meta.
 * It reads the result from the query string, sends a postMessage to the
 * opener window, then closes itself.
 *
 * Query params:
 *   provider  — 'ml' | 'meta'
 *   status    — 'success' | 'error'
 *   error     — error code (when status=error)
 */
export default function OAuthCallbackPage() {
  const searchParams = useSearchParams()
  const provider = searchParams.get('provider') ?? ''
  const status   = searchParams.get('status') ?? 'error'
  const error    = searchParams.get('error') ?? 'unknown_error'

  useEffect(() => {
    if (!window.opener) return

    if (status === 'success') {
      window.opener.postMessage({ type: 'oauth_success', provider }, '*')
    } else {
      window.opener.postMessage({ type: 'oauth_error', provider, error }, '*')
    }

    // Give the parent a moment to receive the message before closing
    const t = setTimeout(() => window.close(), 500)
    return () => clearTimeout(t)
  }, [provider, status, error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center p-8">
        {status === 'success' ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-400" />
            <p className="text-lg font-semibold">Connected!</p>
            <p className="text-sm text-muted-foreground">This window will close automatically.</p>
          </>
        ) : (
          <>
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="text-lg font-semibold">Connection failed</p>
            <p className="text-sm text-muted-foreground">{error.replace(/_/g, ' ')}</p>
            <p className="text-xs text-muted-foreground">You can close this window.</p>
          </>
        )}
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-2" />
      </div>
    </div>
  )
}
