import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { CorrectionSurfaceStatus, CorrectionSurfaceTrace } from '@bellum/contracts'
import { useRecordHistory } from '../hooks/useRecordEdit'
import { useRecordImportMark } from '../hooks/useRecordImportMark'
import { ImportMarkLine } from './ImportMarkLine'
import { recordHistoryCorrectionViews } from '../lib/recordHistoryView'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'

/**
 * « Qui a changé ça ? » — la première question posée dès qu'une équipe partage
 * une base, et celle à laquelle aucun écran ne savait répondre.
 *
 * Une ligne par modification : le champ, l'avant, l'après, l'auteur et la date.
 * Un champ vidé s'affiche « (vide) » plutôt qu'un blanc, sinon la ligne se lit
 * comme un bug d'affichage.
 *
 * #2318.6 — LAU-FINAL-059 : une correction humaine gagne TOUJOURS sur le champ
 * qu'elle vise (portée + source contestée), mais n'empêche PAS le reste de
 * l'analyse de bouger — un écran qui montrerait avant/après sans le dire
 * promettrait plus qu'il ne tient.
 */
export function RecordHistory({
  entityType,
  entityId,
  enabled = true,
}: {
  entityType: 'account' | 'contact' | 'mission'
  entityId: string
  enabled?: boolean
}) {
  const { t, i18n } = useTranslation('crm')
  const { data: entries, isLoading, isError } = useRecordHistory(entityType, entityId, enabled)
  // #4051 — la mission n'a pas de trace d'import (account/contact seulement).
  const { data: importMark } = useRecordImportMark(
    entityType === 'mission' ? 'account' : entityType,
    entityId,
    enabled && entityType !== 'mission',
  )

  if (isLoading) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('common:states.loading')}
      </Text>
    )
  }

  // #3666.k — une lecture en échec n'est pas « aucun historique ».
  if (isError) return <QueryLoadError />

  if (!entries || entries.length === 0) {
    return (
      <Box className="space-y-2">
        <ImportMarkLine mark={importMark} />
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('history.empty')}
          </Text>
        </Box>
      </Box>
    )
  }

  const formatDate = (iso: string): string =>
    new Date(iso).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  // #2318.6 — chaque ligne du journal porte les sept éléments d'une
  // correction : avant/après/auteur/date (déjà rendus ci-dessous) plus
  // portée, ce qu'elle protège et ce qu'elle n'empêche pas.
  const views = recordHistoryCorrectionViews(entries)

  return (
    <Box className="space-y-2">
      <ImportMarkLine mark={importMark} />
      {entries.map((entry, index) => {
        const view = views[index]
        return (
          <Box key={entry.id} className="rounded-md border border-border bg-card p-3">
            <Box display="flex" className="flex-wrap items-baseline gap-x-2 gap-y-1">
              <Text element="span" size="sm" weight="medium">
                {t(`fields.${entry.field}`, { defaultValue: entry.field })}
              </Text>
              <Text element="span" size="xs" color="text-muted-foreground">
                {formatDate(entry.createdAt)}
              </Text>
              <Text element="span" size="xs" color="text-muted-foreground">
                · {entry.actorName ?? t(`sources.${entry.source}`)}
              </Text>
            </Box>
            <Box display="flex" className="mt-1 flex-wrap items-baseline gap-2">
              <Text element="span" size="xs" color="text-muted-foreground" className="line-through">
                {entry.oldValue ?? t('history.blank')}
              </Text>
              <Text element="span" size="xs" color="text-muted-foreground">
                →
              </Text>
              <Text element="span" size="xs">
                {entry.newValue ?? t('history.blank')}
              </Text>
            </Box>
            <Box className="mt-2 space-y-0.5 border-t border-border pt-2">
              <Text size="xs" color="text-muted-foreground">
                {t('history.scope')}
              </Text>
              <Text size="xs" color="text-muted-foreground">
                {view.contestedSource
                  ? t('history.protects', { source: t(`sources.${view.contestedSource}`) })
                  : t('history.protectsNothing')}
              </Text>
              <Text size="xs" weight="medium">
                {t('history.doesNotBlock')}
              </Text>
            </Box>
          </Box>
        )
      })}

      {/* #2318.7 — OÙ la correction est vraiment arrivée.
          Rendu UNE fois, sous le journal : le registre est identique pour toutes
          les lignes, le répéter sous chacune serait la même information deux fois
          sous la même forme (GA-26) et noierait le journal. */}
      <CorrectionSurfaces surfaces={views[0]?.impactedSurfaces ?? []} />
    </Box>
  )
}

/**
 * #2318.7 — les neuf surfaces de LAU-FINAL-059, avec leur STATUT MESURÉ.
 *
 * Ce qui se joue ici tient en une phrase : afficher « 5 sur 9 » et nommer les
 * quatre autres est plus honnête que neuf promesses. La liste fixe d'avant
 * annonçait une propagation qui n'avait jamais été mesurée — un silence qui se
 * lit comme une mesure, exactement ce que GA-18 / GA-19 interdisent dans
 * l'autre sens quand un « 0 » remplace un « non mesuré ».
 *
 * Les trois états sont DISTINGUABLES, et c'est la raison d'être du composant :
 * « relit ta correction », « ne la relit pas » et « non mesuré » ne se lisent
 * pas pareil et n'appellent pas le même geste. Une surface non atteinte porte
 * toujours sa raison — ce qui n'a pas pu être atteint se nomme.
 */
function CorrectionSurfaces({ surfaces }: { surfaces: readonly CorrectionSurfaceTrace[] }) {
  const { t } = useTranslation('crm')
  if (surfaces.length === 0) return null

  const reached = surfaces.filter(trace => trace.status === 'reached').length
  const statusLabel = (status: CorrectionSurfaceStatus): string => {
    if (status === 'reached') return t('history.surfaceReached')
    if (status === 'not_reached') return t('history.surfaceNotReached')
    // « Non mesuré » n'est PAS « non atteint » : on ne range pas une absence de
    // mesure parmi les échecs constatés.
    return t('history.surfaceNotMeasurable')
  }

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Text size="sm" weight="medium">
        {t('history.surfacesTitle')}
      </Text>
      <Text size="xs" color="text-muted-foreground">
        {t('history.surfacesCount', { reached, total: surfaces.length })}
      </Text>
      <Box className="mt-2 space-y-1.5 border-t border-border pt-2">
        {surfaces.map(trace => (
          <Box key={trace.surface} data-testid="correction-surface">
            <Text size="xs" weight={trace.status === 'reached' ? 'medium' : 'normal'}>
              {`${t(`correctionSurfaces.${trace.surface}.name`)} · ${statusLabel(trace.status)}`}
            </Text>
            {/* La raison n'est affichée que là où elle apprend quelque chose :
                sous une surface atteinte, elle répéterait le statut. */}
            {trace.status !== 'reached' ? (
              <Text size="xs" color="text-muted-foreground">
                {t(trace.reasonKey)}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
