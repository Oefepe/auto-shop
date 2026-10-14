'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  const isLoginPage = pathname === '/login'

  useEffect(() => {
    if (!isLoginPage) {
      const token = localStorage.getItem('access_token')
      if (!token) {
        router.replace('/login')
        return
      }
    }
    setChecked(true)
  }, [pathname, isLoginPage, router])

  if (isLoginPage) return <>{children}</>
  if (!checked) return null

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
