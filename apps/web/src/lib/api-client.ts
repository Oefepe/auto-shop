const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// Auth helpers
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ success: boolean; data: { access_token: string; refresh_token: string; user: { name: string; email: string; role: string } } }>(
      '/auth/login', { email, password }
    ),
  register: (name: string, email: string, password: string) =>
    api.post<{ success: boolean; data: { id: string; name: string; email: string; role: string } }>(
      '/auth/register', { name, email, password }
    ),
  me: () => api.get<{ success: boolean; data: { name: string; email: string; role: string } }>('/auth/me'),
  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  },
}

export const productsApi = {
  list: (params?: { page?: number; limit?: number; category?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<{ success: boolean; data: { items: unknown[]; total: number; pages: number } }>(
      `/products${qs ? `?${qs}` : ''}`
    )
  },
  get: (sku: string) => api.get(`/products/${sku}`),
  create: (body: unknown) => api.post('/products', body),
  update: (sku: string, body: unknown) => api.put(`/products/${sku}`, body),
  delete: (sku: string) => api.delete(`/products/${sku}`),
}

export interface MLCatalogItem {
  id: string
  title: string
  available_quantity: number
  status: string
  seller_sku?: string
  price?: number
  currency_id?: string
  pictures?: Array<{ url: string }>
}

export interface MetaCatalogItem {
  id: string
  retailer_id: string
  name: string
  availability: string
  quantity: number
}

export const marketplaceApi = {
  mlCatalog: () =>
    api.get<{ success: boolean; data: MLCatalogItem[] }>('/ml/catalog'),
  metaCatalog: () =>
    api.get<{ success: boolean; data: { data: MetaCatalogItem[] } }>('/meta/catalog'),
}

export const integrationsApi = {
  // Mercado Livre
  mlStatus: () => api.get<{ success: boolean; data: { connected: boolean; user?: { id: number; nickname: string }; mode?: string; auth_url?: string; error?: string } }>('/ml/status'),
  mlMe: () => api.get<{ success: boolean; data: { connected: boolean; user?: { id: number; nickname: string }; mode?: string } }>('/ml/me'),
  mlDisconnect: () => api.delete<{ success: boolean }>('/ml/disconnect'),

  // Meta
  metaMe: () => api.get<{ success: boolean; data: { connected: boolean; user?: { id: string; name: string }; catalog_id?: string; catalog_name?: string; mode?: string; error?: string } }>('/meta/me'),
  metaCatalogs: () => api.get<{ success: boolean; data: Array<{ id: string; name: string; business_name: string; business_id: string }> }>('/meta/catalogs'),
  metaSelectCatalog: (catalog_id: string, catalog_name: string) => api.post<{ success: boolean }>('/meta/catalog/select', { catalog_id, catalog_name }),
  metaDisconnect: () => api.delete<{ success: boolean }>('/meta/disconnect'),
}

export const inventoryApi = {
  list: (params?: { page?: number; low_stock?: boolean }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return api.get<{ success: boolean; data: { items: unknown[]; total: number; pages: number } }>(
      `/stock${qs ? `?${qs}` : ''}`
    )
  },
  get: (sku: string) => api.get(`/stock/${sku}`),
  initialize: (body: unknown) => api.post('/stock', body),
  adjust: (sku: string, body: unknown) => api.post(`/stock/${sku}/adjust`, body),
  movements: (sku: string) => api.get(`/stock/${sku}/movements`),
}
