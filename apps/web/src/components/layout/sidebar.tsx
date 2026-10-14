'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Package, BarChart3, ShoppingCart, Settings, Layers, Bell, LogOut, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { api, authApi } from '@/lib/api-client'

const navItems = [
  { href: '/',               label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/products',       label: 'Products',      icon: Package },
  { href: '/inventory',      label: 'Inventory',     icon: Layers },
  { href: '/orders',         label: 'Orders',        icon: ShoppingCart },
  { href: '/notifications',  label: 'Notifications', icon: Bell, badge: true },
  { href: '/reports',        label: 'Reports',       icon: BarChart3 },
  { href: '/integrations',   label: 'Integrations',  icon: Plug },
  { href: '/settings',       label: 'Settings',      icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState(0)

  function handleLogout() {
    authApi.logout()
    router.push('/login')
  }

  useEffect(() => {
    api.get<{ success: boolean; data: { count: number } }>('/notifications/unread-count')
      .then(res => setUnreadCount(res.data?.count ?? 0))
      .catch(() => {})

    // Poll every 60 seconds
    const interval = setInterval(() => {
      api.get<{ success: boolean; data: { count: number } }>('/notifications/unread-count')
        .then(res => setUnreadCount(res.data?.count ?? 0))
        .catch(() => {})
    }, 60_000)

    return () => clearInterval(interval)
  }, [])

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
          <Layers className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold tracking-tight">Auto-Shop</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href
          const showBadge = badge && unreadCount > 0

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {showBadge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4 space-y-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
        <p className="text-xs text-muted-foreground px-3">v0.1.0 — Phase 6</p>
      </div>
    </aside>
  )
}
