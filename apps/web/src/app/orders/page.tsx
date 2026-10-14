'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { Plus, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react'
import type { Order, OrderItem } from '@auto-shop/shared'

type SourceFilter = 'all' | 'pos' | 'mercado_livre' | 'meta' | 'manual'

const sourceColors: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  pos:            'success',
  mercado_livre:  'default',
  meta:           'warning',
  manual:         'secondary',
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  confirmed: 'success',
  pending:   'warning',
  shipped:   'default',
  cancelled: 'destructive',
}

function formatCurrency(value: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)
}

function formatDate(date?: Date | string) {
  if (!date) return '—'
  return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')

  // POS sale form state
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [items, setItems] = useState<Array<{ sku: string; name: string; qty: string; unit_price: string }>>([
    { sku: '', name: '', qty: '1', unit_price: '' }
  ])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = { page: '1', limit: '50' }
      if (sourceFilter !== 'all') params.source = sourceFilter
      const qs = new URLSearchParams(params).toString()
      const res = await api.get<{ success: boolean; data: { items: Order[]; total: number } }>(`/orders?${qs}`)
      setOrders(res.data?.items ?? [])
      setTotal(res.data?.total ?? 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sourceFilter])

  function addItem() {
    setItems(prev => [...prev, { sku: '', name: '', qty: '1', unit_price: '' }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: string, value: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  async function submitSale() {
    setSubmitting(true)
    setFormError(null)
    try {
      const parsedItems: OrderItem[] = items.map(i => ({
        sku: i.sku.trim().toUpperCase(),
        name: i.name.trim(),
        qty: Number(i.qty),
        unit_price: Number(i.unit_price),
      }))

      if (parsedItems.some(i => !i.sku || !i.name || i.qty < 1 || i.unit_price <= 0)) {
        setFormError('Please fill in all item fields correctly.')
        return
      }

      await api.post('/pos/sale', {
        customer: customerName ? { name: customerName } : undefined,
        items: parsedItems,
      })

      setShowForm(false)
      setItems([{ sku: '', name: '', qty: '1', unit_price: '' }])
      setCustomerName('')
      load()
    } catch (e: any) {
      setFormError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const sources: SourceFilter[] = ['all', 'pos', 'mercado_livre', 'meta', 'manual']

  return (
    <div>
      <Header title="Orders" description={`${total} total orders across all channels`} />

      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {sources.map(s => (
              <Button
                key={s}
                variant={sourceFilter === s ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSourceFilter(s)}
                className="capitalize text-xs"
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setShowForm(v => !v)}>
              <Plus className="h-4 w-4 mr-2" /> POS Sale
            </Button>
          </div>
        </div>

        {/* POS Sale Form */}
        {showForm && (
          <Card className="border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold text-sm">Register In-Person Sale</h3>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Customer Name (optional)</label>
                <Input
                  placeholder="e.g. João Silva"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground block">Items</label>
                {items.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="SKU" value={item.sku} onChange={e => updateItem(i, 'sku', e.target.value)} className="w-32" />
                    <Input placeholder="Product name" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} className="flex-1" />
                    <Input placeholder="Qty" type="number" min="1" value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} className="w-16" />
                    <Input placeholder="Unit price" type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="w-28" />
                    {items.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeItem(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" /> Add item
                </Button>
              </div>

              {formError && (
                <p className="text-xs text-destructive">{formError}</p>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={submitSale} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Confirm Sale'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error} — Make sure the API gateway and order service are running.
          </div>
        )}

        {/* Orders Table */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Items</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stock</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <ShoppingBag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      <p className="text-muted-foreground text-sm">No orders yet. Register a POS sale to get started.</p>
                    </td>
                  </tr>
                )}
                {orders.map(o => (
                  <tr key={o.order_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.order_id}</td>
                    <td className="px-4 py-3">
                      <Badge variant={sourceColors[o.source] ?? 'secondary'} className="capitalize text-xs">
                        {o.source.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusColors[o.status] ?? 'secondary'} className="capitalize text-xs">
                        {o.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{o.items.length} item(s)</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(o.total, o.currency)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={o.stock_deducted ? 'success' : 'warning'} className="text-xs">
                        {o.stock_deducted ? 'Deducted' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
