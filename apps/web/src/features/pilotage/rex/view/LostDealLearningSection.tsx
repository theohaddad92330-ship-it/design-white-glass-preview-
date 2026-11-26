import {
  hasPermission,
  METHOD_RULE_DOMAINS,
  WORKSPACE_RULE_PENDING_REVIEW,
  type LearnedRuleOutcomeTally,
  type LostDealRex,
  type LostDealRuleProposal,
  type MethodRuleDomain,
  type WorkspaceMethodRule,
} from '@bellum/contracts'
import {
  Button,
  Card,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TheoPill, TheoSectionTitle } from '@/components/page/theo-page-grammar'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { formatDate } from '@/lib/locale'
import { LEARNING_KEYS, lostDealLearningApi } from '../learning-api'
import { LearnedRuleFollow } from './LearnedRuleFollow'

/**
 * #3295 — « Règles apprises des pertes » (`/pilotage/rex`).
 *
 * L'apprentissage contrôlé de bout en bout, sur l'écran où vivent déjà les
 * retours d'expérience : citer au moins DEUX pertes documentées pour proposer
 * une règle, un responsable la tranche, une règle adoptée naît DÉSACTIVÉE et
 * une seconde porte — l'activation — la rend visible de Laura. Désactiver une
 * règle active est le rollback, et exige sa raison.
 *
 * Forme reprise de `RexScreen` juste au-dessus : `section` + `h2`, une `Card`
 * en liste séparée par des filets, mêmes tailles de texte. Dans une liste, une
 * absence ne fait AUCUNE ligne : pas de tableau vide, un seul texte qui nomme
 * le geste suivant.
 */
/**
 * Théo PR12 — `view` découpe la section entre deux VRAIS onglets de l'écran REX (notre maquette validée
 * `maq-actions-19-10/rex.html`) : « Pertes documentées » (`losses`) et « Règles apprises » (`rules`). `all` garde
 * l'ancienne pile, pour tout appelant qui n'a pas d'onglets. Rien n'est retiré : chaque bloc vit dans un des deux.
 */
export function LostDealLearningSection({ view = 'all' }: { view?: 'all' | 'losses' | 'rules' } = {}) {
  const { t } = useTranslation('pilotage')
  const { team } = useTeam()
  const qc = useQueryClient()
  const role = team?.workspace.role ?? 'member'
  const canPropose = hasPermission(role, 'records:write')
  const canDecide = hasPermission(role, 'team:manage')
  const [composing, setComposing] = useState(false)

  const rexQuery = useQuery({ queryKey: LEARNING_KEYS.rex, queryFn: lostDealLearningApi.rex, staleTime: 30_000 })
  const proposalsQuery = useQuery({
    queryKey: LEARNING_KEYS.proposals,
    queryFn: lostDealLearningApi.proposals,
    staleTime: 30_000,
  })
  const rulesQuery = useQuery({ queryKey: LEARNING_KEYS.rules, queryFn: lostDealLearningApi.rules, staleTime: 30_000 })
  // #3295 — la mesure par règle ; une lecture manquée n'efface rien : la ligne de mesure s'absente, c'est tout.
  const outcomesQuery = useQuery({
    queryKey: LEARNING_KEYS.outcomes,
    queryFn: lostDealLearningApi.outcomes,
    staleTime: 30_000,
  })

  const rex: LostDealRex[] = rexQuery.data?.items ?? []
  const rules: WorkspaceMethodRule[] = rulesQuery.data?.items ?? []
  // #3295 — une règle n'apparaît qu'UNE fois, dans son état le plus avancé (GA-26) : la proposition adoptée
  // dont la règle existe se lit sur la carte des règles, pas une seconde fois sous « Adoptée ».
  const promotedProposalIds = new Set(rules.map(rule => rule.proposal_id))
  const proposals: LostDealRuleProposal[] = (proposalsQuery.data?.items ?? []).filter(
    proposal => !promotedProposalIds.has(proposal.id),
  )

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['lost-deal-learning'] })
  }
  const onError = (title: string) => (error: Error) => toast.error(title, { description: error.message })

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: 'adopted' | 'rejected' }) =>
      lostDealLearningApi.decide(input.id, input.decision),
    onSuccess: (result, input) => {
      refresh()
      toast.success(t(input.decision === 'adopted' ? 'rex.learning.adoptedToast' : 'rex.learning.rejectedToast'))
      return result
    },
    onError: onError(t('rex.learning.decideFailed')),
  })
  const setActivation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean; reason?: string }) =>
      lostDealLearningApi.setActivation(input.id, { enabled: input.enabled, reason: input.reason }),
    onSuccess: refresh,
    onError: onError(t('rex.learning.activationFailed')),
  })
  const propose = useMutation({
    mutationFn: lostDealLearningApi.propose,
    onSuccess: () => {
      refresh()
      setComposing(false)
      toast.success(t('rex.learning.proposed'))
    },
    onError: onError(t('rex.learning.proposeFailed')),
  })

  const unreadable = rexQuery.isError || proposalsQuery.isError || rulesQuery.isError
  const loading = rexQuery.isLoading || proposalsQuery.isLoading || rulesQuery.isLoading

  const showRules = view !== 'losses'
  const showLosses = view !== 'rules'

  return (
    <section data-anchor="rex-learning" data-view={view}>
      {view === 'all' ? <TheoSectionTitle>{t('rex.learning.title')}</TheoSectionTitle> : null}
      <Text size="sm" className="mb-3 mt-2 block text-[var(--bellum-text-secondary)]">
        {view === 'losses' ? t('rex.learning.lost.intro') : t('rex.learning.intro')}
      </Text>

      {unreadable ? (
        /* Illisible ≠ vide : une règle apprise qu'on ne peut pas lire ne se
           déclare pas « absente ». */
        <Text size="xs" className="block text-[var(--warning-soft-text)]">
          {t('rex.learning.unavailable')}
        </Text>
      ) : loading ? (
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('rex.loading')}
        </Text>
      ) : (
        <div className="space-y-4">
          {showRules && rules.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-[var(--bellum-border)]">
                {rules.map(rule => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    tally={outcomesQuery.data?.items.find(entry => entry.rule_id === rule.id)}
                    canDecide={canDecide}
                    busy={setActivation.isPending}
                    onActivate={() => setActivation.mutate({ id: rule.id, enabled: true })}
                    onDeactivate={reason => setActivation.mutate({ id: rule.id, enabled: false, reason })}
                  />
                ))}
              </ul>
            </Card>
          ) : null}

          {showRules && proposals.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-[var(--bellum-border)]">
                {proposals.map(proposal => (
                  <ProposalRow
                    key={proposal.id}
                    proposal={proposal}
                    canDecide={canDecide}
                    busy={decide.isPending}
                    onDecide={decision => decide.mutate({ id: proposal.id, decision })}
                  />
                ))}
              </ul>
            </Card>
          ) : null}

          {showRules && rules.length === 0 && proposals.length === 0 ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {rex.length < 2 ? t('rex.learning.needTwoRex') : t('rex.learning.none')}
            </Text>
          ) : null}

          {/* #3295 — les pertes qui fondent la proposition se LISENT ici, en lecture seule. */}
          {showLosses ? <LostDealRexList rex={rex} titled={view === 'all'} /> : null}
          {view === 'losses' && rex.length === 0 ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('rex.learning.lost.none')}
            </Text>
          ) : null}

          {/* Le geste n'est offert que s'il peut aboutir : moins de deux
              pertes documentées, « Proposer » mènerait à un refus certain. */}
          {showRules && canPropose && rex.length >= 2 ? (
            composing ? (
              <ProposeForm
                rex={rex}
                busy={propose.isPending}
                onCancel={() => setComposing(false)}
                onSubmit={input => propose.mutate(input)}
              />
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                onClick={() => setComposing(true)}
              >
                {t('rex.learning.propose.open')}
              </Button>
            )
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * Théo PR12 — les compteurs des onglets « Pertes documentées » / « Règles apprises », lus sous les MÊMES clés que la
 * section (une seule requête par lecture, partagée par le cache). Un compteur illisible reste `undefined` : l'onglet
 * ne montre pas de pastille, jamais « 0 ».
 */
export function useLostDealLearningCounts(): { losses?: number; rules?: number } {
  const rexQuery = useQuery({ queryKey: LEARNING_KEYS.rex, queryFn: lostDealLearningApi.rex, staleTime: 30_000 })
  const proposalsQuery = useQuery({
    queryKey: LEARNING_KEYS.proposals,
    queryFn: lostDealLearningApi.proposals,
    staleTime: 30_000,
  })
  const rulesQuery = useQuery({ queryKey: LEARNING_KEYS.rules, queryFn: lostDealLearningApi.rules, staleTime: 30_000 })
  const rex = rexQuery.data?.items
  const rules = rulesQuery.data?.items
  const proposals = proposalsQuery.data?.items
  const promoted = new Set((rules ?? []).map(rule => rule.proposal_id))
  return {
    ...(Array.isArray(rex) ? { losses: rex.length } : {}),
    ...(Array.isArray(rules) && Array.isArray(proposals)
      ? { rules: rules.length + proposals.filter(proposal => !promoted.has(proposal.id)).length }
      : {}),
  }
}

/**
 * #3295 — les pertes documentées, en LECTURE : compte · affaire, motif déclaré (un fait saisi) et motif
 * suspecté (une hypothèse — nommée comme telle), date. Une valeur absente ne fait aucune ligne de texte :
 * ni « 0 », ni « N/A », ni libellé orphelin. Aucune action n'écrit depuis cette liste.
 */
function LostDealRexList({ rex, titled = true }: { rex: LostDealRex[]; titled?: boolean }) {
  const { t } = useTranslation(['pilotage', 'projects'])
  const projects = useProjects().data ?? []
  if (rex.length === 0) return null
  return (
    <div>
      {titled ? (
        <Text element="h3" size="sm" weight="semibold" className="mb-2 block text-[var(--bellum-text-primary)]">
          {t('pilotage:rex.learning.lost.title')}
        </Text>
      ) : null}
      <Card className="overflow-hidden p-0">
        <ul aria-label={t('pilotage:rex.learning.lost.title')} className="divide-y divide-[var(--bellum-border)]">
          {rex.map(entry => {
            const project = projects.find(item => item.id === entry.project_id)
            const heading = [project?.company_name, project?.label].filter(Boolean).join(' · ')
            return (
              <li key={entry.id} className="w-full px-4 py-3">
                {heading ? (
                  <Text size="sm" weight="medium" className="block break-words">
                    {heading}
                  </Text>
                ) : null}
                <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                  {formatDate(new Date(entry.created_at))}
                </Text>
                {entry.declared_motif ? (
                  <Text size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
                    {t('pilotage:rex.learning.lost.declared', {
                      motif: t(`projects:stage.lostDealRex.motifs.${entry.declared_motif}`),
                    })}
                  </Text>
                ) : null}
                {entry.suspected_motif ? (
                  <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-secondary)]">
                    {t('pilotage:rex.learning.lost.suspected', {
                      motif: t(`projects:stage.lostDealRex.motifs.${entry.suspected_motif}`),
                    })}
                  </Text>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

function RuleRow({
  rule,
  tally,
  canDecide,
  busy,
  onActivate,
  onDeactivate,
}: {
  rule: WorkspaceMethodRule
  tally: LearnedRuleOutcomeTally | undefined
  canDecide: boolean
  busy: boolean
  onActivate: () => void
  onDeactivate: (reason: string) => void
}) {
  const { t } = useTranslation('pilotage')
  const [askingReason, setAskingReason] = useState(false)
  const [reason, setReason] = useState('')
  const pendingReview = !rule.enabled && rule.disabled_reason === WORKSPACE_RULE_PENDING_REVIEW

  return (
    <li className="w-full px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Text size="sm" weight="medium">
            {rule.statement}
          </Text>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TheoPill tone="accent">{rule.domain}</TheoPill>
            <TheoPill tone={rule.enabled ? 'success' : pendingReview ? 'warning' : 'neutral'}>
              {rule.enabled
                ? t('rex.learning.rules.active')
                : pendingReview
                  ? t('rex.learning.rules.pendingReview')
                  : t('rex.learning.rules.disabled')}
            </TheoPill>
          </div>
          {/* La raison d'une désactivation se lit : « désactivée » sans motif est
              exactement le silence que la gouvernance refuse. */}
          {!rule.enabled && !pendingReview && rule.disabled_reason ? (
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {t('rex.learning.rules.disabledReason', { reason: rule.disabled_reason })}
            </Text>
          ) : null}
        </div>
        {canDecide && !askingReason ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            className="shrink-0 pointer-coarse:min-h-11"
            onClick={() => (rule.enabled ? setAskingReason(true) : onActivate())}
          >
            {rule.enabled ? t('rex.learning.rules.deactivate') : t('rex.learning.rules.activate')}
          </Button>
        ) : null}
      </div>
      {rule.enabled ? <LearnedRuleFollow ruleId={rule.id} tally={tally} /> : null}
      {askingReason ? (
        <div className="mt-2 space-y-2">
          <Textarea
            aria-label={t('rex.learning.rules.reasonLabel')}
            placeholder={t('rex.learning.rules.reasonLabel')}
            value={reason}
            onChange={event => setReason(event.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || reason.trim().length === 0}
              className="pointer-coarse:min-h-11"
              onClick={() => {
                onDeactivate(reason.trim())
                setAskingReason(false)
                setReason('')
              }}
            >
              {t('rex.learning.rules.confirmDeactivate')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="pointer-coarse:min-h-11"
              onClick={() => setAskingReason(false)}
            >
              {t('rex.learning.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function ProposalRow({
  proposal,
  canDecide,
  busy,
  onDecide,
}: {
  proposal: LostDealRuleProposal
  canDecide: boolean
  busy: boolean
  onDecide: (decision: 'adopted' | 'rejected') => void
}) {
  const { t } = useTranslation('pilotage')
  return (
    <li className="w-full px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Text size="sm" weight="medium">
            {proposal.observation}
          </Text>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TheoPill tone="accent">{proposal.domain}</TheoPill>
            <TheoPill>
              {t('rex.learning.proposals.supportedBy', { count: proposal.convergent_rex_ids.length })}
            </TheoPill>
            <TheoPill tone={proposal.status === 'adopted' ? 'success' : 'neutral'}>
              {t(`rex.learning.proposals.status.${proposal.status}`)}
            </TheoPill>
          </div>
        </div>
        {canDecide && proposal.status === 'pending' ? (
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              className="pointer-coarse:min-h-11"
              onClick={() => onDecide('adopted')}
            >
              {t('rex.learning.proposals.adopt')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              className="pointer-coarse:min-h-11"
              onClick={() => onDecide('rejected')}
            >
              {t('rex.learning.proposals.reject')}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function ProposeForm({
  rex,
  busy,
  onSubmit,
  onCancel,
}: {
  rex: LostDealRex[]
  busy: boolean
  onSubmit: (input: { domain: MethodRuleDomain; convergent_rex_ids: string[]; observation: string }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation(['pilotage', 'projects'])
  const [domain, setDomain] = useState<MethodRuleDomain>('methode')
  const [observation, setObservation] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  // #3295 — chaque perte citée se distingue : compte · intitulé de l'affaire · date. Une absence n'est pas
  // devinée : sans dossier lisible, la ligne garde sa date seule.
  const projects = useProjects().data ?? []
  const describe = (entry: LostDealRex): string => {
    const project = projects.find(item => item.id === entry.project_id)
    return [project?.company_name, project?.label].filter(Boolean).join(' · ')
  }
  const ready = picked.length >= 2 && observation.trim().length > 0

  const toggle = (id: string) =>
    setPicked(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id]))

  return (
    <Card className="space-y-3 p-4">
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-[var(--bellum-text-secondary)]">
          {t('pilotage:rex.learning.propose.pick')}
        </legend>
        {rex.map(entry => (
          <label key={entry.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={picked.includes(entry.id)} onCheckedChange={() => toggle(entry.id)} />
            <span className="min-w-0">
              {describe(entry) ? `${describe(entry)} · ` : ''}
              {t('pilotage:rex.learning.propose.rexLabel', { date: formatDate(new Date(entry.created_at)) })}
              {entry.declared_motif ? ` · ${t(`projects:stage.lostDealRex.motifs.${entry.declared_motif}`)}` : ''}
            </span>
          </label>
        ))}
        {picked.length < 2 ? (
          <Text size="xs" className="block text-[var(--bellum-text-muted)]">
            {t('pilotage:rex.learning.propose.needTwo')}
          </Text>
        ) : null}
      </fieldset>

      <Select value={domain} onValueChange={value => setDomain(value as MethodRuleDomain)}>
        <SelectTrigger aria-label={t('pilotage:rex.learning.propose.domain')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METHOD_RULE_DOMAINS.map(item => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Textarea
        aria-label={t('pilotage:rex.learning.propose.observation')}
        placeholder={t('pilotage:rex.learning.propose.observation')}
        value={observation}
        maxLength={500}
        rows={3}
        onChange={event => setObservation(event.target.value)}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !ready}
          className="pointer-coarse:min-h-11"
          onClick={() => onSubmit({ domain, convergent_rex_ids: picked, observation: observation.trim() })}
        >
          {t('pilotage:rex.learning.propose.submit')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onCancel}>
          {t('pilotage:rex.learning.cancel')}
        </Button>
      </div>
    </Card>
  )
}
