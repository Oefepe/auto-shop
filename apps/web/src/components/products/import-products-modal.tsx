'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { marketplaceApi, productsApi, inventoryApi, MLCatalogItem, MetaCatalogItem } from '@/lib/api-client'
import { Download, RefreshCw, ShoppingBag, Package, Check, AlertCircle, ImageOff } from 'lucide-react'

type Source = 'ml' | 'meta'

interface NormalizedItem {
  source: Source
  externalId: string
  sku: string
  name: string
  price: number
  currency: string
  quantity: number
  image?: string
}

function normalize(source: Source, items: MLCatalogItem[] | MetaCatalogItem[]): NormalizedItem[] {
  if (source === 'ml') {
    return (items as MLCatalogItem[]).map(i => ({
      source,
      externalId: i.id,
      sku: i.seller_sku || i.id,
      name: i.title,
      price: i.price ?? 0,
      currency: i.currency_id ?? 'BRL',
      quantity: i.available_quantity,
      image: i.pictures?.[0]?.url,
    }))
  }
  return (items as MetaCatalogItem[]).map(i => ({
    source,
    externalId: i.id,
    sku: i.retailer_id || i.id,
    name: i.name,
    price: 0,
    currency: 'BRL',
    quantity: i.quantity,
    image: undefined,
  }))
}

interface ImportState {
  status: 'idle' | 'importing' | 'done' | 'error'
  imported: number
  skipped: number
  errors: string[]
}

export function ImportProductsModal({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [activeSource, setActiveSource] = useState<Source>('ml')
  const [items, setItems] = useState<NormalizedItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [importState, setImportState] = useState<ImportState>({ status: 'idle', imported: 0, skipped: 0, errors: [] })

  async function fetchCatalog(source: Source) {
    setLoading(true)
    setFetchError(null)
    setItems([])
    setSelected(new Set())
    setImportState({ status: 'idle', imported: 0, skipped: 0, errors: [] })
    try {
      if (source === 'ml') {
        const res = await marketplaceApi.mlCatalog()
        setItems(normalize('ml', res.data))
      } else {
        const res = await marketplaceApi.metaCatalog()
        setItems(normalize('meta', res.data.data ?? []))
      }
    } catch (e: any) {
      setFetchError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleSourceChange(source: Source) {
    setActiveSource(source)
    setItems([])
    setSelected(new Set())
    setFetchError(null)
    setImportState({ status: 'idle', imported: 0, skipped: 0, errors: [] })
  }

  function toggleItem(sku: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(sku) ? next.delete(sku) : next.add(sku)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map(i => i.sku)))
    }
  }

  async function handleImport() {
    const toImport = items.filter(i => selected.has(i.sku))
    if (!toImport.length) return

    setImportState({ status: 'importing', imported: 0, skipped: 0, errors: [] })

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const item of toImport) {
      try {
        await productsApi.create({
          sku: item.sku,
          name: item.name,
          category: item.source === 'ml' ? 'mercado_livre' : 'meta',
          price: item.price,
          currency: item.currency,
          images: item.image ? [item.image] : undefined,
          marketplace_ids: item.source === 'ml'
            ? { mercado_livre: item.externalId }
            : { meta: item.externalId },
        })

        if (item.quantity > 0) {
          await inventoryApi.initialize({ sku: item.sku, quantity: item.quantity, low_stock_threshold: 5 })
        }

        imported++
      } catch (e: any) {
        if (e.message?.toLowerCase().includes('already exists') || e.message?.includes('409')) {
          skipped++
        } else {
          errors.push(`${item.sku}: ${e.message}`)
        }
      }
    }

    setImportState({ status: errors.length && imported === 0 ? 'error' : 'done', imported, skipped, errors })
    if (imported > 0) onDone()
  }

  const allSelected = items.length > 0 && selected.size === items.length
  const isDone = importState.status === 'done' || importState.status === 'error'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Products</DialogTitle>
          <DialogDescription>
            Fetch products from a connected marketplace and import them into your catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Source tabs */}
          <div className="flex gap-2">
            {([['ml', 'Mercado Livre', ShoppingBag], ['meta', 'Meta Marketplace', Package]] as const).map(
              ([src, label, Icon]) => (
                <button
                  key={src}
                  onClick={() => handleSourceChange(src)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    activeSource === src
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              )
            )}

            <button
              onClick={() => fetchCatalog(activeSource)}
              disabled={loading}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {items.length ? 'Refresh' : 'Load Catalog'}
            </button>
          </div>

          {/* Error */}
          {fetchError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}

          {/* Import result */}
          {isDone && (
            <div className={`rounded-lg border p-3 text-sm space-y-1 ${importState.errors.length && !importState.imported ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-green-500/30 bg-green-500/10 text-green-400'}`}>
              <p className="font-medium flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                {importState.imported} imported, {importState.skipped} already existed
              </p>
              {importState.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
            </div>
          )}

          {/* Item list */}
          {items.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded"
                />
                <span className="flex-1">Product</span>
                <span className="w-20 text-right">Price</span>
                <span className="w-16 text-right">Stock</span>
                <span className="w-24 text-right">SKU</span>
              </div>

              <div className="divide-y divide-border max-h-64 overflow-y-auto">
                {items.map(item => (
                  <label
                    key={item.sku}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.sku)}
                      onChange={() => toggleItem(item.sku)}
                      className="h-3.5 w-3.5 rounded flex-shrink-0"
                    />
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="h-9 w-9 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
                    <span className="w-20 text-right text-sm text-muted-foreground">
                      {item.price ? `${item.currency} ${item.price.toFixed(2)}` : '—'}
                    </span>
                    <span className="w-16 text-right text-sm tabular-nums">{item.quantity}</span>
                    <span className="w-24 text-right text-xs font-mono text-muted-foreground truncate">{item.sku}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!loading && items.length === 0 && !fetchError && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Download className="h-8 w-8 opacity-30" />
              <p>Click <strong>Load Catalog</strong> to fetch products from {activeSource === 'ml' ? 'Mercado Livre' : 'Meta Marketplace'}.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2 w-full">
            <span className="flex-1 text-sm text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : ''}
            </span>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={selected.size === 0 || importState.status === 'importing'}
            >
              {importState.status === 'importing' ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Importing…</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Import {selected.size > 0 ? `(${selected.size})` : ''}</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
