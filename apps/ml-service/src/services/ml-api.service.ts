import { getValidAccessToken } from './token.service.js'

const ML_BASE = 'https://api.mercadolibre.com'

function makeRequester(getToken: () => Promise<string>) {
  return async function mlRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const token = await getToken()
    const res = await fetch(`${ML_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options?.headers,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`ML API ${options?.method ?? 'GET'} ${path} → ${res.status}: ${body}`)
    }

    return res.json() as Promise<T>
  }
}

export interface MLUser {
  id: number
  nickname: string
  email: string
  country_id: string
}

export interface MLOrder {
  id: number
  status: string
  date_created: string
  buyer: { id: number; nickname: string; email?: string }
  order_items: Array<{
    item: { id: string; title: string; seller_sku?: string }
    quantity: number
    unit_price: number
    currency_id: string
  }>
  total_amount: number
  currency_id: string
}

export interface MLItem {
  id: string
  title: string
  available_quantity: number
  status: string
  seller_sku?: string
  price?: number
  currency_id?: string
  pictures?: Array<{ url: string }>
  attributes?: Array<{ id: string; name: string; value_name: string | null }>
}

export interface MLItemSearchResult {
  seller_id: number
  results: string[]
  paging: { total: number; offset: number; limit: number }
}

function buildApi(request: ReturnType<typeof makeRequester>) {
  return {
    getMe(): Promise<MLUser> {
      return request('/users/me')
    },

    async listSellerItems(limit = 50): Promise<MLItem[]> {
      const user = await request<MLUser>('/users/me')
      const search = await request<MLItemSearchResult>(
        `/users/${user.id}/items/search?status=active&limit=${limit}`,
      )
      if (!search.results.length) return []
      const ids = search.results.slice(0, 20).join(',')
      return request<MLItem[]>(`/items?ids=${ids}`)
    },

    getOrder(orderId: string | number): Promise<MLOrder> {
      return request(`/orders/${orderId}`)
    },

    getItem(itemId: string): Promise<MLItem> {
      return request(`/items/${itemId}`)
    },

    updateStock(itemId: string, availableQty: number): Promise<MLItem> {
      return request(`/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ available_quantity: availableQty }),
      })
    },

    pauseListing(itemId: string): Promise<MLItem> {
      return request(`/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'paused' }),
      })
    },

    activateListing(itemId: string): Promise<MLItem> {
      return request(`/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'active' }),
      })
    },
  }
}

/** Create an ML API client scoped to a specific system user */
export function createMlApi(ownerId: string) {
  return buildApi(makeRequester(() => getValidAccessToken(ownerId)))
}

/** Create an ML API client with an explicit access token (e.g. from webhook context) */
export function createMlApiWithToken(accessToken: string) {
  return buildApi(makeRequester(async () => accessToken))
}
