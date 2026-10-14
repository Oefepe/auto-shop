'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api-client'
import { Bell, BellOff, CheckCheck, RefreshCw, Mail, AlertTriangle, Package, Settings } from 'lucide-react'

interface Notification {
  _id: string
  type: 'low_stock' | 'out_of_stock'
  sku: string
  available: number
  threshold: number
  channels_sent: string[]
  read: boolean
  created_at: string
}

interface GlobalConfig {
  email_recipients: string[]
  cooldown_hours: number
  email_enabled: boolean
  in_app_enabled: boolean
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [total, setTotal]                 = useState(0)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [tab, setTab]                     = useState<'alerts' | 'config' | 'smtp'>('alerts')

  // Config state
  const [config, setConfig]     = useState<GlobalConfig | null>(null)
  const [recipients, setRecipients] = useState('')
  const [cooldown, setCooldown] = useState('4')
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)

  // SMTP test state
  const [smtpStatus, setSmtpStatus]   = useState<{ connected: boolean; host?: string; user?: string } | null>(null)
  const [testEmail, setTestEmail]     = useState('')
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [testResult, setTestResult]   = useState<string | null>(null)

  async function loadNotifications() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<any>('/notifications?limit=50')
      setNotifications(res.data?.items ?? [])
      setUnreadCount(res.data?.unread_count ?? 0)
      setTotal(res.data?.total ?? 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadConfig() {
    try {
      const res = await api.get<any>('/notifications/config')
      const g = res.data?.global
      if (g) {
        setConfig(g)
        setRecipients((g.email_recipients ?? []).join(', '))
        setCooldown(String(g.cooldown_hours ?? 4))
        setEmailEnabled(g.email_enabled ?? true)
      }
    } catch { /* ignore */ }
  }

  async function loadSmtpStatus() {
    try {
      const res = await api.get<any>('/notifications/smtp/status')
      setSmtpStatus(res.data)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadNotifications()
    loadConfig()
    loadSmtpStatus()
  }, [])

  async function markAllRead() {
    await api.post('/notifications/read-all', {})
    await loadNotifications()
  }

  async function markRead(id: string) {
    await api.put(`/notifications/${id}/read`, {})
    setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function saveConfig() {
    setSavingConfig(true)
    try {
      await api.put('/notifications/config', {
        email_recipients: recipients.split(',').map(r => r.trim()).filter(Boolean),
        cooldown_hours: Number(cooldown),
        email_enabled: emailEnabled,
        in_app_enabled: true,
      })
      await loadConfig()
    } catch (e: any) {
      alert(`Failed to save: ${e.message}`)
    } finally {
      setSavingConfig(false)
    }
  }

  async function sendTestEmail() {
    if (!testEmail) return
    setTestingSmtp(true)
    setTestResult(null)
    try {
      await api.post('/notifications/smtp/test', { recipient: testEmail })
      setTestResult(`Test email sent to ${testEmail}`)
    } catch (e: any) {
      setTestResult(`Failed: ${e.message}`)
    } finally {
      setTestingSmtp(false)
    }
  }

  return (
    <div>
      <Header
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
      />

      <div className="p-6 space-y-4">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border pb-3">
          {[
            { key: 'alerts', label: 'Alerts', icon: Bell },
            { key: 'config', label: 'Configuration', icon: Settings },
            { key: 'smtp',   label: 'SMTP',          icon: Mail },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {key === 'alerts' && unreadCount > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Alerts tab ── */}
        {tab === 'alerts' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{total} total alerts</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadNotifications}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                </Button>
                {unreadCount > 0 && (
                  <Button variant="outline" size="sm" onClick={markAllRead}>
                    <CheckCheck className="h-4 w-4 mr-2" /> Mark all read
                  </Button>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {error} — Make sure the notification service is running.
              </div>
            )}

            <div className="space-y-2">
              {!loading && notifications.length === 0 && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <BellOff className="h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground text-sm">No alerts yet. Low-stock events will appear here.</p>
                  </CardContent>
                </Card>
              )}

              {notifications.map(n => (
                <div
                  key={n._id}
                  className={`flex items-start justify-between rounded-xl border p-4 transition-colors ${
                    n.read
                      ? 'border-border bg-card opacity-60'
                      : n.type === 'out_of_stock'
                      ? 'border-red-500/30 bg-red-500/5'
                      : 'border-yellow-500/30 bg-yellow-500/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-1.5 ${n.type === 'out_of_stock' ? 'bg-red-500/15' : 'bg-yellow-500/15'}`}>
                      {n.type === 'out_of_stock'
                        ? <Package className="h-4 w-4 text-red-400" />
                        : <AlertTriangle className="h-4 w-4 text-yellow-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{n.sku}</span>
                        <Badge variant={n.type === 'out_of_stock' ? 'destructive' : 'warning'} className="text-xs">
                          {n.type === 'out_of_stock' ? 'Out of Stock' : 'Low Stock'}
                        </Badge>
                        {!n.read && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {n.available} available · threshold {n.threshold} · {formatDate(n.created_at)}
                      </p>
                      {n.channels_sent.length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {n.channels_sent.map(c => (
                            <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {!n.read && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => markRead(n._id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Config tab ── */}
        {tab === 'config' && (
          <div className="max-w-lg space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Global Alert Settings</CardTitle>
                <CardDescription>Applied to all SKUs unless a per-SKU override exists.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-1.5">Email Recipients</label>
                  <Input
                    placeholder="admin@shop.com, ops@shop.com"
                    value={recipients}
                    onChange={e => setRecipients(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Comma-separated email addresses.</p>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1.5">Cooldown (hours)</label>
                  <Input
                    type="number" min="0" max="168"
                    value={cooldown}
                    onChange={e => setCooldown(e.target.value)}
                    className="w-28"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Wait this many hours before re-alerting for the same SKU.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="email-enabled"
                    checked={emailEnabled}
                    onChange={e => setEmailEnabled(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <label htmlFor="email-enabled" className="text-sm">Send email alerts</label>
                </div>

                <Button onClick={saveConfig} disabled={savingConfig}>
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── SMTP tab ── */}
        {tab === 'smtp' && (
          <div className="max-w-lg space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">SMTP Connection</CardTitle>
                <CardDescription>Configure via SMTP_* variables in notification-service .env</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {smtpStatus && (
                  <div className={`flex items-center gap-2 rounded-lg border p-3 ${smtpStatus.connected ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <span className={`h-2 w-2 rounded-full ${smtpStatus.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="text-sm font-medium">{smtpStatus.connected ? 'Connected' : 'Not connected'}</span>
                    {smtpStatus.host && (
                      <span className="text-xs text-muted-foreground ml-auto">{smtpStatus.host} · {smtpStatus.user}</span>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium block mb-1.5">Send Test Email</label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={testEmail}
                      onChange={e => setTestEmail(e.target.value)}
                    />
                    <Button onClick={sendTestEmail} disabled={testingSmtp || !testEmail} variant="outline">
                      {testingSmtp ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                  {testResult && (
                    <p className={`text-xs mt-2 ${testResult.startsWith('Failed') ? 'text-destructive' : 'text-emerald-400'}`}>
                      {testResult}
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground mb-2">Required .env variables:</p>
                  <p><code>SMTP_HOST</code> — e.g. smtp.gmail.com</p>
                  <p><code>SMTP_PORT</code> — 587 (TLS) or 465 (SSL)</p>
                  <p><code>SMTP_USER</code> — your email address</p>
                  <p><code>SMTP_PASS</code> — app password (not your regular password)</p>
                  <p><code>ALERT_RECIPIENTS</code> — comma-separated default recipients</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
