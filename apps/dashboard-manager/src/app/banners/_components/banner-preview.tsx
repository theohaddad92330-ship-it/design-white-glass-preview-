import type { CSSProperties, SVGProps } from 'react'
import { VARIANT_COLOR, type BannerVariant } from './banner-preview.logic'

/**
 * L'aperçu de bandeau, EN CONTEXTE (#1667.2a).
 *
 * Reproduit fidèlement la structure du vrai `BannerBar`
 * (`apps/web/src/features/banners/BannerBar.tsx`) : icône par variante, titre
 * en gras, corps en texte atténué, CTA souligné dans la couleur de la
 * variante, bouton de fermeture — plutôt que la boîte à bordure colorée
 * précédente, qui n'avait ni les icônes ni les tokens du vrai composant.
 *
 * ⚠️ `lucide-react` n'est PAS une dépendance de ce paquet (`package.json`) —
 * les quatre icônes ci-dessous sont de PETITS SVG qui reproduisent le tracé de
 * `Info`/`CheckCircle2`/`AlertTriangle`/`AlertOctagon`/`X` (la bibliothèque
 * qu'utilise `BannerBar`), pour ne pas ajouter une dépendance neuve à ce lot.
 * Factoriser `BannerBar` lui-même dans `packages/ui` (pour n'avoir plus qu'UN
 * composant, partagé) reste À FAIRE — voir le rapport du chantier.
 */

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </IconBase>
  )
}

function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </IconBase>
  )
}

function AlertTriangleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  )
}

function AlertOctagonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 16h.01" />
      <path d="M12 8v4" />
      <path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z" />
    </IconBase>
  )
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconBase>
  )
}

/** Même correspondance que `VARIANT_ICON` dans `BannerBar.tsx`. */
const VARIANT_ICON: Readonly<Record<BannerVariant, (props: SVGProps<SVGSVGElement>) => React.JSX.Element>> = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  critical: AlertOctagonIcon,
}

type BannerPreviewData = {
  variant: BannerVariant
  title: string
  body: string
  ctaLabel: string | null
  ctaUrl: string | null
  dismissible: boolean
}

const iconStyle: CSSProperties = { width: 16, height: 16, flexShrink: 0 }

export function BannerPreview({ banner }: { banner: BannerPreviewData }) {
  const color = VARIANT_COLOR[banner.variant]
  const Icon = VARIANT_ICON[banner.variant]

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 12,
        borderBottom: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        padding: '8px 16px',
        fontSize: 14,
        color: 'var(--text)',
      }}
    >
      <Icon style={{ ...iconStyle, color }} />
      <div style={{ display: 'flex', minWidth: 0, flex: 1, flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 8px' }}>
        <span style={{ fontWeight: 600 }}>{banner.title || '— titre —'}</span>
        {banner.body ? <span style={{ color: 'var(--muted)' }}>{banner.body}</span> : null}
      </div>
      {banner.ctaLabel && banner.ctaUrl ? (
        <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontWeight: 600, color, textDecoration: 'underline' }}>
          {banner.ctaLabel} →
        </span>
      ) : null}
      {banner.dismissible ? (
        <span
          aria-hidden
          style={{ flexShrink: 0, borderRadius: 4, padding: 4, color: 'var(--muted)', display: 'flex' }}
        >
          <CloseIcon style={iconStyle} />
        </span>
      ) : null}
    </div>
  )
}
