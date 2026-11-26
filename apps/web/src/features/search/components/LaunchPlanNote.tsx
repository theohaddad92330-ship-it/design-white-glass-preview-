import type { LaunchPlan } from '@/features/search/hooks/useLaunchPlan'
import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { History, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Ce que « Préparer l'analyse » ferait MAINTENANT, lu sur `GET /analysis/launch-plan` (#1583) — la même logique que le
 * lancement, jamais une seconde estimation. Théo B r1-recherche (#4468) : AUCUN crédit à l'écran. Le plan ne dit plus un
 * prix, il dit le geste :
 *  · `cache_hit` — un dossier récent existe : « Ouvrir le dossier » (rien n'est refait) ou « Actualiser l'analyse » ;
 *  · `fresh` + `knownAccount` — ce nom résout un dossier déjà analysé hors fenêtre de cache : il serait DUPLIQUÉ, on
 *    propose d'ouvrir l'existant (#2292.17/.18) ;
 *  · autrement, rien : une analyse neuve n'a pas de phrase à ajouter.
 * Le frein doux (plus de quota) vit dans le pied de page, sans chiffre.
 */
export function LaunchPlanNote({
  plan,
  onOpenExisting,
  onRefreshExisting,
}: {
  plan: LaunchPlan | null
  onOpenExisting: (accountId: string) => void
  onRefreshExisting: () => void
}) {
  const { t } = useTranslation('search')
  if (plan?.scenario === 'cache_hit') {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[var(--bellum-text-secondary)]">
          <History className="size-3.5 shrink-0" aria-hidden />
          <span>{t('launch.cost.cacheHit')}</span>
          {/* #2292.18 — un `cache_hit` est TOUJOURS dans la fenêtre de fraîcheur : le dire explicitement. */}
          <span className="font-medium text-[var(--success-soft-text)]">{t('launch.cost.stillFresh')}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            icon={History}
            onClick={() => onOpenExisting(plan.accountId)}
            className="gap-1.5"
          >
            {t('launch.cost.openExisting')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={RefreshCw}
            onClick={onRefreshExisting}
            className="gap-1.5"
          >
            {t('launch.cost.refreshExisting')}
          </Button>
        </div>
      </div>
    )
  }
  if (plan?.scenario === 'fresh' && plan.knownAccount) {
    return (
      <Text size="sm" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[var(--bellum-text-secondary)]">
        <History className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium">{t('launch.cost.alreadyKnown')}</span>
        <span className="text-[var(--warning-soft-text)]">{t('launch.cost.toRefresh')}</span>
        <Link
          to="/accounts/$id"
          params={{ id: plan.knownAccount.accountId }}
          className="inline-flex min-h-9 items-center font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          {t('launch.cost.openKnownAccount')}
        </Link>
      </Text>
    )
  }
  return null
}
