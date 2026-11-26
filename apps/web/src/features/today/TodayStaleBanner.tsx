import { STALE_ACTION_DAYS } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { CheckCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCloseStaleActions } from '@/features/actions/hooks/useCloseStaleActions'

/**
 * #4485 (décision Louis 24/10, « Proposer de les clore ») — « N actions en retard de plus de 30 jours — les
 * marquer faites ? ».
 *
 * Le bandeau PROPOSE ; rien ne se ferme au chargement. Le clic envoie les identifiants affichés au serveur, qui
 * vérifie qu'ils sont à toi. Geste déclaratif (aucune preuve d'envoi), rien n'est supprimé. Aucune action
 * concernée : aucune ligne (jamais « 0 »).
 */
export function TodayStaleBanner({ ids }: { ids: readonly string[] }) {
  // Le crochet (donc le client de requêtes) ne se monte que s'il y a quelque chose à proposer.
  return ids.length === 0 ? null : <StaleBannerBody ids={ids} />
}

function StaleBannerBody({ ids }: { ids: readonly string[] }) {
  const { t } = useTranslation('actions')
  const close = useCloseStaleActions()
  return (
    <div
      data-testid="today-stale-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-5 py-4"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text element="h2" size="base" weight="semibold">
          {t('today.stale.banner', { count: ids.length, days: STALE_ACTION_DAYS })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('today.stale.note')}
        </Text>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pointer-coarse:min-h-11"
        disabled={close.isPending}
        onClick={() => close.mutate(ids)}
      >
        <CheckCheck className="size-3.5" aria-hidden="true" />
        {close.isPending ? t('today.stale.closing') : t('today.stale.close', { count: ids.length })}
      </Button>
    </div>
  )
}
