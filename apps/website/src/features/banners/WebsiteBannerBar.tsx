'use client'

import { useEffect, useState, type CSSProperties } from 'react'

// Public marketing-site banner bar. Renders the website-placement banners the
// same way the app does: stacked in priority order (as returned by the API),
// styled per variant, bilingual (the viewer's locale), with a CTA link and a
// per-banner dismiss persisted in localStorage keyed by `id:version` — so a
// re-published banner (new version) reappears. Non-dismissible banners always
// show. Banners are fetched server-side (WebsiteBanners) and passed in as props
// to avoid a browser→API CORS dependency.

export type WebsitePublicBanner = {
  id: string
  kind: 'announcement' | 'maintenance' | 'offer'
  variant: 'info' | 'success' | 'warning' | 'critical'
  title: { fr: string; en: string }
  body: { fr: string; en: string }
  cta: { label: { fr: string; en: string }; url: string } | null
  dismissible: boolean
  priority: number
  version: number
}

const VARIANT_COLOR: Record<WebsitePublicBanner['variant'], string> = {
  info: '#6d5efc',
  success: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
}

const DISMISS_LABEL: Record<'fr' | 'en', string> = {
  fr: 'Fermer l’annonce',
  en: 'Dismiss announcement',
}

function normalizeLocale(locale: string): 'fr' | 'en' {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

function storageKey(id: string, version: number): string {
  return `bellum:banner-dismissed:${id}:${version}`
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  fontSize: 14,
  color: '#f5f5f7',
  borderBottom: '1px solid',
}

export function WebsiteBannerBar({ banners, locale }: { banners: WebsitePublicBanner[]; locale: string }) {
  const lang = normalizeLocale(locale)
  // Start with nothing dismissed so the client's first render matches SSR
  // (no hydration mismatch); after mount, hide anything already dismissed.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    const alreadyDismissed = new Set<string>()
    for (const b of banners) {
      if (!b.dismissible) continue
      try {
        if (window.localStorage.getItem(storageKey(b.id, b.version)) === '1') {
          alreadyDismissed.add(`${b.id}:${b.version}`)
        }
      } catch {
        /* ignore storage errors */
      }
    }
    if (alreadyDismissed.size > 0) setDismissed(alreadyDismissed)
  }, [banners])

  const visible = banners.filter(b => !(b.dismissible && dismissed.has(`${b.id}:${b.version}`)))
  if (visible.length === 0) return null

  const handleDismiss = (b: WebsitePublicBanner) => {
    try {
      window.localStorage.setItem(storageKey(b.id, b.version), '1')
    } catch {
      /* ignore */
    }
    setDismissed(prev => new Set(prev).add(`${b.id}:${b.version}`))
  }

  return (
    <div role="region" aria-label={lang === 'en' ? 'Announcements' : 'Annonces'}>
      {visible.map(b => {
        const color = VARIANT_COLOR[b.variant]
        const title = b.title[lang]
        const body = b.body[lang]
        const cta = b.cta ? { url: b.cta.url, label: b.cta.label[lang] } : null
        return (
          <div
            key={b.id}
            role="status"
            style={{
              ...rowStyle,
              borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${color} 16%, #0a0a10)`,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{title}</span>
              {body ? <span style={{ marginLeft: 8, color: '#c7c7cf' }}>{body}</span> : null}
            </div>
            {cta ? (
              <a href={cta.url} style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {cta.label} →
              </a>
            ) : null}
            {b.dismissible ? (
              <button
                type="button"
                aria-label={DISMISS_LABEL[lang]}
                onClick={() => handleDismiss(b)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9a9aa5',
                  cursor: 'pointer',
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
