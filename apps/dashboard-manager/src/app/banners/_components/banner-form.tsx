'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import type { AdminBanner } from '@/lib/banners'
import { bannerFormCanSubmit } from './banner-form-validation'
import { BannerPreview } from './banner-preview'

// Create / edit form for an admin-scheduled banner. Bilingual content (FR + EN),
// kind + variant, placement + audience, a scheduling window, dismissible flag,
// priority and active toggle — plus a live preview per locale. Submits to the
// DM route handlers (server-side proxy with the internal secret); the API
// re-validates everything with Zod.

const KINDS = [
  { value: 'announcement', label: 'Annonce' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'offer', label: 'Offre / promo' },
] as const

// #1667.2a — la couleur de chaque variante vit dans `banner-preview.logic.ts`
// (GA-26) : ce tableau ne la redéclare plus, il ne porte que le libellé.
const VARIANTS = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Succès' },
  { value: 'warning', label: 'Attention' },
  { value: 'critical', label: 'Critique' },
] as const

const PLACEMENTS = [
  { value: 'app', label: 'Application' },
  { value: 'website', label: 'Site public' },
  { value: 'both', label: 'Les deux' },
] as const

const AUDIENCES = [
  { value: 'all', label: 'Tout le monde' },
  { value: 'authenticated', label: 'Connectés' },
] as const

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const labelStyle: CSSProperties = { display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)' }
const fieldWrap: CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, 1fr)' }

export function BannerForm({ mode, initial }: { mode: 'create' | 'edit'; initial?: AdminBanner }) {
  const router = useRouter()
  const [kind, setKind] = useState(initial?.kind ?? 'announcement')
  const [variant, setVariant] = useState(initial?.variant ?? 'info')
  const [placement, setPlacement] = useState(initial?.placement ?? 'app')
  const [audience, setAudience] = useState(initial?.audience ?? 'all')
  const [titleFr, setTitleFr] = useState(initial?.titleFr ?? '')
  const [titleEn, setTitleEn] = useState(initial?.titleEn ?? '')
  const [bodyFr, setBodyFr] = useState(initial?.bodyFr ?? '')
  const [bodyEn, setBodyEn] = useState(initial?.bodyEn ?? '')
  const [ctaLabelFr, setCtaLabelFr] = useState(initial?.ctaLabelFr ?? '')
  const [ctaLabelEn, setCtaLabelEn] = useState(initial?.ctaLabelEn ?? '')
  const [ctaUrl, setCtaUrl] = useState(initial?.ctaUrl ?? '')
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt))
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt))
  const [dismissible, setDismissible] = useState(initial?.dismissible ?? true)
  const [priority, setPriority] = useState(String(initial?.priority ?? 0))
  const [active, setActive] = useState(initial?.active ?? true)
  const [previewLocale, setPreviewLocale] = useState<'fr' | 'en'>('fr')
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState('')

  // #1667.2 — endsAt est désormais une condition du bouton, pas seulement du
  // contrat : une bannière sans date de fin reste affichée aux clients pour
  // toujours. La décision vit dans `banner-form-validation.ts`, testée hors
  // JSX (l'environnement de test de ce paquet est `node`, pas jsdom).
  const canSubmit = bannerFormCanSubmit({ titleFr, titleEn, endsAt, state })

  async function submit() {
    if (!canSubmit) return
    setState('saving')
    setError('')
    const body = {
      kind,
      variant,
      placement,
      audience,
      titleFr: titleFr.trim(),
      titleEn: titleEn.trim(),
      bodyFr,
      bodyEn,
      ctaLabelFr: ctaLabelFr.trim() || null,
      ctaLabelEn: ctaLabelEn.trim() || null,
      ctaUrl: ctaUrl.trim() || null,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      dismissible,
      priority: Math.trunc(Number(priority) || 0),
      active,
    }
    const url = mode === 'create' ? '/api/admin/banners' : `/api/admin/banners/${encodeURIComponent(initial!.id)}`
    const method = mode === 'create' ? 'POST' : 'PATCH'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string | string[] }
      if (!res.ok) {
        setState('error')
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message
        setError(data.error ?? msg ?? `HTTP ${res.status}`)
        return
      }
      setState('idle')
      if (mode === 'create') {
        setTitleFr('')
        setTitleEn('')
        setBodyFr('')
        setBodyEn('')
        setCtaLabelFr('')
        setCtaLabelEn('')
        setCtaUrl('')
        setStartsAt('')
        setEndsAt('')
        setPriority('0')
      }
      router.refresh()
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const previewTitle = previewLocale === 'fr' ? titleFr : titleEn
  const previewBody = previewLocale === 'fr' ? bodyFr : bodyEn
  const previewCta = previewLocale === 'fr' ? ctaLabelFr : ctaLabelEn

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <label style={labelStyle}>
          Type
          <select value={kind} onChange={e => setKind(e.target.value as AdminBanner['kind'])}>
            {KINDS.map(k => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Style
          <select value={variant} onChange={e => setVariant(e.target.value as AdminBanner['variant'])}>
            {VARIANTS.map(v => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Emplacement
          <select value={placement} onChange={e => setPlacement(e.target.value as AdminBanner['placement'])}>
            {PLACEMENTS.map(p => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Audience
          <select value={audience} onChange={e => setAudience(e.target.value as AdminBanner['audience'])}>
            {AUDIENCES.map(a => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>
          Titre (FR) *
          <input value={titleFr} onChange={e => setTitleFr(e.target.value)} placeholder="1 crédit acheté = 1 offert" />
        </label>
        <label style={labelStyle}>
          Title (EN) *
          <input value={titleEn} onChange={e => setTitleEn(e.target.value)} placeholder="Buy 1 credit, get 1 free" />
        </label>
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>
          Corps (FR)
          <textarea value={bodyFr} onChange={e => setBodyFr(e.target.value)} rows={2} />
        </label>
        <label style={labelStyle}>
          Body (EN)
          <textarea value={bodyEn} onChange={e => setBodyEn(e.target.value)} rows={2} />
        </label>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <label style={labelStyle}>
          CTA libellé (FR)
          <input value={ctaLabelFr} onChange={e => setCtaLabelFr(e.target.value)} placeholder="Voir l’offre" />
        </label>
        <label style={labelStyle}>
          CTA label (EN)
          <input value={ctaLabelEn} onChange={e => setCtaLabelEn(e.target.value)} placeholder="See the offer" />
        </label>
        <label style={labelStyle}>
          CTA URL
          <input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="https://bellum-ai.com/…" />
        </label>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'end' }}>
        <label style={labelStyle}>
          Début (optionnel)
          <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
        </label>
        <label style={labelStyle}>
          {/* #1667.2 — obligatoire : une bannière sans date de fin reste
              affichée aux clients pour toujours. Le contrat (`endsAt` dans
              `createBannerSchema`/`updateBannerSchema`) refuse maintenant une
              valeur absente ou nulle à l'écriture — les bannières déjà en
              base sans fin continuent de se LIRE normalement. */}
          Fin *
          <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        </label>
        <label style={labelStyle}>
          Priorité
          <input type="number" value={priority} onChange={e => setPriority(e.target.value)} />
        </label>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={dismissible} onChange={e => setDismissible(e.target.checked)} />
            Fermable
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            Actif
          </label>
        </div>
      </div>

      {/* Preview */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Aperçu</span>
          <button
            type="button"
            className="btn-sm"
            style={{ opacity: previewLocale === 'fr' ? 1 : 0.5 }}
            onClick={() => setPreviewLocale('fr')}
          >
            FR
          </button>
          <button
            type="button"
            className="btn-sm"
            style={{ opacity: previewLocale === 'en' ? 1 : 0.5 }}
            onClick={() => setPreviewLocale('en')}
          >
            EN
          </button>
        </div>
        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <BannerPreview
            banner={{
              variant,
              title: previewTitle,
              body: previewBody,
              ctaLabel: previewCta || null,
              ctaUrl: ctaUrl || null,
              dismissible,
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn-sm" onClick={submit} disabled={!canSubmit}>
          {state === 'saving' ? 'Enregistrement…' : mode === 'create' ? 'Créer le bandeau' : 'Enregistrer'}
        </button>
        {error ? <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span> : null}
      </div>
    </div>
  )
}
