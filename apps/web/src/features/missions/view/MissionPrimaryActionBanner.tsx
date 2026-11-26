import { Badge, Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { computeMissionPrimaryAction, type MissionStatus } from '@bellum/contracts'
import { useMissionEndChecklist, useMissionInterruption, useMissionStartReadiness } from '../api'
import type { MissionView } from '../api'

const VARIANT = {
  confirm_availability: 'destructive',
  complete_start: 'warning',
  complete_end_checklist: 'warning',
  decide_renewal: 'warning',
  on_track: 'success',
} as const

/**
 * #2953 (#2193.53, #2193.57) — L'ACTION PRINCIPALE, en tête du dossier : un
 * état, EXPLIQUÉ, pas quatre panneaux à parcourir pour savoir lequel compte.
 *
 * ⚠️ Elle ne recalcule rien : {@link computeMissionPrimaryAction} (paquet
 * `@bellum/contracts`) lit les MÊMES requêtes que les quatre panneaux plus bas
 * sur cette page (`useMissionStartReadiness`, `useMissionEndChecklist`,
 * `useMissionInterruption`) — React Query les partage par clé, donc AUCUN
 * appel réseau de plus que ce que ces panneaux déclenchent déjà. Ce composant
 * ne fait que les PRIORISER en une seule ligne explicable (loi 4 du tome 7 :
 * jamais un second calcul du même fait).
 *
 * `on_track` s'affiche aussi — un état NOMMÉ, jamais un bandeau qui disparaît
 * en silence quand rien ne bloque (doctrine « on n'affiche pas ce qu'on n'a
 * pas » ne s'applique pas ici : l'état existe toujours, seule sa VALEUR varie).
 */
export function MissionPrimaryActionBanner({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const preStart = mission.status === 'draft' || mission.status === 'onboarding' || mission.status === 'ready_to_start'
  const interruptionVisible = mission.status === 'terminated'

  const { data: startReadiness } = useMissionStartReadiness(mission.id, preStart)
  const { data: endChecklist } = useMissionEndChecklist(mission.id, !preStart)
  const { data: interruption } = useMissionInterruption(mission.id, interruptionVisible)

  // Tant que les panneaux dont cette bannière dépend n'ont pas encore répondu,
  // elle ne rend rien plutôt que d'annoncer « à jour » sur une lecture
  // incomplète — les hooks non ACTIVÉS pour ce statut valent `undefined` en
  // permanence, `computeMissionPrimaryAction` les traite alors comme `null`.
  const loading =
    (preStart && startReadiness === undefined) ||
    (!preStart && endChecklist === undefined) ||
    (interruptionVisible && interruption === undefined)
  if (loading) return null

  const action = computeMissionPrimaryAction({
    status: mission.status as MissionStatus,
    startReadiness: startReadiness ?? null,
    endChecklist: endChecklist ?? null,
    interruption: interruption ?? null,
    risks: mission.risks ?? [],
  })

  const reasonLabels = action.reasons.map(key =>
    action.state === 'complete_end_checklist' ? t(`endChecklist.items.${key}`) : t(`startReadiness.items.${key}`),
  )

  const checklistCarriesDetail = action.state === 'complete_start' || action.state === 'complete_end_checklist'

  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-2 rounded-md border border-border p-3"
      aria-label={t('dossier.primaryAction.groupLabel')}
      data-testid="mission-primary-action"
    >
      <Text element="span" size="xs" color="text-muted-foreground">
        {t('dossier.primaryAction.label')}
      </Text>
      <Badge variant={VARIANT[action.state]}>{t(`dossier.primaryAction.state.${action.state}`)}</Badge>
      {/* #2953 (recette 30/09) — la liste « Passation, Documents, Paiement… »
          s'affichait ICI et dans la checklist juste en dessous : deux fois le
          même fait. Quand une checklist porte le détail, la bannière le POINTE
          (un compte) ; elle ne le liste que quand aucun panneau ne le fait. */}
      {reasonLabels.length > 0 ? (
        <Text element="span" size="xs" color="text-muted-foreground">
          {checklistCarriesDetail
            ? t('dossier.primaryAction.pointer', { count: reasonLabels.length })
            : reasonLabels.join(', ')}
        </Text>
      ) : null}
    </Box>
  )
}
