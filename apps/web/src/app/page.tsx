'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Package, Layers, AlertTriangle, ShoppingCart, Wifi, WifiOff, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'
import { api } from '@/lib/api-client'

interface DashboardStats {
  totalProducts: number
  stockEntries: number
  lowStockCount: number
  totalOrders: number
}

interface MLStatus {
  connected: boolean
  user?: { nickname: string; email: string }
  expires_at?: string
  auth_url?: string
  error?: string
  mode?: string
}

interface MetaStatus {
  connected: boolean
  user?: { id: string; name: string }
  catalog_id?: string | null
  catalog_ready?: boolean
  consumer_active?: boolean
  error?: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({ totalProducts: 0, stockEntries: 0, lowStockCount: 0, totalOrders: 0 })
  const [mlStatus, setMLStatus]     = useState<MLStatus | null>(null)
  const [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [products, stock, lowStock, orders, ml, meta] = await Promise.allSettled([
        api.get<any>('/products?limit=1'),
        api.get<any>('/stock?limit=1'),
        api.get<any>('/stock?low_stock=true&limit=1'),
        api.get<any>('/orders?limit=1'),
        api.get<any>('/ml/status'),
        api.get<any>('/meta/status'),
      ])

      setStats({
        totalProducts: products.status === 'fulfilled' ? (products.value.data?.total ?? 0) : 0,
        stockEntries:  stock.status    === 'fulfilled' ? (stock.value.data?.total ?? 0)    : 0,
        lowStockCount: lowStock.status === 'fulfilled' ? (lowStock.value.data?.total ?? 0) : 0,
        totalOrders:   orders.status   === 'fulfilled' ? (orders.value.data?.total ?? 0)   : 0,
      })

      if (ml.status    === 'fulfilled') setMLStatus(ml.value.data)
      if (meta.status  === 'fulfilled') setMetaStatus(meta.value.data)

    } catch { /* keep defaults */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const statCards = [
    { label: 'Total Products',   value: stats.totalProducts, icon: Package,       color: 'text-violet-400' },
    { label: 'Stock Entries',    value: stats.stockEntries,  icon: Layers,        color: 'text-emerald-400' },
    { label: 'Low Stock Alerts', value: stats.lowStockCount, icon: AlertTriangle, color: 'text-yellow-400' },
    { label: 'Total Orders',     value: stats.totalOrders,   icon: ShoppingCart,  color: 'text-blue-400' },
  ]

  const channels = [
    {
      name: 'Mercado Livre',
      connected: mlStatus?.connected ?? false,
      detail: mlStatus?.connected
        ? `${mlStatus.user?.nickname ?? ''} · Phase 3 ✓`
        : mlStatus?.auth_url ? 'Click to authorize' : 'Phase 3',
      authUrl: mlStatus?.auth_url,
      phase: 3,
    },
    {
      name: 'Meta Marketplace',
      connected: metaStatus?.connected ?? false,
      detail: metaStatus?.connected
        ? `${metaStatus.user?.name ?? ''} · ${metaStatus.catalog_ready ? 'Catalog ready' : 'Set META_CATALOG_ID'}`
        : 'Phase 4',
      phase: 4,
    },
    {
      name: 'Point of Sale (POS)',
      connected: false,
      detail: 'Phase 2 ✓',
      phase: 2,
    },
  ]

  function SyncHealthCard({
    title,
    connected,
    consumerActive,
    expiresAt,
    catalogReady,
    authUrl,
    logsPath,
    syncPath,
    setupHint,
  }: {
    title: string
    connected: boolean
    consumerActive?: boolean
    expiresAt?: string
    catalogReady?: boolean
    authUrl?: string
    logsPath: string
    syncPath: string
    setupHint?: string
  }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>Sync health &amp; operations</CardDescription>
        </CardHeader>
        <CardContent>
          {connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${consumerActive !== false ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
                <span className={`font-medium ${consumerActive !== false ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  {consumerActive !== false ? 'Active' : 'Consumer starting...'}
                </span>
              </div>
              {expiresAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Token expires: {new Date(expiresAt).toLocaleString('pt-BR')}
                </p>
              )}
              {catalogReady === false && (
                <p className="text-xs text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Set META_CATALOG_ID to enable stock sync
                </p>
              )}
              <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p>Logs: <code className="text-foreground">GET {logsPath}</code></p>
                <p>Manual push: <code className="text-foreground">POST {syncPath}/:sku</code></p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Not connected</span>
              </div>
              {authUrl && (
                <a href={authUrl} className="text-sm text-primary hover:underline block">
                  Authorize →
                </a>
              )}
              {setupHint && <p className="text-xs text-muted-foreground">{setupHint}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <Header title="Dashboard" description="Overview of your inventory and sales channels" />

      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <Icon className={`h-4 w-4 ${color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? '...' : value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Channel status + sync health */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Channel list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Sales Channels</CardTitle>
                <CardDescription>Connection status per channel</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={load}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {channels.map(({ name, connected, detail, authUrl, phase }) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    {authUrl && !connected ? (
                      <a href={authUrl} className="text-xs text-primary hover:underline mt-0.5 block">{detail}</a>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={connected ? 'success' : 'secondary'}>
                      {connected ? 'Live' : `Ph. ${phase}`}
                    </Badge>
                    {connected
                      ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                      : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ML Sync */}
          <SyncHealthCard
            title="Mercado Livre Sync"
            connected={mlStatus?.connected ?? false}
            expiresAt={mlStatus?.expires_at}
            authUrl={mlStatus?.auth_url}
            logsPath="/ml/sync-logs"
            syncPath="/ml/sync"
          />

          {/* Meta Sync */}
          <SyncHealthCard
            title="Meta Marketplace Sync"
            connected={metaStatus?.connected ?? false}
            consumerActive={metaStatus?.consumer_active}
            catalogReady={metaStatus?.catalog_ready}
            logsPath="/meta/sync-logs"
            syncPath="/meta/sync"
            setupHint={
              metaStatus && !metaStatus.connected
                ? (metaStatus.error ?? 'Configure META_ACCESS_TOKEN in meta-service .env')
                : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}
