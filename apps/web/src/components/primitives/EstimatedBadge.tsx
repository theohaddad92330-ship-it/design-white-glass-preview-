import type { EstimateKind } from '@bellum/contracts'
import { badgeVariants, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * « Estimé » — LA mention d'une valeur déduite (#4016 L4, décision Louis
 * 11/10/2026, `c95_estimation_badgee`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SEULE PRIMITIVE
 * ─────────────────────────────────────────────────────────────────────────
 * Louis a levé « jamais de donnée fictive » pour les ESTIMATIONS, à une
 * condition : elles sont toujours badgées, et jamais prises pour une preuve.
 * Quatre écrans qui composeraient chacun leur mention produiraient quatre
 * vocabulaires — et le cinquième oublierait le badge. Une estimation sans ce
 * composant est une estimation NON badgée : c'est elle que les gardes refusent.
 *
 * Accessibilité : le badge ne repose pas sur la couleur (bordure en tirets ET
 * mot écrit) ; son nom accessible dit « pas une preuve », et la base de
 * l'estimation (« motif prénom.nom appris de 3 adresses vérifiées ») se lit
 * au lecteur d'écran comme au survol. Les deux thèmes passent par les jetons
 * (`--bellum-*`), jamais une couleur en dur (GA-33).
 */
export function EstimatedBadge({
  kind = 'estimated',
  verifiedAt,
  basis,
  className,
}: {
  /** Les quatre formes d'une valeur DÉDUITE — liste fermée du contrat (`ESTIMATE_KINDS`, #4016.L4). */
  kind?: EstimateKind
  /** La date à laquelle l'estimation a été VÉRIFIÉE (ex. : MX + SMTP pour un e-mail). Absente = rien n'est dit. */
  verifiedAt?: string | null
  /** Sur quoi l'estimation repose, en une phrase. */
  basis?: string | null
  className?: string
}) {
  const { t } = useTranslation('common')
  // Une date que le calendrier ne lit pas ne s'imprime pas : `formatDate` rend
  // `null`, et le badge retombe sur sa forme sans date.
  const date = formatDate(verifiedAt, { day: '2-digit', month: 'short', year: 'numeric' })
  // #4295.17/.18 — UN SEUL mot visible pour une valeur déduite : « estimé ». Angle en hypothèse, ESN probable, prior,
  // valeur suggérée : la NUANCE se lit dans le nom accessible et l'infobulle (et `data-estimate`), jamais en second libellé.
  const label = date && kind === 'estimated' ? t('estimate.verifiedOn', { date }) : t('estimate.label')
  // `estimated` seul n'a pas de nuance à ajouter : le mot « estimé » suffit (#4295.17), la clé n'existe donc pas.
  const nuance = kind === 'estimated' ? null : t(`estimate.nuance.${kind}`)
  const description = [nuance, t('estimate.notEvidence'), basis?.trim() || null].filter(Boolean).join(' ')
  return (
    <span
      className={cn(
        badgeVariants({ variant: 'outline' }),
        'border-dashed text-[var(--bellum-text-muted)] focus:ring-0',
        className,
      )}
      role="note"
      aria-label={`${label} — ${description}`}
      title={description}
      data-estimate={kind}
    >
      {label}
    </span>
  )
}
