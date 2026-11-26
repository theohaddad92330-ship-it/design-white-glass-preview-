import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ShieldCheck, Sunset } from 'lucide-react'
import type { DayClosure, DayClosureTask } from '@bellum/contracts'
import { DAY_CLOSURE_DECISIONS } from '@bellum/contracts'
import { Button, FilterChips, SelectField, Text, cn } from '@bellum/ui'
import { tasksApi } from '@/features/tasks/api'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { queryClient } from '@/lib/query-client'
import { CHAT_SURFACE } from './chat-surface'
import { ReplyActionBlock } from './reply-kit'
import { dayClosureChanges, type DayClosureChange, type TaskDecisionDraft } from './day-closure-diff'

/**
 * #2392 (LAU-FINAL-106) — LA CARTE DE CLÔTURE DE FIN DE JOURNÉE.
 *
 * Elle LIT ce que l'API a compilé (`compile_day_closure` → `day_closure`) et
 * ne recompose rien : sept sections, chacune absente quand elle est vide (on
 * n'affiche pas ce qu'on n'a pas), une source non lue DITE (`state`), aucun
 * compteur (#2392.7).
 *
 * Les tâches restées ouvertes se décident UNE PAR UNE (#2392.5) — reporter,
 * déléguer, requalifier, abandonner, marquer faite. Aucune n'est présélectionnée
 * et il n'existe pas de bouton « tout reporter » (#2392.9). Avant toute écriture,
 * la carte montre le DIFF ; le clic « Valider » écrit par la route de l'écran des
 * tâches (`PATCH /tasks/:id`), puis PROUVE tâche par tâche ce qui a changé
 * (#2392.4). Rien n'est envoyé à personne.
 */

type ApplyState = Record<string, 'ok' | 'failed'>

function tomorrowOf(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

function formatDay(day: string, language: string): string {
  const parsed = Date.parse(`${day}T12:00:00Z`)
  if (Number.isNaN(parsed)) return day
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {title}
      </Text>
      <ul className="space-y-1">{children}</ul>
    </section>
  )
}

function taskContext(task: DayClosureTask): string | null {
  return [task.accountName, task.contactName].filter(Boolean).join(' · ') || null
}

const INPUT_CLASS =
  'min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]'

export function DayClosureCard({ closure }: { closure: DayClosure }) {
  const { t, i18n } = useTranslation('chat')
  const members = useWorkspaceMembers()
  // Salle de démonstration : la carte se décide et montre son diff, mais rien
  // ne s'écrit — ses tâches sont celles du script, pas des lignes de la base.
  const isDemo = useIsDemo()
  const [decisions, setDecisions] = useState<Record<string, TaskDecisionDraft>>({})
  const [phase, setPhase] = useState<'decide' | 'review' | 'applying' | 'applied'>('decide')
  const [applied, setApplied] = useState<ApplyState>({})

  const changes = dayClosureChanges(closure.toDecide, decisions, closure.date)
  const memberName = (userId: string | null) => {
    const member = members.data?.find(entry => entry.userId === userId)
    return member?.fullName || member?.email || null
  }
  const locked = phase !== 'decide'

  function choose(task: DayClosureTask, kind: TaskDecisionDraft['kind']) {
    setDecisions(prev => {
      const draft: TaskDecisionDraft =
        kind === 'postpone'
          ? { kind, dueOn: tomorrowOf(closure.date) }
          : kind === 'delegate'
            ? { kind, ownerId: '' }
            : kind === 'requalify'
              ? { kind, title: task.title }
              : kind === 'drop'
                ? { kind, reason: '' }
                : { kind, note: '' }
      return { ...prev, [task.id]: draft }
    })
  }

  function clear(taskId: string) {
    setDecisions(prev => {
      const { [taskId]: _removed, ...rest } = prev
      return rest
    })
  }

  function edit(taskId: string, draft: TaskDecisionDraft) {
    setDecisions(prev => ({ ...prev, [taskId]: draft }))
  }

  async function apply() {
    setPhase('applying')
    const outcome: ApplyState = {}
    // Une par une : un échec ne masque pas les autres, et chaque ligne dit ce
    // qui s'est RÉELLEMENT passé pour sa tâche.
    for (const change of changes) {
      try {
        await tasksApi.update(change.taskId, change.patch)
        outcome[change.taskId] = 'ok'
      } catch {
        outcome[change.taskId] = 'failed'
      }
    }
    setApplied(outcome)
    setPhase('applied')
    void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    void queryClient.invalidateQueries({ queryKey: ['briefing'] })
  }

  function diffText(change: DayClosureChange): string {
    switch (change.kind) {
      case 'postpone':
        return t('dayClosure.diff.postpone', {
          title: change.title,
          before: formatDay(change.before ?? '', i18n.language),
          after: formatDay(change.after ?? '', i18n.language),
        })
      case 'delegate':
        return t('dayClosure.diff.delegate', { title: change.title, after: memberName(change.after) ?? '—' })
      case 'requalify':
        return t('dayClosure.diff.requalify', { before: change.before, after: change.after })
      case 'drop':
        return t('dayClosure.diff.drop', { title: change.title })
      case 'done':
        return t('dayClosure.diff.done', { title: change.title })
    }
  }

  const waiting = closure.waitingOn
  return (
    <div data-chat-kind="action" data-testid="day-closure-card" className={cn('space-y-3 p-3', CHAT_SURFACE.action)}>
      <div className="flex items-start gap-2">
        <Sunset aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
        <div className="min-w-0 flex-1 space-y-1">
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('dayClosure.title', { date: formatDay(closure.date, i18n.language) })}
          </Text>
          <div className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('dayClosure.guarantee')}
            </Text>
          </div>
        </div>
      </div>

      {closure.tasksState !== 'ready' ? (
        <Text size="xs" color="text-[var(--bellum-warning-text)]">
          {t('dayClosure.tasksUnavailable')}
        </Text>
      ) : null}

      {closure.results.length > 0 ? (
        <Section title={t('dayClosure.sections.results')}>
          {closure.results.map(task => (
            <li key={task.id}>
              <Text size="sm">{task.title}</Text>
              {task.resultNote ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {task.resultNote}
                </Text>
              ) : null}
            </li>
          ))}
          <li>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('dayClosure.checkedNote')}
            </Text>
          </li>
        </Section>
      ) : null}

      {closure.commitments.length > 0 ? (
        <Section title={t('dayClosure.sections.commitments')}>
          {closure.commitments.map(task => (
            <li key={task.id}>
              <Text size="sm">{task.title}</Text>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {[taskContext(task), t('dayClosure.dueOn', { date: formatDay(task.dueOn, i18n.language) })]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </li>
          ))}
        </Section>
      ) : null}

      {waiting.state === 'ready' || waiting.state === 'partial' ? (
        waiting.threads.length > 0 ? (
          <Section title={t('dayClosure.sections.waitingOn')}>
            {waiting.threads.map(thread => (
              <li key={thread.threadId}>
                <Text size="sm">{thread.counterpart ?? thread.subject ?? t('dayClosure.unknownThread')}</Text>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {[
                    thread.counterpart ? thread.subject : null,
                    thread.daysSinceLastMessage !== null
                      ? t('dayClosure.silentDays', { count: thread.daysSinceLastMessage })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </li>
            ))}
          </Section>
        ) : null
      ) : (
        <Section title={t('dayClosure.sections.waitingOn')}>
          <li>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t(`dayClosure.waitingState.${waiting.state}`)}
            </Text>
          </li>
        </Section>
      )}

      {closure.blocked.length > 0 ? (
        <Section title={t('dayClosure.sections.blocked')}>
          {closure.blocked.map(task => (
            <li key={task.id}>
              <Text size="sm">{task.title}</Text>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {task.resultNote ?? t('dayClosure.noReason')}
              </Text>
            </li>
          ))}
        </Section>
      ) : null}

      {closure.toDecide.length > 0 ? (
        <Section title={t('dayClosure.sections.toDecide')}>
          {closure.toDecide.map(task => {
            const draft = decisions[task.id]
            return (
              <li
                key={task.id}
                data-testid={`day-closure-task-${task.id}`}
                className="space-y-1.5 rounded-md bg-[var(--bellum-surface-2)] p-2"
              >
                <Text size="sm">{task.title}</Text>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {[taskContext(task), t('dayClosure.dueOn', { date: formatDay(task.dueOn, i18n.language) })]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {/* GA-249 — le composant de choix partagé : une décision à la fois,
                    un second clic la retire (la tâche redevient « sans décision »). */}
                {locked ? null : (
                  <FilterChips
                    size="sm"
                    clearable
                    ariaLabel={t('dayClosure.decisionFor', { title: task.title })}
                    options={DAY_CLOSURE_DECISIONS.map(kind => ({
                      value: kind,
                      label: t(`dayClosure.decision.${kind}`),
                    }))}
                    value={draft?.kind ?? null}
                    onChange={next => (next ? choose(task, next) : clear(task.id))}
                  />
                )}
                {draft?.kind === 'postpone' ? (
                  <input
                    type="date"
                    aria-label={t('dayClosure.fields.newDate')}
                    className={INPUT_CLASS}
                    min={tomorrowOf(closure.date)}
                    value={draft.dueOn}
                    disabled={locked}
                    onChange={event => edit(task.id, { kind: 'postpone', dueOn: event.target.value })}
                  />
                ) : null}
                {draft?.kind === 'delegate' ? (
                  <SelectField
                    ariaLabel={t('dayClosure.fields.owner')}
                    value={draft.ownerId}
                    disabled={locked}
                    onChange={next => edit(task.id, { kind: 'delegate', ownerId: next })}
                    emptyOption={{ label: t('dayClosure.fields.chooseOwner') }}
                    options={(members.data ?? [])
                      .filter(member => member.userId !== task.ownerId)
                      .map(member => ({
                        value: member.userId,
                        label: member.fullName || member.email || member.userId,
                      }))}
                  />
                ) : null}
                {draft?.kind === 'requalify' ? (
                  <input
                    type="text"
                    aria-label={t('dayClosure.fields.newTitle')}
                    className={INPUT_CLASS}
                    value={draft.title}
                    maxLength={300}
                    disabled={locked}
                    onChange={event => edit(task.id, { kind: 'requalify', title: event.target.value })}
                  />
                ) : null}
                {draft?.kind === 'drop' ? (
                  <input
                    type="text"
                    aria-label={t('dayClosure.fields.dropReason')}
                    placeholder={t('dayClosure.fields.dropReason')}
                    className={INPUT_CLASS}
                    value={draft.reason}
                    maxLength={2000}
                    disabled={locked}
                    onChange={event => edit(task.id, { kind: 'drop', reason: event.target.value })}
                  />
                ) : null}
                {draft?.kind === 'done' ? (
                  <input
                    type="text"
                    aria-label={t('dayClosure.fields.doneNote')}
                    placeholder={t('dayClosure.fields.doneNote')}
                    className={INPUT_CLASS}
                    value={draft.note}
                    maxLength={2000}
                    disabled={locked}
                    onChange={event => edit(task.id, { kind: 'done', note: event.target.value })}
                  />
                ) : null}
                {applied[task.id] ? (
                  <Text
                    size="xs"
                    color={
                      applied[task.id] === 'ok'
                        ? 'text-[var(--bellum-success-text)]'
                        : 'text-[var(--bellum-warning-text)]'
                    }
                  >
                    {t(applied[task.id] === 'ok' ? 'dayClosure.applied' : 'dayClosure.failed')}
                  </Text>
                ) : null}
              </li>
            )
          })}
          <li>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('dayClosure.noDecisionNote')}
            </Text>
          </li>
        </Section>
      ) : null}

      {closure.toValidate.state !== 'ready' ? (
        <Section title={t('dayClosure.sections.toValidate')}>
          <li>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('dayClosure.toValidateUnavailable')}
            </Text>
          </li>
        </Section>
      ) : closure.toValidate.cards.length > 0 ? (
        <Section title={t('dayClosure.sections.toValidate')}>
          {closure.toValidate.cards.map(card => (
            <li key={card.id}>
              <Text size="sm">{card.label}</Text>
            </li>
          ))}
          <li>
            <Link
              to="/actions"
              className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
            >
              {t('dayClosure.openActions')}
            </Link>
          </li>
        </Section>
      ) : null}

      {closure.firstTomorrow ? (
        <Section title={t('dayClosure.sections.firstTomorrow')}>
          <li>
            <Text size="sm">{closure.firstTomorrow.title}</Text>
            {taskContext(closure.firstTomorrow) ? (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {taskContext(closure.firstTomorrow)}
              </Text>
            ) : null}
          </li>
        </Section>
      ) : null}

      {/* #3761.16 — la revue du diff est le bloc de validation de reply-kit : un seul patron « Laura prépare,
          tu valides ». Aucun bouton « envoyer » ; en démonstration, le diff se montre et rien ne s'écrit. */}
      {phase === 'review' || phase === 'applying' ? (
        <ReplyActionBlock
          title={t('dayClosure.diffTitle')}
          validateLabel={t('dayClosure.validate', { count: changes.length })}
          editLabel={t('dayClosure.back')}
          note={null}
          onValidate={isDemo ? undefined : () => void apply()}
          onEdit={() => setPhase('decide')}
          disabled={phase === 'applying'}
        >
          <ul data-testid="day-closure-diff" className="list-disc space-y-0.5 pl-4">
            {changes.map(change => (
              <li key={change.taskId}>
                <Text size="sm">{diffText(change)}</Text>
              </li>
            ))}
          </ul>
          {isDemo ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('dayClosure.demoNothingSaved')}
            </Text>
          ) : null}
        </ReplyActionBlock>
      ) : null}

      {closure.toDecide.length > 0 && phase === 'decide' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={changes.length === 0} onClick={() => setPhase('review')}>
            {t('dayClosure.review', { count: changes.length })}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
