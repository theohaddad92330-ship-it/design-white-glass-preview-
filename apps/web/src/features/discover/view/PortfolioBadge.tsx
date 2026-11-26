import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, CircleSlash, Eye, Star } from 'lucide-react'
import type { PortfolioBadge as PortfolioBadgeModel } from '@/features/discover/lib/discover-presentation'
import { formatDate } from '@/lib/locale'

/* Tokens de pastille (cf. src/styles/tokens.css) : les valeurs écrites en dur
 * étaient calibrées pour le dark et devenaient illisibles sur fond clair. */
const TONES: Record<PortfolioBadgeModel['tone'], { bg: string; fg: string; border: string }> = {
  analyzed: { bg: 'var(--info-soft-bg)', fg: 'var(--info-soft-text)', border: 'var(--info-soft-border)' },
  watched: { bg: 'var(--warning-soft-bg)', fg: 'var(--warning-soft-text)', border: 'var(--warning-soft-border)' },
  customer: { bg: 'var(--success-soft-bg)', fg: 'var(--success-soft-text)', border: 'var(--success-soft-border)' },
  // Écarté : gris, pas rouge. Ce n'est pas une erreur, c'est une décision.
  parked: { bg: 'var(--bellum-surface-2)', fg: 'var(--bellum-text-muted)', border: 'var(--bellum-border)' },
}

const ICONS: Record<PortfolioBadgeModel['tone'], typeof Eye> = {
  analyzed: CheckCircle2,
  watched: Eye,
  customer: Star,
  parked: CircleSlash,
}

/**
 * État portefeuille d'un candidat. Quand l'API a résolu un `accountId`, le badge
 * devient un lien vers la fiche existante : le commercial voit immédiatement
 * qu'il possède déjà ce compte et peut y aller sans repasser par la liste.
 */
export function PortfolioBadge({ badge }: { badge: PortfolioBadgeModel }) {
  const { t } = useTranslation('discover')
  const tone = TONES[badge.tone]
  const Icon = ICONS[badge.tone]

  const content = (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
    >
      <Icon className="h-[11px] w-[11px]" />
      {/* « Écarté le {date} — {motif} » : le §4.4 le demande mot pour mot, et
          c'est la date qui rend l'information actionnable. Sans motif connu, on
          dit simplement « écarté » plutôt que d'inventer une raison. */}
      {badge.state === 'parked'
        ? badge.parkedReason
          ? t('portfolio.parkedWithReason', {
              date: badge.parkedAt ? formatDate(new Date(badge.parkedAt)) : '',
              reason: badge.parkedReason,
            })
          : t('portfolio.parked')
        : t(badge.labelKey)}
    </span>
  )

  if (!badge.accountId) return content

  return (
    <Link
      to="/accounts/$id"
      params={{ id: badge.accountId }}
      title={t('portfolio.openAccount')}
      className="transition-opacity hover:opacity-80"
      onClick={e => e.stopPropagation()}
    >
      {content}
    </Link>
  )
}
