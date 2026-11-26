import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { useOutreachSequences } from '../hooks/useOutreachSequences'
import { campaignTitle } from '../sequence-campaign'
import { SequenceCampaignPage } from './SequenceCampaignPage'

/**
 * Théo C sequences-detail.R1 — LA PAGE D'UNE SÉQUENCE (`/actions/sequences/$id`), avec son URL partageable.
 *
 * Le détail est celui de la CAMPAGNE (`SequenceCampaignPage`) : toute l'audience qui partage l'étiquette de la
 * séquence ouverte. Elle se lit dans la liste du workspace — aucune route serveur de plus — et un
 * identifiant inconnu le DIT (jamais une page vide).
 */
export function SequenceDetailRoutePage({ id }: { id: string }) {
  const { t } = useTranslation('outreach')
  const { t: tNav } = useTranslation('nav')
  const { data: sequences, isLoading, isError } = useOutreachSequences()
  const sequence = sequences?.find(candidate => candidate.id === id) ?? null
  // Théo C sequences-detail — le fil « Actions › Séquences › <campagne> » (la dérivation de la coque ne connaît pas
  // les pages de détail des séquences : l'écran le déclare, une fois).
  const breadcrumbs = sequence
    ? [
        { label: tNav('items.actions'), to: '/actions' },
        { label: tNav('tabs.sequences'), to: '/actions/sequences' },
        { label: campaignTitle(sequence) },
      ]
    : undefined

  return (
    <CustomerPage
      anchorId="sequences"
      titleInScreen
      pageTitle={sequence ? campaignTitle(sequence) : t('page.title')}
      {...(breadcrumbs ? { breadcrumbs } : {})}
    >
      {isLoading ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('page.loading')}
        </Text>
      ) : isError ? (
        <QueryLoadError />
      ) : sequence ? (
        <SequenceCampaignPage sequence={sequence} all={sequences ?? []} />
      ) : (
        <Box className="flex flex-col gap-2" data-testid="sequence-not-found">
          <Text size="sm">{t('detail.notFound')}</Text>
          <Link
            to="/actions/sequences"
            className="text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
          >
            {t('detail.backToList')}
          </Link>
        </Box>
      )}
    </CustomerPage>
  )
}
