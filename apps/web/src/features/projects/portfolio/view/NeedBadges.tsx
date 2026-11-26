import { Badge, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { needStage, type NeedKind, type NeedUrgency } from '../model/needs'

const URGENCY_VARIANT: Record<NeedUrgency, 'danger' | 'warning' | 'outline'> = {
  high: 'danger',
  medium: 'warning',
  low: 'outline',
  unknown: 'outline',
}

/** Urgence du compte (la plus forte de ses besoins) — badge plein, en tête de carte. */
export function UrgencyBadge({ urgency }: { urgency: NeedUrgency }) {
  const { t } = useTranslation('projects')
  return (
    <Badge variant={URGENCY_VARIANT[urgency]} className="shrink-0">
      {t(`urgency.${urgency}`)}
    </Badge>
  )
}

const URGENCY_DOT: Record<NeedUrgency, string> = {
  high: 'bg-[var(--bellum-danger)]',
  medium: 'bg-[var(--bellum-warning)]',
  low: 'bg-[var(--bellum-text-muted)]',
  unknown: 'bg-[var(--bellum-border)]',
}

/**
 * Urgence d'un besoin listé : une pastille, pas un badge. Trois badges pleins
 * empilés dans une carte de compte noient le libellé — c'est ce qui rendait
 * l'écran illisible.
 */
export function UrgencyDot({ urgency }: { urgency: NeedUrgency }) {
  const { t } = useTranslation('projects')
  const label = t(`urgency.${urgency}`)

  return (
    <span
      aria-label={label}
      title={label}
      className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', URGENCY_DOT[urgency])}
    />
  )
}

/**
 * Le STADE d'un besoin dans la progression (p42-43).
 *
 * Il remplace l'étiquette de nature (« Chantier IT », « Signal d'achat ») par la
 * position sur la chaîne de preuve : signal → projet plausible → projet
 * qualifié → demande confirmée. La nuance n'est pas cosmétique — c'est elle qui
 * empêche d'écrire à un DSI qu'on a « noté son besoin » quand il n'a rien
 * demandé.
 *
 * La couleur monte avec l'engagement : ce sur quoi quelqu'un s'est exprimé se
 * distingue de ce qu'on a déduit.
 */
const STAGE_CLASS: Record<string, string> = {
  signal: 'border-[var(--bellum-border)] text-[var(--bellum-text-muted)]',
  plausible: 'border-sky-500/40 text-[var(--info-soft-text)]',
  qualified: 'border-violet-500/40 text-[var(--bellum-text-accent)]',
  confirmed: 'border-emerald-500/40 text-[var(--success-soft-text)]',
}

export function StageBadge({ kind }: { kind: NeedKind }) {
  const { t } = useTranslation('projects')
  const stage = needStage(kind)
  return (
    <Badge
      variant="outline"
      className={cn('shrink-0 bg-transparent', STAGE_CLASS[stage])}
      title={t(`stages.${stage}.help`)}
    >
      {t(`stages.${stage}.label`)}
    </Badge>
  )
}
