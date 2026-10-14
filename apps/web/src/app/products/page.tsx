'use client'

import { useEffect, useRef, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { productsApi, inventoryApi } from '@/lib/api-client'
import { Plus, RefreshCw, ImageOff, Upload, Link as LinkIcon, X, Download } from 'lucide-react'
import { ImportProductsModal } from '@/components/products/import-products-modal'

interface Product {
  _id: string
  sku: string
  name: string
  description?: string
  category: string
  price: number
  currency: string
  is_active: boolean
  images?: string[]
  attributes?: Record<string, unknown>
}

const EMPTY_FORM = {
  sku: '',
  name: '',
  description: '',
  category: '',
  price: '',
  currency: 'BRL',
  image: '',
  width: '',
  height: '',
  depth: '',
  weight: '',
  quantity: '',
  low_stock_threshold: '5',
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    />
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [imageMode, setImageMode] = useState<'upload' | 'url'>('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await productsApi.list({ page: 1, limit: 50 }) as any
      setProducts(res.data.items as Product[])
      setTotal(res.data.total)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function set(key: keyof typeof EMPTY_FORM) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  function openModal() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setImageMode('upload')
    setOpen(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm(f => ({ ...f, image: reader.result as string }))
    reader.readAsDataURL(file)
  }

  function clearImage() {
    setForm(f => ({ ...f, image: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)

    try {
      const attributes: Record<string, unknown> = {}
      if (form.width)  attributes.width  = form.width
      if (form.height) attributes.height = form.height
      if (form.depth)  attributes.depth  = form.depth
      if (form.weight) attributes.weight = form.weight

      // 1. Create product
      await productsApi.create({
        sku: form.sku,
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        price: parseFloat(form.price),
        currency: form.currency,
        images: form.image ? [form.image] : undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined,
      })

      // 2. Initialize stock
      if (form.quantity) {
        await inventoryApi.initialize({
          sku: form.sku,
          quantity: parseInt(form.quantity, 10),
          low_stock_threshold: form.low_stock_threshold
            ? parseInt(form.low_stock_threshold, 10)
            : 5,
        })
      }

      setOpen(false)
      await load()
    } catch (e: any) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Header title="Products" description={`${total} total products in catalog`} />

      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : `Showing ${products.length} products`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Download className="h-4 w-4 mr-2" /> Import
            </Button>
            <Button size="sm" onClick={openModal}>
              <Plus className="h-4 w-4 mr-2" /> Add Product
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground w-10"></th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Price</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No products yet. Add your first product to get started.
                    </td>
                  </tr>
                )}
                {products.map((p) => (
                  <tr key={p._id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.name} className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <ImageOff className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{p.category}</td>
                    <td className="px-4 py-3">{p.currency} {p.price.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={p.is_active ? 'success' : 'secondary'}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Import Products Modal */}
      <ImportProductsModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={load}
      />

      {/* Add Product Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Fill in the product details. Fields marked * are required.</DialogDescription>
          </DialogHeader>

          <form id="add-product-form" onSubmit={handleSubmit}>
            <div className="px-6 py-4 space-y-5">

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="SKU" required>
                  <Input value={form.sku} onChange={set('sku')} required placeholder="e.g. PROD-001" />
                </Field>
                <Field label="Category" required>
                  <Input value={form.category} onChange={set('category')} required placeholder="e.g. electronics" />
                </Field>
              </div>

              <Field label="Product Name" required>
                <Input value={form.name} onChange={set('name')} required placeholder="e.g. Wireless Headphones" />
              </Field>

              <Field label="Description">
                <Input value={form.description} onChange={set('description')} placeholder="Short product description" />
              </Field>

              {/* Price */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Field label="Price" required>
                    <Input value={form.price} onChange={set('price')} required type="number" min="0" step="0.01" placeholder="0.00" />
                  </Field>
                </div>
                <Field label="Currency">
                  <Input value={form.currency} onChange={set('currency')} placeholder="BRL" />
                </Field>
              </div>

              {/* Dimensions */}
              <div>
                <p className="text-sm font-medium mb-2">Dimensions <span className="text-muted-foreground font-normal">(optional)</span></p>
                <div className="grid grid-cols-4 gap-3">
                  <Field label="Width (cm)">
                    <Input value={form.width} onChange={set('width')} type="number" min="0" step="0.1" placeholder="0" />
                  </Field>
                  <Field label="Height (cm)">
                    <Input value={form.height} onChange={set('height')} type="number" min="0" step="0.1" placeholder="0" />
                  </Field>
                  <Field label="Depth (cm)">
                    <Input value={form.depth} onChange={set('depth')} type="number" min="0" step="0.1" placeholder="0" />
                  </Field>
                  <Field label="Weight (kg)">
                    <Input value={form.weight} onChange={set('weight')} type="number" min="0" step="0.001" placeholder="0.000" />
                  </Field>
                </div>
              </div>

              {/* Image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Image</label>
                  <div className="flex rounded-md border border-input overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => { setImageMode('upload'); clearImage() }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${imageMode === 'upload' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImageMode('url'); clearImage() }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${imageMode === 'url' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      <LinkIcon className="h-3 w-3" /> URL
                    </button>
                  </div>
                </div>

                {imageMode === 'upload' ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Upload className="h-6 w-6" />
                    <span>Click to select an image</span>
                    <span className="text-xs">PNG, JPG, WEBP up to 5 MB</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                ) : (
                  <Input
                    value={form.image}
                    onChange={set('image')}
                    type="url"
                    placeholder="https://example.com/image.jpg"
                  />
                )}

                {form.image && (
                  <div className="relative inline-block">
                    <img
                      src={form.image}
                      alt="preview"
                      className="h-24 w-24 rounded-lg object-cover border border-border"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Stock */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium">Initial Stock</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Initial Quantity">
                    <Input value={form.quantity} onChange={set('quantity')} type="number" min="0" step="1" placeholder="0" />
                  </Field>
                  <Field label="Low Stock Threshold">
                    <Input value={form.low_stock_threshold} onChange={set('low_stock_threshold')} type="number" min="0" step="1" placeholder="5" />
                  </Field>
                </div>
              </div>

              {formError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="add-product-form" disabled={saving}>
              {saving ? 'Saving…' : 'Add Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
