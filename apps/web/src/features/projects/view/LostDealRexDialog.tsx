import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from '@bellum/ui'
import {
  LOST_DEAL_MOTIFS,
  LOST_DEAL_REX_EVIDENCE_KINDS,
  LOST_DEAL_REX_REUSE_TARGETS,
  type LostDealMotif,
  type LostDealRexEvidence,
  type LostDealRexReuseTarget,
} from '@bellum/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { lostDealRexApi } from '../lost-deal-rex-api'

const NO_MOTIF = '__none__'

/**
 * BEL-SC-243 — REX PERTE (#3272.1), la tranche VISIBLE.
 *
 * Tranche compacte, assumée : les deux motifs (déclaré/supposé, MOTIFS DE
 * PERTE #3272.3), la synthèse « ce que l'équipe sait maintenant » avec sa
 * distinction (DISTINCTIONS, #3272.2) et les cibles de réutilisation
 * déclaratives (#3272.4). #3295 (reste) ajoute les trois champs les plus
 * visibles, dans l'ordre que l'épopée recommande elle-même : sponsor, route
 * utilisée, dernière action (evidenced — même distinction que « ce que
 * l'équipe sait maintenant »). #3295 (reste) referme le point : les dix
 * derniers champs (périmètre, besoin, personnes impliquées, décideur réel,
 * preuve mobilisée, angle essayé, angles non essayés, concurrent, timing,
 * cycle, friction achats, écart consultant, économie) ont désormais leur
 * champ dans cet écran — `createLostDealRexSchema` les portait déjà tous,
 * seul l'écran manquait.
 */
export function LostDealRexDialog({
  open,
  onOpenChange,
  projectId,
  accountId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  accountId: string | null
}) {
  const { t } = useTranslation('projects')
  const [declaredMotif, setDeclaredMotif] = useState<LostDealMotif | null>(null)
  const [suspectedMotif, setSuspectedMotif] = useState<LostDealMotif | null>(null)
  const [perimeter, setPerimeter] = useState('')
  const [need, setNeed] = useState('')
  const [peopleInvolved, setPeopleInvolved] = useState('')
  const [realDecider, setRealDecider] = useState('')
  const [sponsor, setSponsor] = useState('')
  const [routeUsed, setRouteUsed] = useState('')
  const [proofUsed, setProofUsed] = useState('')
  const [angleTried, setAngleTried] = useState('')
  const [anglesNotTried, setAnglesNotTried] = useState('')
  const [lastAction, setLastAction] = useState('')
  const [lastActionDistinction, setLastActionDistinction] = useState<LostDealRexEvidence>('interpretation_commerciale')
  const [whatTeamKnows, setWhatTeamKnows] = useState('')
  const [whatTeamKnowsDistinction, setWhatTeamKnowsDistinction] =
    useState<LostDealRexEvidence>('interpretation_commerciale')
  const [revisitOn, setRevisitOn] = useState('')
  const [reuseTargets, setReuseTargets] = useState<ReadonlySet<LostDealRexReuseTarget>>(new Set())
  const [competitor, setCompetitor] = useState('')
  const [timing, setTiming] = useState('')
  const [cycleDays, setCycleDays] = useState('')
  const [procurementFriction, setProcurementFriction] = useState('')
  const [consultantGap, setConsultantGap] = useState('')
  const [economics, setEconomics] = useState('')

  const create = useMutation({
    mutationFn: lostDealRexApi.create,
    onSuccess: () => {
      toast.success(t('stage.lostDealRex.saved'))
      onOpenChange(false)
    },
    onError: (error: Error) => toast.error(t('stage.lostDealRex.saveFailed'), { description: error.message }),
  })

  const toggleReuseTarget = (target: LostDealRexReuseTarget) => {
    setReuseTargets(previous => {
      const next = new Set(previous)
      if (next.has(target)) next.delete(target)
      else next.add(target)
      return next
    })
  }

  const submit = () => {
    const knows = whatTeamKnows.trim()
    const action = lastAction.trim()
    const cycleDaysTrimmed = cycleDays.trim()
    create.mutate({
      project_id: projectId,
      account_id: accountId,
      perimeter: perimeter.trim() || null,
      need: need.trim() || null,
      people_involved: peopleInvolved.trim() || null,
      real_decider: realDecider.trim() || null,
      sponsor: sponsor.trim() || null,
      route_used: routeUsed.trim() || null,
      proof_used: proofUsed.trim() || null,
      angle_tried: angleTried.trim() || null,
      angles_not_tried: anglesNotTried
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0),
      last_action: action.length > 0 ? { value: action, distinction: lastActionDistinction } : null,
      declared_motif: declaredMotif,
      declared_motif_note: null,
      suspected_motif: suspectedMotif,
      suspected_motif_note: null,
      competitor: competitor.trim() || null,
      timing: timing.trim() || null,
      cycle_days: cycleDaysTrimmed.length > 0 ? Number(cycleDaysTrimmed) : null,
      procurement_friction: procurementFriction.trim() || null,
      consultant_gap: consultantGap.trim() || null,
      economics: economics.trim() || null,
      what_team_knows_now: knows.length > 0 ? { value: knows, distinction: whatTeamKnowsDistinction } : null,
      revisit_on: revisitOn.trim() || null,
      reuse_targets: [...reuseTargets],
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('stage.lostDealRex.title')}</DialogTitle>
          <DialogDescription>{t('stage.lostDealRex.offerDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.perimeterLabel')}
            </Text>
            <Textarea
              value={perimeter}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.perimeterPlaceholder')}
              aria-label={t('stage.lostDealRex.perimeterLabel')}
              onChange={event => setPerimeter(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.needLabel')}
            </Text>
            <Textarea
              value={need}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.needPlaceholder')}
              aria-label={t('stage.lostDealRex.needLabel')}
              onChange={event => setNeed(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.peopleInvolvedLabel')}
            </Text>
            <Textarea
              value={peopleInvolved}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.peopleInvolvedPlaceholder')}
              aria-label={t('stage.lostDealRex.peopleInvolvedLabel')}
              onChange={event => setPeopleInvolved(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="lost-deal-rex-real-decider" className="mb-1 block text-xs text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.realDeciderLabel')}
            </label>
            <input
              id="lost-deal-rex-real-decider"
              type="text"
              value={realDecider}
              maxLength={500}
              placeholder={t('stage.lostDealRex.realDeciderPlaceholder')}
              onChange={event => setRealDecider(event.target.value)}
              className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="lost-deal-rex-sponsor" className="mb-1 block text-xs text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.sponsorLabel')}
            </label>
            <input
              id="lost-deal-rex-sponsor"
              type="text"
              value={sponsor}
              maxLength={500}
              placeholder={t('stage.lostDealRex.sponsorPlaceholder')}
              onChange={event => setSponsor(event.target.value)}
              className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.routeUsedLabel')}
            </Text>
            <Textarea
              value={routeUsed}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.routeUsedPlaceholder')}
              aria-label={t('stage.lostDealRex.routeUsedLabel')}
              onChange={event => setRouteUsed(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.proofUsedLabel')}
            </Text>
            <Textarea
              value={proofUsed}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.proofUsedPlaceholder')}
              aria-label={t('stage.lostDealRex.proofUsedLabel')}
              onChange={event => setProofUsed(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.angleTriedLabel')}
            </Text>
            <Textarea
              value={angleTried}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.angleTriedPlaceholder')}
              aria-label={t('stage.lostDealRex.angleTriedLabel')}
              onChange={event => setAngleTried(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.anglesNotTriedLabel')}
            </Text>
            <Textarea
              value={anglesNotTried}
              rows={2}
              placeholder={t('stage.lostDealRex.anglesNotTriedPlaceholder')}
              aria-label={t('stage.lostDealRex.anglesNotTriedLabel')}
              onChange={event => setAnglesNotTried(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.lastActionLabel')}
            </Text>
            <Textarea
              value={lastAction}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.lastActionPlaceholder')}
              aria-label={t('stage.lostDealRex.lastActionLabel')}
              onChange={event => setLastAction(event.target.value)}
            />
            {lastAction.trim().length > 0 ? (
              <Select
                value={lastActionDistinction}
                onValueChange={value => setLastActionDistinction(value as LostDealRexEvidence)}
              >
                <SelectTrigger aria-label={t('stage.lostDealRex.distinctionLabel')} className="mt-1.5 h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOST_DEAL_REX_EVIDENCE_KINDS.map(kind => (
                    <SelectItem key={kind} value={kind}>
                      {t(`stage.lostDealRex.distinctions.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.declaredMotifLabel')}
            </Text>
            <Select
              value={declaredMotif ?? NO_MOTIF}
              onValueChange={value => setDeclaredMotif(value === NO_MOTIF ? null : (value as LostDealMotif))}
            >
              <SelectTrigger aria-label={t('stage.lostDealRex.declaredMotifLabel')} className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MOTIF}>{t('stage.lostDealRex.motifPlaceholder')}</SelectItem>
                {LOST_DEAL_MOTIFS.map(motif => (
                  <SelectItem key={motif} value={motif}>
                    {t(`stage.lostDealRex.motifs.${motif}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.suspectedMotifLabel')}
            </Text>
            <Select
              value={suspectedMotif ?? NO_MOTIF}
              onValueChange={value => setSuspectedMotif(value === NO_MOTIF ? null : (value as LostDealMotif))}
            >
              <SelectTrigger aria-label={t('stage.lostDealRex.suspectedMotifLabel')} className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MOTIF}>{t('stage.lostDealRex.motifPlaceholder')}</SelectItem>
                {LOST_DEAL_MOTIFS.map(motif => (
                  <SelectItem key={motif} value={motif}>
                    {t(`stage.lostDealRex.motifs.${motif}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="lost-deal-rex-competitor" className="mb-1 block text-xs text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.competitorLabel')}
            </label>
            <input
              id="lost-deal-rex-competitor"
              type="text"
              value={competitor}
              maxLength={500}
              placeholder={t('stage.lostDealRex.competitorPlaceholder')}
              onChange={event => setCompetitor(event.target.value)}
              className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="lost-deal-rex-timing" className="mb-1 block text-xs text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.timingLabel')}
            </label>
            <input
              id="lost-deal-rex-timing"
              type="text"
              value={timing}
              maxLength={500}
              placeholder={t('stage.lostDealRex.timingPlaceholder')}
              onChange={event => setTiming(event.target.value)}
              className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="lost-deal-rex-cycle-days" className="mb-1 block text-xs text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.cycleDaysLabel')}
            </label>
            <input
              id="lost-deal-rex-cycle-days"
              type="number"
              min={0}
              step={1}
              value={cycleDays}
              placeholder={t('stage.lostDealRex.cycleDaysPlaceholder')}
              onChange={event => setCycleDays(event.target.value)}
              className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.procurementFrictionLabel')}
            </Text>
            <Textarea
              value={procurementFriction}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.procurementFrictionPlaceholder')}
              aria-label={t('stage.lostDealRex.procurementFrictionLabel')}
              onChange={event => setProcurementFriction(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.consultantGapLabel')}
            </Text>
            <Textarea
              value={consultantGap}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.consultantGapPlaceholder')}
              aria-label={t('stage.lostDealRex.consultantGapLabel')}
              onChange={event => setConsultantGap(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.economicsLabel')}
            </Text>
            <Textarea
              value={economics}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.economicsPlaceholder')}
              aria-label={t('stage.lostDealRex.economicsLabel')}
              onChange={event => setEconomics(event.target.value)}
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.whatTeamKnowsLabel')}
            </Text>
            <Textarea
              value={whatTeamKnows}
              maxLength={2000}
              rows={2}
              placeholder={t('stage.lostDealRex.whatTeamKnowsPlaceholder')}
              aria-label={t('stage.lostDealRex.whatTeamKnowsLabel')}
              onChange={event => setWhatTeamKnows(event.target.value)}
            />
            {whatTeamKnows.trim().length > 0 ? (
              <Select
                value={whatTeamKnowsDistinction}
                onValueChange={value => setWhatTeamKnowsDistinction(value as LostDealRexEvidence)}
              >
                <SelectTrigger aria-label={t('stage.lostDealRex.distinctionLabel')} className="mt-1.5 h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOST_DEAL_REX_EVIDENCE_KINDS.map(kind => (
                    <SelectItem key={kind} value={kind}>
                      {t(`stage.lostDealRex.distinctions.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div>
            <label htmlFor="lost-deal-rex-revisit-on" className="mb-1 block text-xs text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.revisitOnLabel')}
            </label>
            <input
              id="lost-deal-rex-revisit-on"
              type="date"
              value={revisitOn}
              onChange={event => setRevisitOn(event.target.value)}
              className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
            />
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('stage.lostDealRex.reuseTargetsLabel')}
            </Text>
            <div className="space-y-1.5">
              {LOST_DEAL_REX_REUSE_TARGETS.map(target => (
                <label key={target} className="flex items-start gap-2">
                  <Checkbox
                    checked={reuseTargets.has(target)}
                    onCheckedChange={() => toggleReuseTarget(target)}
                    aria-label={t(`stage.lostDealRex.reuseTargets.${target}`)}
                  />
                  <Text size="sm" className="text-[var(--bellum-text-primary)]">
                    {t(`stage.lostDealRex.reuseTargets.${target}`)}
                  </Text>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('stage.lostDealRex.cancel')}
          </Button>
          <Button type="button" disabled={create.isPending} onClick={submit}>
            {t('stage.lostDealRex.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
