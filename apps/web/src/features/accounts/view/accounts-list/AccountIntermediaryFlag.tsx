import { accountActorBadgeKind } from '@bellum/contracts'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #2265.5/.7/.14 (épopée #2851) — UN SEUL badge de ligne pour les trois natures
 * (intermédiaire, partenaire déclaré, source de données : `accountActorBadgeKind`,
 * un seul calcul, GA-26) — jamais trois pastilles qui s'empilent. Le même badge que `IntermediaryBadge` de Découvrir,
 * mais pour les LISTES de comptes : `isIntermediaryActor` (`@bellum/contracts`)
 * ne recalcule rien de nouveau, elle lit le NAF déjà en base (GA-26). État
 * ordinaire (pas intermédiaire, ou NAF absent) : rien ne s'affiche — même règle
 * que les autres pastilles de ligne (`AccountRelaunchBriefFlag`).
 */
export function AccountIntermediaryFlag({
  nafCode,
  companyName,
  isDeclaredPartner,
  className,
}: {
  nafCode?: string | null
  companyName: string
  isDeclaredPartner?: boolean
  className?: string
}) {
  const { t } = useTranslation('accounts')
  const kind = accountActorBadgeKind({ name: companyName, naf: nafCode ?? null, isDeclaredPartner })
  if (kind === null) return null
  const prefix = kind === 'intermediary' ? 'intermediary' : `actorBadge.${kind}`

  return (
    <span
      data-testid="account-intermediary-flag"
      title={t(`${prefix}.help`)}
      className={[
        // #4470 — jamais `whitespace-nowrap`/`shrink-0` : le badge retourne à la ligne DANS sa cellule.
        'inline-flex min-w-0 max-w-full items-center gap-1 break-words rounded-full',
        'bg-[color-mix(in_srgb,var(--bellum-warning-text)_14%,transparent)] px-1.5 py-0',
        'text-xs leading-4 text-[var(--warning-soft-text)]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <AlertTriangle className="size-2.5 shrink-0" aria-hidden />
      <span className="min-w-0">{t(`${prefix}.label`)}</span>
    </span>
  )
}
