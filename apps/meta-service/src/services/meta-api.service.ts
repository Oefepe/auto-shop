const META_BASE = 'https://graph.facebook.com/v21.0'

import { getStoredAuth } from './auth.service.js'

function makeRequester(getToken: () => Promise<string>) {
  return async function metaRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await getToken()
    const separator = path.includes('?') ? '&' : '?'
    const url = `${META_BASE}${path}${separator}access_token=${token}`

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options?.headers,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Meta API ${options?.method ?? 'GET'} ${path} → ${res.status}: ${body}`)
    }

    return res.json() as Promise<T>
  }
}

export interface MetaUser    { id: string; name: string }
export interface MetaCatalog { id: string; name: string }
export interface MetaBusiness { id: string; name: string }

export interface MetaProduct {
  id: string
  retailer_id: string
  name: string
  availability: string
  quantity: number
}

export interface MetaOrderItem {
  retailer_id: string
  quantity: number
  price_per_unit: { amount: string; currency: string }
  name: string
}

export interface MetaCommerceOrder {
  id: string
  buyer_details?: { name?: string; email?: string }
  order_status: { state: string }
  items: { data: MetaOrderItem[] }
  selected_shipping_option?: { price: { amount: string; currency: string } }
  estimated_payment_details?: { total_amount: { amount: string; currency: string } }
}

export interface BatchUpdateResult { handles: string[] }

function buildApi(request: ReturnType<typeof makeRequester>) {
  return {
    getMe(): Promise<MetaUser> {
      return request('/me?fields=id,name')
    },

    async getAllCatalogs(): Promise<Array<MetaCatalog & { business_name: string; business_id: string }>> {
      // catalog_management scope gives access to /me/owned_product_catalogs directly.
      // business_management (requires App Review) would be needed for /me/businesses.
      const res = await request<{ data: MetaCatalog[] }>('/me/owned_product_catalogs?fields=id,name')
      return (res.data ?? []).map(cat => ({
        ...cat,
        business_name: 'My Catalogs',
        business_id: '',
      }))
    },

    async getCatalogProducts(catalogId: string, limit = 50): Promise<{ data: MetaProduct[] }> {
      return request(`/${catalogId}/product_items?fields=id,retailer_id,name,availability,quantity&limit=${limit}`)
    },

    batchUpdateStock(catalogId: string, updates: Array<{ retailer_id: string; quantity: number }>): Promise<BatchUpdateResult> {
      const requests = updates.map(u => ({
        method: 'UPDATE',
        retailer_id: u.retailer_id,
        data: {
          availability: u.quantity > 0 ? 'in stock' : 'out of stock',
          quantity: u.quantity,
        },
      }))
      return request(`/${catalogId}/items_batch`, {  // correct batch endpoint
        method: 'POST',
        body: JSON.stringify({ requests }),
      })
    },

    getOrder(orderId: string): Promise<MetaCommerceOrder> {
      return request(`/${orderId}?fields=id,buyer_details,order_status,items{retailer_id,quantity,price_per_unit,name},estimated_payment_details`)
    },
  }
}

/** Create a Meta API client scoped to a system user (resolves token from DB) */
export function createMetaApi(ownerId: string) {
  return buildApi(makeRequester(async () => {
    const auth = await getStoredAuth(ownerId)
    if (!auth?.access_token) {
      throw new Error('Meta is not connected for this account. Visit /integrations to connect.')
    }
    return auth.access_token
  }))
}

/** Create a Meta API client with an explicit access token (e.g. webhook context) */
export function createMetaApiWithToken(accessToken: string) {
  return buildApi(makeRequester(async () => accessToken))
}
