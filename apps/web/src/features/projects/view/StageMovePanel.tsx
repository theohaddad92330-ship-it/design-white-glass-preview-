import type { ProjectRow, ProjectStage } from '@bellum/contracts'
import {
  CASE_BUYING_MODELS,
  CASE_ORGANISATIONS,
  CASE_STRATEGIES,
  LOSS_REASON_CODES,
  effectsForMove,
} from '@bellum/contracts'
import type { CaseBuyingModel, CaseOrganisation, CaseStrategy, LossReasonCode } from '@bellum/contracts'
import { Badge, Box, Button, SelectField, Text, Textarea } from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EffectPanel } from '@/components/effects/EffectPanel'
import { useSubmissions } from '@/features/submissions/api'
import { useLossReasons } from '../hooks/useLossReasons'

const REASON_MAX = 200

type Props = {
  project: ProjectRow
  target: ProjectStage
  /** Une mission existe-t-elle déjà sur ce projet ? Le §15 veut qu'un retour
   *  arrière depuis « gagné » soit BLOQUÉ tant qu'elle n'est pas traitée. */
  hasMission: boolean
  onCancel: () => void
  onConfirm: (input: {
    reason: string | null
    /** #3989.9 (Louis 15/10/2026) — le motif dans la liste FERMÉE commune ; `reason` en est la précision libre. */
    lossReasonCode?: LossReasonCode
    accepted: readonly string[]
    /** #3246 (lot W9 + lot cloud 14/10) — choix fermés saisis à la perte ; absents = non renseignés. */
    strategy?: CaseStrategy
    buying_model?: CaseBuyingModel
    organisation?: CaseOrganisation
  }) => void
}

/**
 * Le panneau d'effet d'un déplacement d'étape (PDF 2 §8.5).
 *
 * Il dit trois choses, et les tenir séparées est tout l'intérêt : ce qui CHANGE
 * (que l'utilisateur subit), ce qui est PROPOSÉ (qu'il coche), et ce qui est
 * VÉRIFIÉ (qu'on lui montre sans décider à sa place).
 *
 * Les cases pré-cochées sont exclusivement de niveau N1 — ce que le produit
 * fait seul, sans rien envoyer dehors. Aucun envoi externe n'est pré-coché, et
 * c'est la seule faute de cet écran qui ne se rattraperait pas.
 *
 * ⚠️ La coque vient désormais de `<EffectPanel>` (Tome 7 §47). Cet écran
 * appliquait déjà les règles 1 et 3 — mais dans SON code. Deux manquaient :
 * « Déplacer seulement » en un clic (sans quoi refuser les propositions demande
 * de décocher les cases une par une, ce que personne ne fait) et le refus de
 * valider sur `Entrée`.
 */
function AnnouncedMissions({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const { data } = useSubmissions({ projectId })
  const retained = (data?.items ?? []).filter(item => item.stage === 'accepted').length
  return (
    <Text element="p" size="sm" color="text-[var(--warning-soft-text)]">
      {retained > 0 ? t('stageMove.missionsAnnounced', { count: retained }) : t('stageMove.missionAnnounced')}{' '}
      {t('stageMove.createsMission')}
    </Text>
  )
}

export function StageMovePanel({ project, target, hasMission, onCancel, onConfirm }: Props) {
  const { t } = useTranslation('projects')
  const effects = useMemo(() => effectsForMove(project.stage, target), [project.stage, target])
  const { data: lossReasons } = useLossReasons(effects.reasonRequired)
  const [reason, setReason] = useState('')
  const [lossReasonCode, setLossReasonCode] = useState('')
  const [strategy, setStrategy] = useState('')
  const [buyingModel, setBuyingModel] = useState('')
  const [organisation, setOrganisation] = useState('')

  const blocked = effects.warnsAboutMission && hasMission
  // #3989.9 — c'est le motif FERMÉ qui est obligatoire ; la précision libre est facultative.
  const chosenLossReason = LOSS_REASON_CODES.find(code => code === lossReasonCode)
  const missingReason = effects.reasonRequired && !chosenLossReason

  return (
    <EffectPanel
      title={t('stageMove.title', { stage: t(`stage.states.${target}`) })}
      proposals={effects.proposals}
      blocked={blocked}
      confirmDisabled={missingReason}
      moveOnlyLabel={t('stageMove.moveOnly')}
      confirmLabel={t('stageMove.confirm')}
      onCancel={onCancel}
      onConfirm={acceptedKeys => {
        const chosenStrategy = CASE_STRATEGIES.find(code => code === strategy)
        const chosenBuyingModel = CASE_BUYING_MODELS.find(code => code === buyingModel)
        const chosenOrganisation = CASE_ORGANISATIONS.find(code => code === organisation)
        onConfirm({
          reason: reason.trim() || null,
          ...(effects.reasonRequired && chosenLossReason ? { lossReasonCode: chosenLossReason } : {}),
          accepted: acceptedKeys,
          ...(chosenStrategy ? { strategy: chosenStrategy } : {}),
          ...(chosenBuyingModel ? { buying_model: chosenBuyingModel } : {}),
          ...(chosenOrganisation ? { organisation: chosenOrganisation } : {}),
        })
      }}
      renderProposal={proposal => (
        <Box display="flex" className="flex-wrap items-center gap-x-2 gap-y-0.5">
          {/* #4339.1 — une phrase métier, et sa raison en UNE ligne : « pourquoi on me le propose ». */}
          <Box className="min-w-0 basis-full">
            <Text size="sm">{t(`stageMove.proposal.${proposal.key}`)}</Text>
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t(`stageMove.reason.${proposal.key}`)}
            </Text>
          </Box>
          {/* Qui fait le geste. Sans cette distinction, toutes les cases se
              ressemblaient : celle qui crée la mission le fait vraiment, les
              autres sont des rappels — et cocher un rappel en croyant
              déclencher une action est ce qui a laissé des projets gagnés sans
              mission. */}
          <Badge variant="outline" className="px-1 py-0 text-xs">
            {t(proposal.performedBy === 'server' ? 'stageMove.autoTag' : 'stageMove.manualTag')}
          </Badge>
          {proposal.external ? (
            <Badge variant="outline" className="px-1 py-0 text-xs">
              {t('stageMove.externalTag')}
            </Badge>
          ) : null}
        </Box>
      )}
      changes={
        <>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            {project.label}
          </Text>
          {/* Le retour arrière depuis « gagné » avec une mission déjà créée est
              BLOQUÉ, pas seulement signalé (§15) : rouvrir le projet laisserait
              une mission orpheline dont personne ne verrait qu'elle l'est. */}
          {blocked ? (
            <Box className="rounded-md border border-[var(--bellum-danger)] p-2">
              <Text size="sm" color="text-[var(--danger-soft-text)]">
                {t('stageMove.missionBlocks')}
              </Text>
            </Box>
          ) : null}
          {/* #4195 — plus une case : un effet ANNONCÉ. Le seul geste de cet écran qu'on ne défait
              pas d'un clic (aucun chemin ne supprime une mission, pour garder l'historique de
              facturation) : on le DIT avant, avec le nombre de missions qui vont naître. */}
          {effects.createsMission ? <AnnouncedMissions projectId={project.id} /> : null}
          <Box className="space-y-1">
            <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]">
              {t('stageMove.changes')}
            </Text>
            <Box display="flex" className="flex-wrap gap-1">
              {effects.changes.map(change => (
                <Badge key={change} variant="outline" className="px-1 py-0 text-xs">
                  {t(`stageMove.change.${change}`)}
                </Badge>
              ))}
            </Box>
          </Box>
        </>
      }
      checks={
        effects.checks.length > 0 ? (
          <Box className="space-y-1">
            <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]">
              {t('stageMove.checks')}
            </Text>
            {effects.checks.map(check => (
              <Text key={check} size="sm" color="text-[var(--bellum-text-secondary)]">
                {t(`stageMove.check.${check}`)}
              </Text>
            ))}
          </Box>
        ) : null
      }
      extra={
        effects.reasonRequired ? (
          <Box className="space-y-1">
            {/* #3989.9 (Louis 15/10/2026) — le motif dans la liste FERMÉE commune, obligatoire. */}
            <SelectField
              ariaLabel={t('stageMove.lossReasonCode')}
              value={lossReasonCode}
              onChange={setLossReasonCode}
              placeholder={t('stageMove.lossReasonCode')}
              options={LOSS_REASON_CODES.map(code => ({ value: code, label: t(`stageMove.lossReasonCodes.${code}`) }))}
            />
            <Box display="flex" className="flex-wrap gap-1">
              {(lossReasons?.items ?? []).map(item => (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setReason(item.label)}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
            <Textarea
              value={reason}
              maxLength={REASON_MAX}
              rows={2}
              placeholder={t('stageMove.reasonPlaceholder')}
              onChange={event => setReason(event.target.value.slice(0, REASON_MAX))}
            />
            {/* #3246 (lot W9 + lot cloud 14/10) — trois choix FERMÉS, facultatifs : ils nourrissent la comparaison de Laura entre cas. */}
            <Box className="grid gap-2 sm:grid-cols-2">
              <SelectField
                ariaLabel={t('stageMove.strategy')}
                value={strategy}
                onChange={setStrategy}
                placeholder={t('stageMove.strategy')}
                emptyOption={{ label: t('stageMove.choiceNone') }}
                options={CASE_STRATEGIES.map(code => ({ value: code, label: t(`stageMove.strategies.${code}`) }))}
              />
              <SelectField
                ariaLabel={t('stageMove.buyingModel')}
                value={buyingModel}
                onChange={setBuyingModel}
                placeholder={t('stageMove.buyingModel')}
                emptyOption={{ label: t('stageMove.choiceNone') }}
                options={CASE_BUYING_MODELS.map(code => ({
                  value: code,
                  label: t(`stageMove.buyingModels.${code}`),
                }))}
              />
              <SelectField
                ariaLabel={t('stageMove.organisation')}
                value={organisation}
                onChange={setOrganisation}
                placeholder={t('stageMove.organisation')}
                emptyOption={{ label: t('stageMove.choiceNone') }}
                options={CASE_ORGANISATIONS.map(code => ({
                  value: code,
                  label: t(`stageMove.organisations.${code}`),
                }))}
              />
            </Box>
          </Box>
        ) : null
      }
    />
  )
}
