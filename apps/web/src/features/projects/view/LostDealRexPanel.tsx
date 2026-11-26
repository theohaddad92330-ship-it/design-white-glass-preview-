import type { LostDealRex, LostDealRexReuseTarget } from '@bellum/contracts'
import { Box, Card, Text } from '@bellum/ui'
import { ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useLostDealRexForProject } from '../hooks/useLostDealRexForProject'

/**
 * #3295 (reste) — Section « Pertes documentées » de la fiche opportunité.
 *
 * `GET /capitalisation/projects/:id/lost-deal-rex` existe depuis #3272.5,
 * sans aucun appelant côté web : `useLostDealRexForProject` est le premier.
 * Forme reprise de `/pilotage/rex` (voir son docblock) — ici une seule
 * moitié, RECUEILLI, puisque le geste d'ÉCRITURE (`LostDealRexDialog`) vit
 * déjà ailleurs, offert à la sortie de l'étape « perdu ».
 *
 * Chaque champ ne s'affiche QUE s'il a une valeur : un REX rempli à moitié
 * ne montre jamais les moitiés vides comme des lignes vides ou des « — ».
 */
export function LostDealRexPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const { items, isLoading, isError } = useLostDealRexForProject(projectId)

  return (
    <Box className="space-y-2" data-anchor="project-lost-deal-rex">
      <Box display="flex" className="items-center gap-2">
        <ScrollText className="size-4 text-muted-foreground" aria-hidden />
        <Text element="h4" size="sm" weight="medium">
          {t('detail.lostDealRex.title')}
        </Text>
      </Box>

      <Box className="flex flex-col gap-2">
        {isError ? (
          <Box className="rounded-md border border-dashed border-destructive/40 p-3">
            <Text size="sm" color="text-muted-foreground">
              {t('detail.lostDealRex.readError')}
            </Text>
          </Box>
        ) : isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : items.length === 0 ? (
          <Box className="rounded-md border border-dashed border-border p-3">
            <Text size="sm" color="text-muted-foreground">
              {t('detail.lostDealRex.empty')}
            </Text>
          </Box>
        ) : (
          items.map(entry => <LostDealRexCard key={entry.id} entry={entry} />)
        )}
      </Box>
    </Box>
  )
}

function LostDealRexCard({ entry }: { entry: LostDealRex }) {
  const { t } = useTranslation('projects')

  const rows: { label: string; value: string }[] = []
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.trim().length > 0) rows.push({ label, value })
  }
  const pushEvidenced = (label: string, claim: { value: string; distinction: string } | null) => {
    if (claim)
      rows.push({ label, value: `${claim.value} (${t(`stage.lostDealRex.distinctions.${claim.distinction}`)})` })
  }

  push(t('stage.lostDealRex.perimeterLabel'), entry.perimeter)
  push(t('stage.lostDealRex.needLabel'), entry.need)
  push(t('stage.lostDealRex.peopleInvolvedLabel'), entry.people_involved)
  push(t('stage.lostDealRex.realDeciderLabel'), entry.real_decider)
  push(t('stage.lostDealRex.sponsorLabel'), entry.sponsor)
  push(t('stage.lostDealRex.routeUsedLabel'), entry.route_used)
  push(t('stage.lostDealRex.proofUsedLabel'), entry.proof_used)
  push(t('stage.lostDealRex.angleTriedLabel'), entry.angle_tried)
  if (entry.angles_not_tried.length > 0) {
    rows.push({ label: t('stage.lostDealRex.anglesNotTriedLabel'), value: entry.angles_not_tried.join(', ') })
  }
  pushEvidenced(t('stage.lostDealRex.lastActionLabel'), entry.last_action)
  if (entry.declared_motif) {
    rows.push({
      label: t('stage.lostDealRex.declaredMotifLabel'),
      value: t(`stage.lostDealRex.motifs.${entry.declared_motif}`),
    })
  }
  if (entry.suspected_motif) {
    rows.push({
      label: t('stage.lostDealRex.suspectedMotifLabel'),
      value: t(`stage.lostDealRex.motifs.${entry.suspected_motif}`),
    })
  }
  push(t('stage.lostDealRex.competitorLabel'), entry.competitor)
  push(t('stage.lostDealRex.timingLabel'), entry.timing)
  if (entry.cycle_days !== null) {
    rows.push({ label: t('stage.lostDealRex.cycleDaysLabel'), value: String(entry.cycle_days) })
  }
  push(t('stage.lostDealRex.procurementFrictionLabel'), entry.procurement_friction)
  push(t('stage.lostDealRex.consultantGapLabel'), entry.consultant_gap)
  push(t('stage.lostDealRex.economicsLabel'), entry.economics)
  pushEvidenced(t('stage.lostDealRex.whatTeamKnowsLabel'), entry.what_team_knows_now)
  const revisitOnLabel = formatDate(entry.revisit_on)
  if (revisitOnLabel) {
    rows.push({ label: t('stage.lostDealRex.revisitOnLabel'), value: revisitOnLabel })
  }
  if (entry.reuse_targets.length > 0) {
    rows.push({
      label: t('stage.lostDealRex.reuseTargetsLabel'),
      value: entry.reuse_targets
        .map((target: LostDealRexReuseTarget) => t(`stage.lostDealRex.reuseTargets.${target}`))
        .join(', '),
    })
  }

  return (
    <Card className="p-3">
      <Text size="xs" className="mb-2 block text-[var(--bellum-text-muted)]">
        {t('detail.lostDealRex.recordedOn', { date: formatDate(entry.created_at) })}
      </Text>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.label}>
            <Text size="xs" weight="medium" className="block text-[var(--bellum-text-secondary)]">
              {row.label}
            </Text>
            <Text size="sm" className="block">
              {row.value}
            </Text>
          </div>
        ))}
      </div>
    </Card>
  )
}
