'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { integrationsApi } from '@/lib/api-client'
import { CheckCircle2, XCircle, Loader2, ExternalLink, ShoppingBag, Package, RefreshCw } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface MLStatus {
  connected: boolean
  user?: { id: number; nickname: string; email?: string }
  mode?: string
  auth_url?: string
  error?: string
}

interface MetaStatus {
  connected: boolean
  user?: { id: string; name: string }
  catalog_id?: string
  catalog_name?: string
  mode?: string
  error?: string
}

interface Catalog {
  id: string
  name: string
  business_name: string
  business_id: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="flex items-center gap-1 text-xs font-medium text-green-400">
      <CheckCircle2 className="h-3.5 w-3.5" /> Connected
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <XCircle className="h-3.5 w-3.5" /> Not connected
    </span>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [oauthBanner, setOauthBanner] = useState<{ type: 'success' | 'error'; provider: string; error?: string } | null>(null)
  const popupRef = useRef<Window | null>(null)

  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null)
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null)
  const [mlLoading, setMlLoading] = useState(true)
  const [metaLoading, setMetaLoading] = useState(true)

  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(false)
  const [catalogsError, setCatalogsError] = useState<string | null>(null)
  const [savingCatalog, setSavingCatalog] = useState(false)
  const [manualCatalogId, setManualCatalogId] = useState('')
  const [manualCatalogName, setManualCatalogName] = useState('')

  const loadML = useCallback(async () => {
    setMlLoading(true)
    try {
      const res = await integrationsApi.mlStatus()
      setMlStatus(res.data)
    } catch {
      setMlStatus({ connected: false, error: 'Could not reach ML service' })
    } finally {
      setMlLoading(false)
    }
  }, [])

  const loadMeta = useCallback(async () => {
    setMetaLoading(true)
    try {
      const res = await integrationsApi.metaMe()
      setMetaStatus(res.data)
    } catch {
      setMetaStatus({ connected: false, error: 'Could not reach Meta service' })
    } finally {
      setMetaLoading(false)
    }
  }, [])

  useEffect(() => {
    loadML()
    loadMeta()
  }, [loadML, loadMeta])

  // Listen for postMessage from the OAuth popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'oauth_success') {
        popupRef.current?.close()
        setOauthBanner({ type: 'success', provider: event.data.provider })
        if (event.data.provider === 'ml') loadML()
        else loadMeta()
      } else if (event.data?.type === 'oauth_error') {
        popupRef.current?.close()
        setOauthBanner({ type: 'error', provider: event.data.provider, error: event.data.error })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [loadML, loadMeta])

  async function loadCatalogs() {
    setCatalogsLoading(true)
    setCatalogsError(null)
    try {
      const res = await integrationsApi.metaCatalogs()
      setCatalogs(res.data)
    } catch (e: any) {
      setCatalogsError(e.message)
    } finally {
      setCatalogsLoading(false)
    }
  }

  async function selectCatalog(catalog: Catalog) {
    setSavingCatalog(true)
    try {
      await integrationsApi.metaSelectCatalog(catalog.id, catalog.name)
      await loadMeta()
    } finally {
      setSavingCatalog(false)
    }
  }

  async function disconnectML() {
    try {
      await integrationsApi.mlDisconnect()
      await loadML()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function disconnectMeta() {
    try {
      await integrationsApi.metaDisconnect()
      setMetaStatus({ connected: false })
      setCatalogs([])
    } catch (e: any) {
      alert(e.message)
    }
  }

  function openOAuthPopup(url: string) {
    const width = 600
    const height = 700
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2
    const popup = window.open(url, 'oauth-popup', `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`)
    popupRef.current = popup
  }

  function connectML() {
    const token = localStorage.getItem('access_token') ?? ''
    openOAuthPopup(`http://localhost:3000/ml/auth?token=${encodeURIComponent(token)}`)
  }

  function connectMeta() {
    const token = localStorage.getItem('access_token') ?? ''
    openOAuthPopup(`http://localhost:3000/meta/auth?token=${encodeURIComponent(token)}`)
  }

  return (
    <div>
      <Header title="Integrations" description="Connect your marketplace accounts to sync inventory automatically" />

      <div className="p-6 space-y-4 max-w-3xl">

        {/* OAuth feedback banner */}
        {oauthBanner?.type === 'success' && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {oauthBanner.provider === 'ml' ? 'Mercado Livre' : 'Meta'} connected successfully!
            </span>
            <button onClick={() => setOauthBanner(null)} className="text-green-400/60 hover:text-green-400">✕</button>
          </div>
        )}
        {oauthBanner?.type === 'error' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Connection failed: {(oauthBanner.error ?? 'unknown').replace(/_/g, ' ')}
            </span>
            <button onClick={() => setOauthBanner(null)} className="text-destructive/60 hover:text-destructive">✕</button>
          </div>
        )}

        {/* ── Mercado Livre ── */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/15">
                <ShoppingBag className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <h2 className="font-semibold">Mercado Livre</h2>
                <p className="text-sm text-muted-foreground">Sync inventory with your ML seller account</p>
              </div>
            </div>
            {mlLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <StatusBadge connected={mlStatus?.connected ?? false} />
            )}
          </div>

          {!mlLoading && mlStatus && (
            <>
              {mlStatus.connected && mlStatus.user && (
                <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-medium">{mlStatus.user.nickname}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs">{mlStatus.user.id}</span>
                  </div>
                  {mlStatus.mode && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mode</span>
                      <span className="text-xs capitalize">{mlStatus.mode.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                </div>
              )}

              {mlStatus.error && (
                <p className="text-sm text-destructive">{mlStatus.error}</p>
              )}

              <div className="flex gap-2">
                {mlStatus.connected ? (
                  <>
                    <button
                      onClick={loadML}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </button>
                    <button
                      onClick={disconnectML}
                      className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={connectML}
                    className="flex items-center gap-2 rounded-lg bg-yellow-500/15 border border-yellow-500/30 px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-yellow-500/25 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Connect with Mercado Livre
                  </button>
                )}
              </div>

              {!mlStatus.connected && (
                <p className="text-xs text-muted-foreground">
                  Requires <code className="bg-muted px-1 rounded">ML_CLIENT_ID</code> and <code className="bg-muted px-1 rounded">ML_CLIENT_SECRET</code> to be configured in the ml-service environment.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Meta Marketplace ── */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
                <Package className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="font-semibold">Meta Marketplace</h2>
                <p className="text-sm text-muted-foreground">Sync inventory with your Facebook/Instagram catalog</p>
              </div>
            </div>
            {metaLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <StatusBadge connected={metaStatus?.connected ?? false} />
            )}
          </div>

          {!metaLoading && metaStatus && (
            <>
              {metaStatus.connected && metaStatus.user && (
                <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-medium">{metaStatus.user.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID</span>
                    <span className="font-mono text-xs">{metaStatus.user.id}</span>
                  </div>
                  {metaStatus.mode && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mode</span>
                      <span className="text-xs capitalize">{metaStatus.mode.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-muted-foreground">Active Catalog</span>
                    <span className="font-medium text-right">
                      {metaStatus.catalog_name ?? metaStatus.catalog_id ?? (
                        <span className="text-destructive text-xs">None selected</span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {metaStatus.error && (
                <p className="text-sm text-destructive">{metaStatus.error}</p>
              )}

              {/* Catalog selector */}
              {metaStatus.connected && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Catalog Selection</p>
                    <button
                      onClick={loadCatalogs}
                      disabled={catalogsLoading}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${catalogsLoading ? 'animate-spin' : ''}`} />
                      {catalogs.length ? 'Refresh' : 'Load catalogs'}
                    </button>
                  </div>

                  {catalogsError && (
                    <p className="text-xs text-destructive">{catalogsError}</p>
                  )}

                  {catalogs.length > 0 && (
                    <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                      {catalogs.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => selectCatalog(cat)}
                          disabled={savingCatalog}
                          className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/30 transition-colors ${metaStatus.catalog_id === cat.id ? 'bg-primary/10' : ''}`}
                        >
                          <div>
                            <p className="font-medium">{cat.name}</p>
                            <p className="text-xs text-muted-foreground">{cat.business_name}</p>
                          </div>
                          {metaStatus.catalog_id === cat.id && (
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Manual catalog ID entry — fallback if API discovery is blocked */}
                  <div className="pt-1 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Don't see your catalog? Enter the ID manually from your{' '}
                      <a href="https://business.facebook.com/commerce" target="_blank" rel="noreferrer" className="underline">Commerce Manager</a>.
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={manualCatalogId}
                        onChange={e => setManualCatalogId(e.target.value)}
                        placeholder="Catalog ID"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        value={manualCatalogName}
                        onChange={e => setManualCatalogName(e.target.value)}
                        placeholder="Name (optional)"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        onClick={() => {
                          if (manualCatalogId.trim()) {
                            selectCatalog({ id: manualCatalogId.trim(), name: manualCatalogName.trim() || manualCatalogId.trim(), business_name: 'Manual', business_id: '' })
                            setManualCatalogId('')
                            setManualCatalogName('')
                          }
                        }}
                        disabled={!manualCatalogId.trim() || savingCatalog}
                        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/30 disabled:opacity-50 transition-colors"
                      >
                        Use
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {metaStatus.error && (
                <p className="text-xs text-muted-foreground">
                  Requires <code className="bg-muted px-1 rounded">META_APP_ID</code> and <code className="bg-muted px-1 rounded">META_APP_SECRET</code> in meta-service environment, or a direct <code className="bg-muted px-1 rounded">META_ACCESS_TOKEN</code>.
                </p>
              )}

              <div className="flex gap-2">
                {metaStatus.connected ? (
                  <button
                    onClick={disconnectMeta}
                    className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={connectMeta}
                    className="flex items-center gap-2 rounded-lg bg-blue-500/15 border border-blue-500/30 px-4 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/25 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Connect with Meta
                  </button>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
