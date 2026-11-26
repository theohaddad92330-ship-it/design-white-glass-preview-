import { Box, Button, Text } from '@bellum/ui'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #2207.19 — le CTA « Synchroniser et comprendre mes données », affiché juste
 * après le toast de connexion OAuth.
 *
 * Avant lui, la seule chose qui se passait après une connexion réussie était
 * un toast qui disparaît (`IntegrationCenterPage`, `callback.connected`) : le
 * bénéfice de s'être connecté n'était jamais montré. Ce bandeau nomme le geste
 * suivant, et laisse partir sans lui (« Plus tard » — jamais un blocage, le
 * connecteur reste utilisable sans première synchronisation).
 */
export function FirstSyncCta({
  name,
  onLaunch,
  onDismiss,
  resync = false,
}: {
  name: string
  onLaunch: () => void
  /** Absent en mode `resync` : rien à reporter, le geste reste toujours là (#3014). */
  onDismiss?: () => void
  /**
   * #3014 — recette du 26/09/2026 : un connecteur déjà synchronisé par le passé
   * (`last_sync` connu, aucun run `completed` connu de cette capacité) ne
   * proposait plus JAMAIS ce geste — seule la condition « jamais synchronisé »
   * l'affichait. Même geste, juste un libellé qui dit la vérité : ce n'est pas
   * la première fois.
   */
  resync?: boolean
}) {
  const { t } = useTranslation('integrationCenter')
  const titleKey = resync ? 'firstSyncCta.resyncTitle' : 'firstSyncCta.title'
  const bodyKey = resync ? 'firstSyncCta.resyncBody' : 'firstSyncCta.body'

  return (
    <Box className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--bellum-border)] p-3">
      <Sparkles aria-hidden="true" className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" />
      <Box className="min-w-0 flex-1 space-y-0.5">
        <Text size="sm" weight="medium">
          {t(titleKey)}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t(bodyKey, { name })}
        </Text>
      </Box>
      <Box display="flex" className="shrink-0 gap-2">
        {onDismiss ? (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {t('firstSyncCta.later')}
          </Button>
        ) : null}
        <Button variant="default" size="sm" onClick={onLaunch}>
          {t(titleKey)}
        </Button>
      </Box>
    </Box>
  )
}
