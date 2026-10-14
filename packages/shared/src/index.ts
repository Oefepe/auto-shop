// ── Types ────────────────────────────────────────────────────────────────────

export interface MarketplaceIds {
  mercado_livre?: string;
  meta?: string;
}

export interface Product {
  _id?: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  attributes: Record<string, unknown>;
  images: string[];
  marketplace_ids: MarketplaceIds;
  price: number;
  currency: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface StockLevel {
  _id?: string;
  sku: string;
  quantity: number;
  reserved: number;
  available: number;
  low_stock_threshold: number;
  location: string;
  updated_at?: Date;
}

export type StockMovementReason = 'sale' | 'restock' | 'adjustment' | 'return';
export type StockMovementSource = 'mercado_livre' | 'meta' | 'pos' | 'manual';

export interface StockMovement {
  _id?: string;
  sku: string;
  delta: number;
  reason: StockMovementReason;
  source: StockMovementSource;
  order_id?: string;
  created_at?: Date;
}

export interface User {
  _id?: string;
  name: string;
  email: string;
  role: 'admin' | 'operator';
  created_at?: Date;
}

// ── API Helpers ───────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Request payloads ──────────────────────────────────────────────────────────

export interface CreateProductPayload {
  sku: string;
  name: string;
  description?: string;
  category: string;
  attributes?: Record<string, unknown>;
  images?: string[];
  marketplace_ids?: MarketplaceIds;
  price: number;
  currency?: string;
}

export interface UpdateProductPayload extends Partial<CreateProductPayload> {
  is_active?: boolean;
}

export interface AdjustStockPayload {
  delta: number;
  reason: StockMovementReason;
  source?: StockMovementSource;
  order_id?: string;
}

export interface InitializeStockPayload {
  sku: string;
  quantity: number;
  low_stock_threshold?: number;
  location?: string;
}

// ── Order types ───────────────────────────────────────────────────────────────

export type OrderSource = 'pos' | 'mercado_livre' | 'meta' | 'manual'
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'cancelled'

export interface OrderItem {
  sku: string
  name: string
  qty: number
  unit_price: number
}

export interface Order {
  _id?: string
  order_id: string
  source: OrderSource
  external_order_id?: string
  status: OrderStatus
  customer: {
    name?: string
    email?: string
    document?: string
  }
  items: OrderItem[]
  total: number
  currency: string
  stock_deducted: boolean
  idempotency_key: string
  created_at?: Date
  updated_at?: Date
}

export interface CreateOrderPayload {
  source: OrderSource
  external_order_id?: string
  idempotency_key?: string
  customer?: { name?: string; email?: string; document?: string }
  items: OrderItem[]
  currency?: string
}

export interface CreateSalePayload {
  idempotency_key?: string
  cashier_id?: string
  customer?: { name?: string }
  items: OrderItem[]
  currency?: string
}

// ── RabbitMQ event payloads ───────────────────────────────────────────────────

export interface OrderCreatedEvent {
  order_id: string
  source: OrderSource
  idempotency_key: string
  items: OrderItem[]
}

export interface StockUpdatedEvent {
  sku: string
  quantity: number
  available: number
  source: string
  order_id?: string
}

export interface StockLowEvent {
  sku: string
  available: number
  threshold: number
}

// ── Mercado Livre types ───────────────────────────────────────────────────────

export interface MLSyncLog {
  _id?: string
  event_type: 'stock_push' | 'order_received' | 'listing_paused' | 'listing_activated'
  sku?: string
  ml_item_id?: string
  order_id?: string
  payload: Record<string, unknown>
  status: 'success' | 'failed' | 'skipped'
  attempts: number
  error?: string
  created_at?: Date
}

export interface MLStatus {
  connected: boolean
  user_id?: string
  expires_at?: Date
  auth_url?: string
  user?: { id: number; nickname: string; email: string }
  error?: string
  mode?: 'oauth' | 'direct_token'
}

// ── Meta Marketplace types ────────────────────────────────────────────────────

export interface MetaSyncLog {
  _id?: string
  event_type: 'stock_push' | 'order_received' | 'catalog_update' | 'listing_unavailable'
  sku?: string
  retailer_id?: string
  order_id?: string
  payload: Record<string, unknown>
  status: 'success' | 'failed' | 'skipped'
  attempts: number
  error?: string
  created_at?: Date
}

export interface MetaStatus {
  connected: boolean
  user?: { id: string; name: string }
  catalog_id?: string | null
  catalog_ready?: boolean
  consumer_active?: boolean
  error?: string
}

export interface MetaCatalogProduct {
  id: string
  retailer_id: string
  name: string
  availability: string
  quantity: number
}

// ── Notification types ────────────────────────────────────────────────────────

export type NotificationType    = 'low_stock' | 'out_of_stock'
export type NotificationChannel = 'email' | 'in_app'

export interface AppNotification {
  _id?: string
  type: NotificationType
  sku: string
  available: number
  threshold: number
  channels_sent: NotificationChannel[]
  email_recipients: string[]
  read: boolean
  created_at?: Date
}

export interface NotificationConfig {
  _id?: string
  sku: string | null
  email_recipients: string[]
  cooldown_hours: number
  email_enabled: boolean
  in_app_enabled: boolean
  updated_at?: Date
}

// ── Reporting types ───────────────────────────────────────────────────────────

export interface SalesSummary {
  total_orders: number
  total_revenue: number
  total_products: number
  total_stock: number
  low_stock_count: number
  orders_by_source: Array<{ source: string; count: number; revenue: number }>
}

export interface SalesByDay {
  date: string
  total_revenue: number
  total_orders: number
  by_source: Array<{ source: string; revenue: number; orders: number }>
}

export interface ChannelSales {
  source: string
  total_revenue: number
  total_orders: number
  avg_order_value: number
}

export interface TopProduct {
  sku: string
  name: string
  total_qty: number
  total_revenue: number
  order_count: number
}

export interface StockSnapshotItem {
  sku: string
  name: string
  category: string
  quantity: number
  reserved: number
  available: number
  threshold: number
  unit_price: number
  stock_value: number
  status: 'ok' | 'low_stock' | 'out_of_stock'
  location: string
}

export interface TurnoverItem {
  sku: string
  units_sold: number
  current_stock: number
  turnover_rate: number | null
}
