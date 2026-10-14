'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Download, RefreshCw, TrendingUp, DollarSign, Package, ShoppingCart } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  total_orders: number
  total_revenue: number
  total_products: number
  total_stock: number
  low_stock_count: number
  orders_by_source: Array<{ source: string; count: number; revenue: number }>
}

interface SalesByDay {
  date: string
  total_revenue: number
  total_orders: number
  by_source: Array<{ source: string; revenue: number; orders: number }>
}

interface ChannelData {
  source: string
  total_revenue: number
  total_orders: number
  avg_order_value: number
}

interface TopProduct {
  sku: string
  name: string
  total_qty: number
  total_revenue: number
  order_count: number
}

interface StockItem {
  sku: string
  name: string
  category: string
  available: number
  stock_value: number
  status: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  pos:           '#6c63ff',
  mercado_livre: '#00d4aa',
  meta:          '#3b82f6',
  manual:        '#8892a4',
}

const PERIOD_OPTIONS = [
  { label: 'This month', days: 0  },
  { label: 'Last 7d',    days: 7  },
  { label: 'Last 30d',   days: 30 },
  { label: 'Last 90d',   days: 90 },
]

function getPeriodDates(days: number): { from: string; to: string } {
  const to   = new Date()
  const from = days === 0
    ? new Date(to.getFullYear(), to.getMonth(), 1)
    : new Date(Date.now() - days * 86_400_000)
  return {
    from: from.toISOString().split('T')[0]!,
    to:   to.toISOString().split('T')[0]!,
  }
}

function fmt(n: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [periodIdx, setPeriodIdx]       = useState(0)
  const [summary, setSummary]           = useState<Summary | null>(null)
  const [salesByDay, setSalesByDay]     = useState<SalesByDay[]>([])
  const [byChannel, setByChannel]       = useState<ChannelData[]>([])
  const [topProducts, setTopProducts]   = useState<TopProduct[]>([])
  const [stockSnapshot, setStockSnapshot] = useState<{ items: StockItem[]; total_value: number } | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [tab, setTab]                   = useState<'sales' | 'stock'>('sales')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { from, to } = getPeriodDates(PERIOD_OPTIONS[periodIdx]!.days)
    const qs = `from=${from}&to=${to}`

    try {
      const [sumRes, salesRes, chanRes, topRes, stockRes] = await Promise.allSettled([
        api.get<any>(`/reports/summary?${qs}`),
        api.get<any>(`/reports/sales?${qs}&granularity=day`),
        api.get<any>(`/reports/sales/by-channel?${qs}`),
        api.get<any>(`/reports/sales/top-products?${qs}&limit=10`),
        api.get<any>('/reports/stock/snapshot'),
      ])

      if (sumRes.status   === 'fulfilled') setSummary(sumRes.value.data)
      if (salesRes.status === 'fulfilled') setSalesByDay(salesRes.value.data ?? [])
      if (chanRes.status  === 'fulfilled') setByChannel(chanRes.value.data ?? [])
      if (topRes.status   === 'fulfilled') setTopProducts(topRes.value.data ?? [])
      if (stockRes.status === 'fulfilled') setStockSnapshot(stockRes.value.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [periodIdx])

  useEffect(() => { load() }, [load])

  function downloadCsv(path: string, filename: string) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') ?? '' : ''
    const base  = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
    const { from, to } = getPeriodDates(PERIOD_OPTIONS[periodIdx]!.days)
    const url = `${base}${path}?from=${from}&to=${to}`
    const a = document.createElement('a')
    a.href = url
    a.setAttribute('download', filename)
    // For authenticated downloads, open in new tab (token would need to be in query param in prod)
    window.open(url, '_blank')
  }

  const statCards = [
    { label: 'Revenue',       value: summary ? fmt(summary.total_revenue) : '—',     icon: DollarSign,  color: 'text-violet-400' },
    { label: 'Orders',        value: summary?.total_orders ?? '—',                    icon: ShoppingCart, color: 'text-blue-400'   },
    { label: 'Stock Value',   value: stockSnapshot ? fmt(stockSnapshot.total_value) : '—', icon: Package, color: 'text-emerald-400' },
    { label: 'Low Stock SKUs', value: summary?.low_stock_count ?? '—',                icon: TrendingUp,  color: 'text-yellow-400' },
  ]

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-xs shadow-lg">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' && p.name.toLowerCase().includes('revenue')
              ? fmt(p.value)
              : p.value}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div>
      <Header title="Reports & Analytics" description="Sales performance and inventory health" />

      <div className="p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt, i) => (
              <Button
                key={opt.label}
                variant={periodIdx === i ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriodIdx(i)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv('/reports/export/sales.csv', 'sales.csv')}>
              <Download className="h-4 w-4 mr-2" /> Sales CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv('/reports/export/inventory.csv', 'inventory.csv')}>
              <Download className="h-4 w-4 mr-2" /> Inventory CSV
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error} — Make sure the reporting service is running.
          </div>
        )}

        {/* Stat cards */}
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

        {/* Tab selector */}
        <div className="flex gap-1 border-b border-border pb-3">
          {[
            { key: 'sales', label: 'Sales Analytics' },
            { key: 'stock', label: 'Stock Overview' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Sales tab ── */}
        {tab === 'sales' && (
          <div className="space-y-6">
            {/* Revenue over time */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Over Time</CardTitle>
                <CardDescription>Daily revenue across all channels</CardDescription>
              </CardHeader>
              <CardContent>
                {salesByDay.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No sales data for this period.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={salesByDay} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8892a4' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#8892a4' }} tickFormatter={v => fmt(v)} width={80} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="total_revenue"
                        name="Revenue"
                        stroke="#6c63ff"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Sales by channel — Bar */}
              <Card>
                <CardHeader>
                  <CardTitle>Sales by Channel</CardTitle>
                  <CardDescription>Revenue and order count per source</CardDescription>
                </CardHeader>
                <CardContent>
                  {byChannel.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      No data for this period.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={byChannel} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" />
                        <XAxis dataKey="source" tick={{ fontSize: 11, fill: '#8892a4' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#8892a4' }} tickFormatter={v => fmt(v)} width={80} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="total_revenue" name="Revenue" radius={[4, 4, 0, 0]}>
                          {byChannel.map(entry => (
                            <Cell key={entry.source} fill={CHANNEL_COLORS[entry.source] ?? '#8892a4'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Channel distribution — Pie */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Distribution</CardTitle>
                  <CardDescription>Share of orders per channel</CardDescription>
                </CardHeader>
                <CardContent>
                  {byChannel.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      No data for this period.
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="60%" height={200}>
                        <PieChart>
                          <Pie
                            data={byChannel}
                            dataKey="total_orders"
                            nameKey="source"
                            cx="50%" cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                          >
                            {byChannel.map(entry => (
                              <Cell key={entry.source} fill={CHANNEL_COLORS[entry.source] ?? '#8892a4'} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {byChannel.map(c => (
                          <div key={c.source} className="flex items-center gap-2 text-xs">
                            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ background: CHANNEL_COLORS[c.source] ?? '#8892a4' }} />
                            <span className="text-muted-foreground capitalize">{c.source.replace('_', ' ')}</span>
                            <span className="font-medium ml-auto pl-3">{c.total_orders} orders</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top products table */}
            <Card>
              <CardHeader>
                <CardTitle>Top Products</CardTitle>
                <CardDescription>Best-selling SKUs by revenue for the selected period</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Units Sold</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Orders</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No sales in this period.
                        </td>
                      </tr>
                    )}
                    {topProducts.map((p, i) => (
                      <tr key={p.sku} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3">{p.total_qty}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.order_count}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-400">{fmt(p.total_revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Stock tab ── */}
        {tab === 'stock' && (
          <div className="space-y-6">
            {/* Stock summary cards */}
            {stockSnapshot && (
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: 'Total Stock Value', value: fmt(stockSnapshot.total_value), color: 'text-emerald-400' },
                  { label: 'Total SKUs',        value: stockSnapshot.items.length,      color: 'text-violet-400' },
                  { label: 'Out of Stock',      value: stockSnapshot.items.filter(i => i.status === 'out_of_stock').length, color: 'text-red-400' },
                ].map(({ label, value, color }) => (
                  <Card key={label}>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Stock value bar chart — top 10 by value */}
            {stockSnapshot && stockSnapshot.items.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Top 10 SKUs by Stock Value</CardTitle>
                  <CardDescription>Available units × unit price</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={[...stockSnapshot.items]
                        .sort((a, b) => b.stock_value - a.stock_value)
                        .slice(0, 10)}
                      margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                      layout="vertical"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#8892a4' }} tickFormatter={v => fmt(v)} />
                      <YAxis type="category" dataKey="sku" tick={{ fontSize: 10, fill: '#8892a4' }} width={110} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="stock_value" name="Stock Value" fill="#6c63ff" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Stock snapshot table */}
            <Card>
              <CardHeader>
                <CardTitle>Inventory Snapshot</CardTitle>
                <CardDescription>Current stock levels and estimated value for all active SKUs</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Available</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stock Value</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!stockSnapshot || stockSnapshot.items.length === 0) && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No stock data available.
                        </td>
                      </tr>
                    )}
                    {stockSnapshot?.items.map(s => (
                      <tr key={s.sku} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.sku}</td>
                        <td className="px-4 py-3 font-medium">{s.name}</td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{s.category}</td>
                        <td className="px-4 py-3 font-semibold">{s.available}</td>
                        <td className="px-4 py-3 text-emerald-400">{fmt(s.stock_value)}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              s.status === 'out_of_stock' ? 'destructive'
                              : s.status === 'low_stock'  ? 'warning'
                              : 'success'
                            }
                            className="text-xs capitalize"
                          >
                            {s.status.replace('_', ' ')}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
