import { useEffect, useMemo, useState } from 'react'
import type { ManagerTeamStats, SaveTeamReview } from '@bellum/contracts'
import { Button, Checkbox, Input, LauraFace, SelectField, Text, Textarea } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Briefcase, Check, Clock, ListChecks, Route } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useSession } from '@/lib/hooks/use-session'
import { useTeam } from '@/features/team/hooks/useTeam'
import { TeamEquipeShell } from './team-equipe/TeamEquipeShell'
import { useManagerStats } from '../hooks/useManagerStats'
import { useSaveTeamReview } from '../hooks/useSaveTeamReview'

/**
 * Théo D team-review — « Le point d'équipe » : un court parcours en trois écrans
 * pour transformer des constats en décisions (les sujets → les décisions → la
 * relecture).
 *
 * Quatre règles, chacune tenue par un test :
 *  - Les sujets arrivent DÉCOCHÉS : Laura dit pourquoi chacun mérite le point
 *    (bandeau + raison), c'est l'humain qui coche. Aucune pré-sélection.
 *  - Les actions existantes sont mises à jour, jamais dupliquées : l'action
 *    d'un sujet « à reprendre » part avec son identifiant, les autres passent
 *    par la porte de création du plan, qui reconnaît le doublon.
 *  - Rien ne part et aucune affaire ne change d'étape : l'écran de relecture le
 *    dit, et l'API n'a aucune porte vers la messagerie ni vers les étapes.
 *  - « Point sans nouvelle action » : le point se tient et se note sans
 *    fabriquer de tâche — un fait n'est pas une action.
 *
 * Les sujets viennent de la MÊME lecture que la vue d'ensemble
 * (`/manager/team-stats`) : retards du plan, affaires bloquées ou sans action
 * datée. « Une fin de mission à anticiper » attend que l'API serve les fins de
 * mission à l'équipe ; elle n'est pas devinée ici.
 */

type Step = '1' | '2' | '3'
const STEPS: readonly Step[] = ['1', '2', '3']

type TopicKind = 'late' | 'follow' | 'dateless'

type Topic = {
  id: string
  kind: TopicKind
  accountId: string
  company: string
  /** L'action déjà au plan (sujet « à reprendre ») — mise à jour, jamais recréée. */
  existingItemId?: string
  /** Le geste proposé par défaut — modifiable à l'étape 2. */
  label: string
  /** Le responsable proposé par défaut. */
  ownerId: string | null
  /** La raison que Laura donne de retenir ce sujet. */
  why: string
}

type Draft = { label: string; ownerId: string; dueDate: string }

/** Trois jours : assez pour que la décision soit tenable, assez court pour rester un point. */
const DEFAULT_DUE_DAYS = 3

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function defaultDueDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + DEFAULT_DUE_DAYS)
  return isoDay(date)
}

function buildTopics(data: ManagerTeamStats, t: TFunction<'manager'>): Topic[] {
  const topics: Topic[] = []

  for (const item of data.shared_actions?.items ?? []) {
    if (!item.overdue) continue
    topics.push({
      id: `late:${item.id}`,
      kind: 'late',
      accountId: item.account_id,
      company: item.company_name,
      existingItemId: item.id,
      label: item.label,
      ownerId: item.assigned_to ?? item.owner_user_id,
      why: t('review.topics.late.why'),
    })
  }

  const review = data.pipeline_review
  for (const item of review?.items ?? []) {
    if (item.reasons.includes('no_next_step')) {
      topics.push({
        id: `dateless:${item.opportunity_id}`,
        kind: 'dateless',
        accountId: item.account_id,
        company: item.company_name,
        label: item.label,
        ownerId: item.owner_user_id,
        why: t('review.topics.dateless.why'),
      })
    } else if (item.reasons.includes('stuck') || item.reasons.includes('no_activity')) {
      topics.push({
        id: `follow:${item.opportunity_id}`,
        kind: 'follow',
        accountId: item.account_id,
        company: item.company_name,
        label: item.label,
        ownerId: item.owner_user_id,
        why: item.reasons.includes('stuck')
          ? t('review.topics.follow.whyStuck', { days: review?.stuck_days })
          : t('review.topics.follow.whyQuiet', { days: review?.inactivity_days }),
      })
    }
  }

  return topics
}

export function TeamReviewPage({ urlStep }: { urlStep?: Step }) {
  const { t } = useTranslation('manager')
  const navigate = useNavigate()
  const { user } = useSession()
  const { team } = useTeam()
  const { data, isLoading, error } = useManagerStats(7)

  const [step, setStep] = useState<Step>(urlStep ?? '1')
  // Maquette Théo (team-review.A2) : Laura propose les sujets DÉJÀ cochés avec sa
  // raison ; l'humain décoche ce qui ne mérite pas le point. On retient donc ce
  // qui est décoché, pas ce qui est coché.
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set())
  const [drafts, setDrafts] = useState<Readonly<Record<string, Partial<Draft>>>>({})
  const [skipActions, setSkipActions] = useState(false)
  const [note, setNote] = useState('')
  const save = useSaveTeamReview(() => void navigate({ to: '/team' }))

  // Le bouton « retour » du navigateur change l'URL : l'écran suit.
  useEffect(() => {
    if (urlStep) setStep(urlStep)
  }, [urlStep])

  const topics = useMemo(() => (data ? buildTopics(data, t) : []), [data, t])
  const dueDefault = useMemo(defaultDueDate, [])
  // Qui tient le point (`.t8-actor`, Théo PR12) : son nom tel que l'équipe le connaît — jamais deviné de l'e-mail.
  const actorName = data?.members.find(member => member.user_id === user?.id)?.name?.trim() || null
  const workspaceRole = team?.workspace?.role
  const actorRole = workspaceRole ? t(`roles.${workspaceRole}`, { defaultValue: '' }) : ''

  const shell = (body: React.ReactNode) => (
    <TeamEquipeShell active="overview" title={t('review.title').replace(/\.$/, '')} tagline={t('review.tagline')}>
      {body}
    </TeamEquipeShell>
  )
  if (isLoading) return shell(<Centered>{t('states.loading')}</Centered>)
  if (error || !data) return shell(<Centered>{t('errors.load')}</Centered>)

  const members = [...data.members].sort((a, b) => a.name.localeCompare(b.name))
  const nameOf = (id: string) => data.members.find(member => member.user_id === id)?.name ?? id
  const isSelected = (id: string) => !dropped.has(id)
  const chosen = topics.filter(topic => isSelected(topic.id))
  // Rien de coché : le point ne peut être que « sans nouvelle action ».
  const noNewAction = chosen.length === 0 || skipActions

  const draftOf = (topic: Topic): Draft => ({
    label: drafts[topic.id]?.label ?? topic.label,
    ownerId: drafts[topic.id]?.ownerId ?? topic.ownerId ?? user?.id ?? members[0]?.user_id ?? '',
    dueDate: drafts[topic.id]?.dueDate ?? dueDefault,
  })
  const patchDraft = (topic: Topic, patch: Partial<Draft>) =>
    setDrafts(current => ({ ...current, [topic.id]: { ...current[topic.id], ...patch } }))
  const goTo = (next: Step) => {
    setStep(next)
    void navigate({ to: '/team/review/$step', params: { step: next }, replace: true })
  }
  const toggle = (id: string, on: boolean) =>
    setDropped(current => {
      const next = new Set(current)
      if (on) next.delete(id)
      else next.add(id)
      return next
    })

  const submit = () => {
    const body: SaveTeamReview = noNewAction
      ? { decisions: [], no_new_action: true, note: note.trim() || undefined }
      : {
          no_new_action: false,
          note: note.trim() || undefined,
          decisions: chosen.map(topic => {
            const draft = draftOf(topic)
            return {
              topic_id: topic.id,
              account_id: topic.accountId,
              label: draft.label.trim(),
              existing_item_id: topic.existingItemId,
              owner_id: draft.ownerId,
              due_date: draft.dueDate,
              reason: topic.why,
            }
          }),
        }
    save.mutate(body)
  }

  const canLeaveStep2 = noNewAction || chosen.every(topic => draftOf(topic).label.trim() && draftOf(topic).dueDate)

  return (
    <TeamEquipeShell active="overview" title={t('review.title').replace(/\.$/, '')} tagline={t('review.tagline')}>
      {actorName ? (
        <span
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-control border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-3 text-sm font-medium text-[var(--bellum-text-accent)]"
          data-testid="team-review-actor"
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-full bg-[var(--bellum-surface-1)] text-xs font-semibold"
          >
            {actorName.slice(0, 1).toUpperCase()}
          </span>
          {actorRole ? `${actorName} · ${actorRole}` : actorName}
        </span>
      ) : null}
      <ol aria-label={t('review.stepsLabel')} className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
        {STEPS.map(entry => {
          const current = entry === step
          const done = Number(entry) < Number(step)
          return (
            <li
              key={entry}
              aria-current={current ? 'step' : undefined}
              className={`flex min-h-11 items-center gap-2 text-sm ${
                current ? 'font-medium text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]'
              }`}
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full border text-xs ${
                  current
                    ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)] text-[var(--bellum-on-primary)]'
                    : 'border-[var(--bellum-border)]'
                }`}
              >
                {done ? <Check aria-hidden="true" className="size-4" /> : entry}
              </span>
              {t(`review.steps.${entry}`)}
            </li>
          )
        })}
      </ol>

      <div className="mx-auto w-full max-w-4xl space-y-6">
        {step === '1' ? (
          <section aria-label={t('review.steps.1')} className="space-y-5">
            <div className="space-y-1">
              <Text element="h2" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {t('review.s1.title')}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('review.s1.hint')}
              </Text>
            </div>

            {topics.length === 0 ? (
              <Text
                size="sm"
                className="rounded-xl border border-[var(--bellum-border)] p-4 text-[var(--bellum-text-secondary)]"
              >
                {t('review.s1.empty')}
              </Text>
            ) : (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-[var(--bellum-primary-500)]/40 bg-[var(--bellum-primary-500)]/10 p-4">
                  <LauraFace size={32} decorative />
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t('review.s1.laura', { count: topics.length })}
                  </Text>
                </div>
                <ul className="grid gap-4 md:grid-cols-2">
                  {topics.map(topic => {
                    const on = isSelected(topic.id)
                    const Icon = TOPIC_ICON[topic.kind]
                    return (
                      <li key={topic.id}>
                        <label
                          className={`flex h-full min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                            on
                              ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)]/10'
                              : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]'
                          }`}
                        >
                          <Checkbox
                            checked={on}
                            onCheckedChange={value => toggle(topic.id, value === true)}
                            className="mt-1"
                          />
                          <span
                            aria-hidden="true"
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-accent)]"
                          >
                            <Icon className="size-4" />
                          </span>
                          <span className="block min-w-0 space-y-1">
                            <span className="block text-base font-semibold text-[var(--bellum-text-primary)]">
                              {topic.kind === 'follow' ? topic.company : t(`review.topics.${topic.kind}.kicker`)}
                            </span>
                            <span className="block text-sm text-[var(--bellum-text-secondary)]">
                              {topic.kind === 'follow' ? topic.label : `${topic.company} · ${topic.label}`}
                            </span>
                            <span className="block pt-1 text-sm text-[var(--bellum-text-muted)]">{topic.why}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            <div className="space-y-1">
              <label htmlFor="team-review-note" className="text-sm font-medium text-[var(--bellum-text-secondary)]">
                {t('review.s1.noteLabel')}
              </label>
              <Textarea
                id="team-review-note"
                rows={3}
                value={note}
                placeholder={t('review.s1.notePlaceholder')}
                onChange={event => setNote(event.target.value)}
              />
            </div>

            <Nav
              left={
                <Link to="/team" className={NAV_LINK}>
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  {t('review.leave')}
                </Link>
              }
              step={step}
              right={
                <Button onClick={() => goTo('2')}>
                  <ArrowRight aria-hidden="true" className="size-4" />
                  {t('review.next')}
                </Button>
              }
            />
          </section>
        ) : null}

        {step === '2' ? (
          <section aria-label={t('review.steps.2')} className="space-y-5">
            <div className="space-y-1">
              <Text element="h2" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {t('review.s2.title')}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('review.s2.hint')}
              </Text>
            </div>

            {chosen.length > 0 ? (
              <div className="flex min-h-11 items-center gap-2">
                <Checkbox
                  id="team-review-skip"
                  checked={skipActions}
                  onCheckedChange={value => setSkipActions(value === true)}
                />
                <label htmlFor="team-review-skip" className="text-sm text-[var(--bellum-text-primary)]">
                  {t('review.s2.skip')}
                </label>
              </div>
            ) : (
              <Text
                size="sm"
                className="rounded-xl border border-[var(--bellum-border)] p-4 text-[var(--bellum-text-secondary)]"
              >
                {t('review.s2.noneChosen')}
              </Text>
            )}

            {noNewAction ? (
              chosen.length > 0 ? (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('review.s2.skipHint')}
                </Text>
              ) : null
            ) : (
              chosen.map((topic, index) => {
                const draft = draftOf(topic)
                return (
                  <section
                    key={topic.id}
                    aria-label={t('review.s2.decisionLabel', { index: index + 1 })}
                    className="space-y-4 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5"
                  >
                    <Text
                      size="xs"
                      weight="semibold"
                      className="uppercase tracking-widest text-[var(--bellum-text-muted)]"
                    >
                      {topic.existingItemId
                        ? t('review.s2.decisionExisting', { index: index + 1 })
                        : t('review.s2.decision', { index: index + 1 })}
                    </Text>
                    <div className="space-y-1">
                      <label htmlFor={`rv-name-${index}`} className="text-sm font-medium">
                        {t('review.s2.action')}
                      </label>
                      <Input
                        id={`rv-name-${index}`}
                        value={draft.label}
                        required
                        onChange={event => patchDraft(topic, { label: event.target.value })}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Text size="sm" weight="medium">
                          {t('review.s2.owner')}
                        </Text>
                        <SelectField
                          value={draft.ownerId}
                          ariaLabel={t('review.s2.owner')}
                          options={members.map(member => ({ value: member.user_id, label: member.name }))}
                          onChange={next => next && patchDraft(topic, { ownerId: next })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`rv-date-${index}`} className="text-sm font-medium">
                          {t('review.s2.due')}
                        </label>
                        <Input
                          id={`rv-date-${index}`}
                          type="date"
                          value={draft.dueDate}
                          required
                          onChange={event => patchDraft(topic, { dueDate: event.target.value })}
                        />
                      </div>
                    </div>
                  </section>
                )
              })
            )}

            <Nav
              left={
                <Button variant="ghost" onClick={() => goTo('1')}>
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  {t('review.previous')}
                </Button>
              }
              step={step}
              right={
                <Button disabled={!canLeaveStep2} onClick={() => goTo('3')}>
                  <ArrowRight aria-hidden="true" className="size-4" />
                  {t('review.next')}
                </Button>
              }
            />
          </section>
        ) : null}

        {step === '3' ? (
          <section aria-label={t('review.steps.3')} className="space-y-5">
            <div className="space-y-1">
              <Text element="h2" size="2xl" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {t('review.s3.title')}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('review.s3.hint')}
              </Text>
            </div>

            {noNewAction ? (
              <Text
                size="sm"
                className="rounded-xl border border-[var(--bellum-border)] p-4 text-[var(--bellum-text-primary)]"
              >
                {t('review.s3.noAction')}
              </Text>
            ) : (
              <ul className="divide-y divide-[var(--bellum-border)] rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-5">
                {chosen.map(topic => {
                  const draft = draftOf(topic)
                  const TopicIcon = TOPIC_ICON[topic.kind]
                  return (
                    <li key={topic.id} className="flex items-start gap-4 py-4">
                      <span
                        aria-hidden="true"
                        data-testid="topic-icon"
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-accent)]"
                      >
                        <TopicIcon className="size-4" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                          {draft.label}
                        </Text>
                        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                          {[
                            nameOf(draft.ownerId),
                            formatDate(draft.dueDate, { day: 'numeric', month: 'short' }),
                            topic.company,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                        <Text size="sm" className="text-[var(--bellum-text-accent)]">
                          {topic.existingItemId ? t('review.s3.update') : t('review.s3.create')}
                        </Text>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {note.trim() ? (
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('review.s3.note', { note: note.trim() })}
              </Text>
            ) : null}

            <Nav
              left={
                <Button variant="ghost" onClick={() => goTo('2')}>
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  {t('review.previous')}
                </Button>
              }
              step={step}
              right={
                <Button disabled={save.isPending} onClick={submit}>
                  <Check aria-hidden="true" className="size-4" />
                  {t('review.save')}
                </Button>
              }
            />
          </section>
        ) : null}
      </div>
    </TeamEquipeShell>
  )
}

const TOPIC_ICON: Record<TopicKind, typeof Clock> = { late: Clock, follow: Briefcase, dateless: Route }

const NAV_LINK =
  'inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--bellum-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]'

function Nav({ left, right, step }: { left: React.ReactNode; right: React.ReactNode; step: Step }) {
  const { t } = useTranslation('manager')
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bellum-border)] pt-5">
      {left}
      <Text size="sm" className="text-[var(--bellum-text-accent)]">
        {t('review.stepOf', { step })}
      </Text>
      {right}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-4 text-center text-[var(--bellum-text-secondary)]">
      {children}
    </div>
  )
}
