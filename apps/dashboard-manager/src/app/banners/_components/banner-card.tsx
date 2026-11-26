'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminBanner } from '@/lib/banners'
import { BannerForm } from './banner-form'
import { formaterInstant } from '@/lib/dates'

// A single banner in the backoffice list: status + metadata, a FR/EN content
// preview and the row actions (toggle active, edit inline, delete). Status is
// computed server-side and passed in so this client component pulls no
// server-only code.

type Status = 'live' | 'scheduled' | 'expired' | 'inactive'

const STATUS_LABEL: Record<Status, string> = {
  live: 'En ligne',
  scheduled: 'Programmé',
  expired: 'Expiré',
  inactive: 'Inactif',
}

const STATUS_COLOR: Record<Status, string> = {
  live: 'var(--green)',
  scheduled: 'var(--amber)',
  expired: 'var(--muted)',
  inactive: 'var(--muted)',
}

const VARIANT_COLOR: Record<string, string> = {
  info: 'var(--accent)',
  success: 'var(--green)',
  warning: 'var(--amber)',
  critical: 'var(--red)',
}

// ⚠️ COMPOSANT CLIENT : sans fuseau, cette date s'écrivait différemment au
// serveur et au navigateur — écart d'hydratation mesuré sur `/banners`.
const fmt = (iso: string | null): string =>
  formaterInstant(iso, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export function BannerCard({ banner, status }: { banner: AdminBanner; status: Status }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const color = VARIANT_COLOR[banner.variant] ?? 'var(--accent)'

  async function mutate(url: string, method: 'PATCH' | 'DELETE', body?: unknown) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        setError(data.error ?? data.message ?? `HTTP ${res.status}`)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function toggle() {
    void mutate(`/api/admin/banners/${encodeURIComponent(banner.id)}/toggle`, 'PATCH', { active: !banner.active })
  }

  function remove() {
    if (!window.confirm('Supprimer définitivement ce bandeau ?')) return
    void mutate(`/api/admin/banners/${encodeURIComponent(banner.id)}`, 'DELETE')
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 10, borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          className="badge"
          style={{
            color: STATUS_COLOR[status],
            borderColor: `color-mix(in srgb, ${STATUS_COLOR[status]} 35%, transparent)`,
          }}
        >
          {STATUS_LABEL[status]}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {banner.kind} · {banner.variant}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {banner.placement} · {banner.audience} · priorité {banner.priority} ·{' '}
          {banner.dismissible ? 'fermable' : 'permanent'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>v{banner.version}</span>
      </div>

      <div>
        <div style={{ fontWeight: 600 }}>{banner.titleFr}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{banner.titleEn}</div>
        {banner.bodyFr ? <div style={{ fontSize: 13, marginTop: 4 }}>{banner.bodyFr}</div> : null}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Fenêtre : {fmt(banner.startsAt)} → {fmt(banner.endsAt)}
        {banner.ctaUrl ? (
          <>
            {' '}
            · CTA :{' '}
            <a className="link" href={banner.ctaUrl} target="_blank" rel="noreferrer">
              {banner.ctaLabelFr ?? banner.ctaUrl}
            </a>
          </>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-sm" onClick={toggle} disabled={busy}>
          {banner.active ? 'Désactiver' : 'Activer'}
        </button>
        <button className="btn-sm" onClick={() => setEditing(v => !v)} disabled={busy}>
          {editing ? 'Fermer' : 'Modifier'}
        </button>
        <button className="btn-sm" onClick={remove} disabled={busy} style={{ color: 'var(--red)' }}>
          Supprimer
        </button>
        {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
      </div>

      {editing ? (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <BannerForm mode="edit" initial={banner} />
        </div>
      ) : null}
    </div>
  )
}
