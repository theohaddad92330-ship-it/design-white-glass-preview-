import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActivityScope } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTimeline } from '../hooks/useTimeline'
import { matchesCategory } from '../model/timeline'
import { timelineEventTitle } from '../model/timelineEvent'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'

/**
 * #2124.41 — LES ACTIONS DÉJÀ EXÉCUTÉES, À CÔTÉ DE CE QUI RESTE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN RECETTE LE 15/09/2026 (prod 41805f310, compte THALES)
 * ─────────────────────────────────────────────────────────────────────────
 * La sous-section « Actions et décisions » ne montrait que `TaskList` — les
 * tâches OUVERTES, ce qu'il RESTE à faire. Aucune action déjà exécutée
 * n'apparaissait dans ce bloc : ouvrir le dossier avant un rendez-vous ne
 * répondait qu'à « qu'est-ce que j'ai promis ? », jamais à « qu'est-ce qu'on
 * a fait ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE SOURCE
 * ─────────────────────────────────────────────────────────────────────────
 * Les actions exécutées ne sont pas une liste séparée : ce sont les MÊMES
 * lignes que la catégorie « Actions » de la timeline (`useTimeline` +
 * `matchesCategory(…, 'actions')`, déjà posée pour #2124.59) — `task` /
 * `workflow` / `crm_export` / `crm_lookup` / `stage_change` / `gate_decision`
 * (`activity.ts:48-77`). Une activité N'ENTRE dans cette table qu'avec une
 * date RÉELLE (règle n°1 de `activity.ts`) : chaque ligne rendue ici a donc
 * déjà eu lieu, par construction — il n'existe pas d'action « en attente »
 * dans ce flux, contrairement aux tâches de `TaskList`. Un second appel ou une
 * dérivation locale aurait fini par diverger de la timeline : c'est le
 * défaut n°1 du dépôt (« du code juste que personne n'appelle », version
 * inversée ici en « deux lectures de la même donnée »).
 */
export function ExecutedActionsList({
  scope,
  entityId,
  omitRunEvents = false,
}: {
  scope: ActivityScope
  entityId: string
  /** #3532 — l'écran qui monte aussi le fil unifié des exécutions (`AccountTimelineCard`) le dit ici :
   *  l'activité née d'un run (`externalId: workflow:<runId>`) y est déjà, avec son compteur d'étapes. */
  omitRunEvents?: boolean
}) {
  const { t, i18n } = useTranslation('activities')
  const { data, isLoading, isError } = useTimeline(scope, entityId)

  // #3505 — une consultation du CRM (`crm_lookup`) est un geste de lecture, pas
  // une action exécutée : la chronologie juste dessous la porte déjà, une seule
  // fois. Elle reste dans le filtre « Actions » de cette chronologie.
  const actions = useMemo(
    () =>
      (data?.items ?? []).filter(
        item =>
          item.kind !== 'crm_lookup' &&
          !(omitRunEvents && item.externalId?.startsWith('workflow:')) &&
          matchesCategory(item, 'actions'),
      ),
    [data?.items, omitRunEvents],
  )

  if (isLoading) return null

  // #3666.k — une lecture en échec n'est pas « aucune action exécutée ».
  if (isError) return <QueryLoadError />

  if (actions.length === 0) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('executed.empty')}
      </Text>
    )
  }

  return (
    <Box className="space-y-1.5">
      {actions.map(activity => (
        <Box key={activity.id} display="flex" className="items-baseline justify-between gap-3">
          <Text element="span" size="sm" className="min-w-0 truncate">
            {timelineEventTitle(activity, t)}
          </Text>
          <Text element="span" size="xs" color="text-muted-foreground" className="shrink-0">
            {new Date(activity.occurredAt).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
              day: 'numeric',
              month: 'short',
            })}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
