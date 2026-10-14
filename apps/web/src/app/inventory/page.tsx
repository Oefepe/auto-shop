'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { inventoryApi } from '@/lib/api-client'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface StockLevel {
  _id: string
  sku: string
  quantity: number
  reserved: number
  available: number
  low_stock_threshold: number
  location: string
  updated_at: string
}

export default function InventoryPage() {
  const [stocks, setStocks] = useState<StockLevel[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await inventoryApi.list({ page: 1 }) as any
      setStocks(res.data.items as StockLevel[])
      setTotal(res.data.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function stockStatus(s: StockLevel) {
    if (s.available === 0) return { label: 'Out of Stock', variant: 'destructive' as const }
    if (s.available <= s.low_stock_threshold) return { label: 'Low Stock', variant: 'warning' as const }
    return { label: 'In Stock', variant: 'success' as const }
  }

  return (
    <div>
      <Header title="Inventory" description={`${total} SKUs tracked`} />

      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : `${stocks.filter(s => s.available <= s.low_stock_threshold).length} low stock alerts`}
          </span>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error} — Make sure the API gateway is running.
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Qty Total</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reserved</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Available</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Threshold</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {stocks.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No stock entries yet. Initialize stock for your products first.
                    </td>
                  </tr>
                )}
                {stocks.map((s) => {
                  const status = stockStatus(s)
                  return (
                    <tr key={s._id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-medium">{s.sku}</td>
                      <td className="px-4 py-3">{s.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.reserved}</td>
                      <td className="px-4 py-3 font-semibold">{s.available}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.low_stock_threshold}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{s.location}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {status.variant !== 'success' && <AlertTriangle className="h-3 w-3 text-yellow-400" />}
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
