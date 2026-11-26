import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Check, Copy, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import type {
  FocusPlan,
  FocusPlanBlock,
  FocusPlanBlockOutcome,
  FocusPlanTeamPolicy,
  FocusPlanUnreadSource,
  FocusWeekPlan,
} from '@bellum/contracts'
import {
  FOCUS_PLAN_ACTUAL_MINUTES_MAX,
  FOCUS_PLAN_BLOCK_OUTCOMES,
  FOCUS_PLAN_OUTCOME_NOTE_MAX,
  formatTeamPolicyMinute,
} from '@bellum/contracts'
import { Button, Input, Text, cn, useCopiedFlash } from '@bellum/ui'
import { useCancelFocusPlanBlock, useConfirmFocusPlanBlock, useSetFocusPlanBlockOutcome } from '@/features/briefing/api'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { TOAST_PROBLEM_MS, TOAST_SUCCESS_MS } from '@/lib/toast-duration'
import { CHAT_SURFACE } from './chat-surface'

/**
 * #2391 (LAU-FINAL-105) — LA CARTE DU PLAN DE JOURNÉE (« focus plan »).
 *
 * Même famille que `DayClosureCard` (#2392) : elle LIT ce que l'outil de chat
 * a compilé (`propose_focus_plan` → `plan`) et ne recompose rien. Une section
 * absente ne fait aucune ligne (on n'affiche pas ce qu'on n'a pas) — un plan
 * sans bloc placé le dit plutôt que de montrer une liste vide sans
 * explication, une échéance ou un contexte absents ne font aucune ligne.
 *
 * #2770.49/.50/.51 (28/09/2026) — `propose_focus_plan` N'ÉCRIT toujours rien :
 * la carte reste une proposition à REVOIR. Mais chaque bloc RÉELLEMENT placé
 * porte désormais un geste explicite, « Ajouter à mon agenda », qui écrit CE
 * bloc précis (`BriefingService.confirmFocusPlanBlock`) — jamais les autres,
 * jamais seul. Salle de démonstration : comme toute écriture agenda, le geste
 * n'y est pas proposé (même raison que `DayClosureCard.demoNothingSaved`).
 *
 * #2770.47 — « permet de modifier les blocs proposés » : tranché sans Louis
 * dans le sens le plus sûr sans former de compte — retirer un bloc de la
 * proposition avant d'en décider (jamais un éditeur de titre/horaire, qui
 * exigerait un formulaire dédié). Le plan n'étant jamais persisté ailleurs que
 * cette carte, retirer un bloc EST la seule édition qui a un sens ici : le
 * bloc retiré ne redeviendra jamais actionnable sur cette carte, comme une
 * vraie suppression, jamais un simple masquage réversible.
 *
 * #2770.54 — « sans droit d'écriture, permet export ou copie » : un bouton
 * « Copier le plan » (texte brut, presse-papier) est TOUJOURS proposé, qu'un
 * agenda soit connecté en écriture ou non — c'est la voie de secours quand
 * #2770.49/.50/.51 ne peut pas écrire (agenda lecture seule, pas connecté).
 *
 * #2770.52 (30/09/2026) — « permet l'annulation des blocs créés » : un bloc
 * confirmé porte désormais l'identifiant RÉEL rendu par `confirmFocusPlanBlock`
 * (`AgendaCreateResult.id`), et un bouton « Annuler » l'envoie tel quel à
 * `AgendaService.deleteEvent` via `cancelFocusPlanBlock` — la primitive de
 * suppression que six lots précédents (25→29/09) avaient vérifiée absente.
 *
 * #2770.63/.64/.65 (30/09/2026) — « mesure : réalisé/interrompu/reporté » :
 * un bloc CONFIRMÉ (jamais annulé) porte désormais trois boutons d'état,
 * DÉCLARÉS par un clic (#2391.56 — jamais déduits de l'agenda ou d'un
 * minuteur). Une correction gagne toujours : re-cliquer un autre état le
 * remplace (`setFocusPlanBlockOutcome`, upsert).
 */

export function formatDay(day: string, language: string): string {
  const parsed = Date.parse(`${day}T12:00:00Z`)
  if (Number.isNaN(parsed)) return day
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed)
}

/** L'heure locale d'un ISO, dans le fuseau APPLICABLE du plan — jamais celui du navigateur quand on le connaît. */
function formatTime(iso: string, language: string, timeZone: string | null): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(parsed)
}

function timeRange(block: FocusPlanBlock, language: string, timeZone: string | null): string | null {
  if (!block.start_iso || !block.end_iso) return null
  return `${formatTime(block.start_iso, language, timeZone)}–${formatTime(block.end_iso, language, timeZone)}`
}

export function durationLabel(minutes: number, t: ReturnType<typeof useTranslation<'chat'>>['t']): string {
  if (minutes < 60) return t('focusPlan.durationMinutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? t('focusPlan.durationHours', { count: hours })
    : t('focusPlan.durationHoursMinutes', { hours, minutes: rest })
}

/**
 * #2770.35/.36/.37 — ce que le plan n'a PAS pris en compte (outils branchés,
 * rôle, politique d'équipe), NOMMÉ plutôt que tu. `null` sans liste : un plan
 * d'avant ce champ ne fait aucune ligne.
 */
function unreadSourcesLine(
  sources: readonly FocusPlanUnreadSource[] | undefined,
  t: ReturnType<typeof useTranslation<'chat'>>['t'],
): string | null {
  if (!sources || sources.length === 0) return null
  return t('focusPlan.unreadSources', {
    sources: sources.map(source => t(`focusPlan.unreadSource.${source}`)).join(', '),
  })
}

type ChatT = ReturnType<typeof useTranslation<'chat'>>['t']

function policyRanges(windows: FocusPlanTeamPolicy['prospecting_windows'], t: ChatT): string {
  return windows
    .map(window =>
      t(window.weekdays ? 'focusPlan.teamPolicyRangeDays' : 'focusPlan.teamPolicyRange', {
        start: formatTeamPolicyMinute(window.start_minute),
        end: formatTeamPolicyMinute(window.end_minute),
        days: window.weekdays?.map(day => t(`focusPlan.weekdayShort.${day}`)).join(', '),
      }),
    )
    .join(', ')
}

/**
 * #2770.35/.37 (décision Louis 11/10) — CE QUE LE PLAN A LU, en lignes : les outils
 * branchés qu'il a pris en compte, la politique d'équipe appliquée (ou « aucune
 * saisie »), le plafond de réunions et l'objectif d'appels confrontés au plan, puis
 * ce qu'il n'a PAS lu. Chaque ligne n'existe que si sa donnée existe : un plan d'avant
 * ces champs, ou des réunions non comptées, ne font aucune ligne (jamais « 0 »).
 */
export function planInputsLines(
  plan: Pick<FocusWeekPlan, 'connected_tools' | 'team_policy' | 'unread_sources'> & Pick<FocusPlan, 'meetings_count'>,
  t: ChatT,
  { callSessionPlaced }: { callSessionPlaced: boolean },
): string[] {
  const lines: string[] = []
  if (plan.connected_tools) {
    lines.push(
      plan.connected_tools.length > 0
        ? t('focusPlan.connectedTools', {
            tools: plan.connected_tools.map(tool => t(`focusPlan.toolFamily.${tool}`)).join(', '),
          })
        : t('focusPlan.connectedToolsNone'),
    )
  }
  const policy = plan.team_policy
  if (policy === null) lines.push(t('focusPlan.teamPolicyNone'))
  if (policy) {
    const rules: string[] = []
    if (policy.prospecting_windows.length > 0) {
      rules.push(t('focusPlan.teamPolicyRule.prospecting', { ranges: policyRanges(policy.prospecting_windows, t) }))
    }
    if (policy.forbidden_windows.length > 0) {
      rules.push(t('focusPlan.teamPolicyRule.forbidden', { ranges: policyRanges(policy.forbidden_windows, t) }))
    }
    if (policy.max_meetings_per_day !== null) {
      rules.push(t('focusPlan.teamPolicyRule.maxMeetings', { count: policy.max_meetings_per_day }))
    }
    if (policy.daily_call_target !== null) {
      rules.push(t('focusPlan.teamPolicyRule.callTarget', { count: policy.daily_call_target }))
    }
    lines.push(t('focusPlan.teamPolicy', { rules: rules.join(' ; ') }))
    const cap = policy.max_meetings_per_day
    if (cap !== null && plan.meetings_count !== undefined && plan.meetings_count >= cap) {
      lines.push(t('focusPlan.meetingsOverCap', { count: plan.meetings_count, cap }))
    }
    if (policy.daily_call_target !== null && !callSessionPlaced) {
      lines.push(t('focusPlan.callTargetUncovered', { count: policy.daily_call_target }))
    }
  }
  const unread = unreadSourcesLine(plan.unread_sources, t)
  if (unread) lines.push(unread)
  return lines
}

/** L'issue enregistrée d'un bloc (V4-CORRECTIFS-B 4293.8). */
interface ClosedOutcome {
  outcome: FocusPlanBlockOutcome
  note?: string
  actualMinutes?: number
  open: boolean
}

/** La même clé que le `key` de la liste — stable pour un bloc PLACÉ (horaires réels). */
function blockKey(block: FocusPlanBlock, index: number): string {
  return `${block.type}-${block.start_iso ?? index}`
}

/**
 * #2770.66/.67 (#2391.54/.55) — ce que la personne PEUT ajouter une fois l'état
 * du bloc choisi : le résultat en une phrase et la durée réelle qu'elle tape.
 * Facultatifs l'un et l'autre, montrés seulement APRÈS le clic (le clic seul
 * reste un geste complet) et jamais pré-remplis ni mesurés (#2391.56).
 */
function BlockOutcomeDetails({
  pending,
  initialNote,
  initialMinutes,
  onSave,
}: {
  pending: boolean
  initialNote?: string
  initialMinutes?: number
  onSave: (details: { note?: string; actualMinutes?: number }) => void
}) {
  const { t } = useTranslation('chat')
  const [note, setNote] = useState(initialNote ?? '')
  const [minutes, setMinutes] = useState(initialMinutes !== undefined ? String(initialMinutes) : '')
  const trimmed = note.trim()
  const parsedMinutes = minutes.trim() === '' ? undefined : Number(minutes)
  const minutesValid =
    parsedMinutes === undefined ||
    (Number.isInteger(parsedMinutes) && parsedMinutes >= 1 && parsedMinutes <= FOCUS_PLAN_ACTUAL_MINUTES_MAX)
  const canSave = (trimmed !== '' || parsedMinutes !== undefined) && minutesValid && !pending
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        value={note}
        maxLength={FOCUS_PLAN_OUTCOME_NOTE_MAX}
        onChange={event => setNote(event.target.value)}
        placeholder={t('focusPlan.outcome.notePlaceholder')}
        aria-label={t('focusPlan.outcome.noteLabel')}
        className="min-w-0 flex-1"
      />
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={FOCUS_PLAN_ACTUAL_MINUTES_MAX}
        value={minutes}
        onChange={event => setMinutes(event.target.value)}
        placeholder={t('focusPlan.outcome.minutesPlaceholder')}
        aria-label={t('focusPlan.outcome.minutesLabel')}
        aria-invalid={!minutesValid}
        className="w-28"
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!canSave}
        onClick={() =>
          onSave({
            ...(trimmed !== '' ? { note: trimmed } : {}),
            ...(parsedMinutes !== undefined ? { actualMinutes: parsedMinutes } : {}),
          })
        }
      >
        {t('focusPlan.outcome.saveDetails')}
      </Button>
    </div>
  )
}

/**
 * #2770.54 — le plan tel qu'affiché, en texte brut : mêmes lignes que la
 * carte (aucune donnée qu'elle ne montre déjà), pour copier ailleurs quand
 * l'agenda ne peut pas s'écrire directement.
 */
export function planAsText(
  plan: FocusPlan,
  t: ReturnType<typeof useTranslation<'chat'>>['t'],
  language: string,
  withMargin = true,
): string {
  const lines = [t('focusPlan.title', { date: formatDay(plan.date, language) })]
  for (const block of plan.blocks) {
    const range = timeRange(block, language, plan.time_zone)
    lines.push(`${range ? `${range} · ` : ''}${t(`focusPlan.blockType.${block.type}`)} — ${block.title}`)
  }
  if (plan.deferred_blocks.length > 0) {
    lines.push(t('focusPlan.deferredTitle'))
    for (const deferred of plan.deferred_blocks) {
      lines.push(`${deferred.title} — ${t(`focusPlan.deferredReason.${deferred.reason}`)}`)
    }
  }
  if (withMargin) {
    // #2770 (recette prod 08/10) — même garde que la carte : pas de marge « laissées
    // libres » à côté d'un plan sans aucun bloc placé.
    if (plan.blocks.length > 0) lines.push(t('focusPlan.margin', { duration: durationLabel(plan.margin_minutes, t) }))
    lines.push(...planInputsLines(plan, t, { callSessionPlaced: hasCallSession(plan) }))
  }
  return lines.join('\n')
}

/**
 * `variant="embedded"` (#2770.55-.62) — un JOUR du plan de semaine : même blocs et
 * mêmes gestes, mais sans cadre propre, sans garantie ni copie ni marge (la carte
 * de la semaine les porte UNE fois) — jamais une carte dans la carte.
 */
export function FocusPlanCard({ plan, variant = 'card' }: { plan: FocusPlan; variant?: 'card' | 'embedded' }) {
  const embedded = variant === 'embedded'
  const { t, i18n } = useTranslation('chat')
  const language = i18n.language
  const isDemo = useIsDemo()
  const confirmBlock = useConfirmFocusPlanBlock()
  const cancelBlock = useCancelFocusPlanBlock()
  const setOutcome = useSetFocusPlanBlockOutcome()
  const [confirmedKeys, setConfirmedKeys] = useState<Record<string, string>>({})
  const [cancelledKeys, setCancelledKeys] = useState<Record<string, true>>({})
  const [dismissedKeys, setDismissedKeys] = useState<Record<string, true>>({})
  // V4-CORRECTIFS-B 4293.8 — l'issue ENREGISTRÉE d'un bloc (un seul état par bloc : la
  // seconde clôture remplace la première, comme l'upsert serveur). `open` = la clôture
  // est encore en cours de saisie ; refermée par « Enregistrer », rouverte par « Modifier ».
  const [outcomeKeys, setOutcomeKeys] = useState<Record<string, ClosedOutcome>>({})
  const [copied, flashCopied] = useCopiedFlash(2000)

  async function onCopyPlan() {
    try {
      await navigator.clipboard.writeText(planAsText(plan, t, language))
      flashCopied()
      toast.success(t('focusPlan.planCopied'), { duration: TOAST_SUCCESS_MS })
    } catch {
      toast.error(t('focusPlan.planCopyFailed'), { duration: TOAST_PROBLEM_MS })
    }
  }

  function onConfirmBlock(key: string, block: FocusPlanBlock) {
    if (!block.start_iso || !block.end_iso) return
    confirmBlock.mutate(
      { type: block.type, title: block.title, start_iso: block.start_iso, end_iso: block.end_iso },
      {
        onSuccess: result => setConfirmedKeys(prev => ({ ...prev, [key]: result.id })),
        onError: (error: Error) => toast.error(error.message || t('focusPlan.confirmBlockError')),
      },
    )
  }

  /** #2770.52 — n'envoie que l'identifiant que la confirmation a réellement rendu. */
  function onCancelBlock(key: string, eventId: string) {
    cancelBlock.mutate(eventId, {
      onSuccess: () => {
        setCancelledKeys(prev => ({ ...prev, [key]: true }))
        setConfirmedKeys(prev => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      },
      onError: (error: Error) => toast.error(error.message || t('focusPlan.cancelBlockError')),
    })
  }

  /** #2770.63/.64/.65 — un clic DÉCLARÉ, jamais déduit. Une correction gagne toujours. */
  function onSetOutcome(
    key: string,
    eventId: string,
    outcome: FocusPlanBlockOutcome,
    details: { note?: string; actualMinutes?: number } = {},
  ) {
    setOutcome.mutate(
      { eventId, outcome, ...details },
      {
        onSuccess: () =>
          setOutcomeKeys(prev => ({
            ...prev,
            [key]: {
              outcome,
              // Le serveur garde ce qui n'est pas renvoyé (un silence ne corrige rien) : l'écran aussi.
              note: details.note ?? prev[key]?.note,
              actualMinutes: details.actualMinutes ?? prev[key]?.actualMinutes,
              open: details.note === undefined && details.actualMinutes === undefined,
            },
          })),
        onError: (error: Error) => toast.error(error.message || t('focusPlan.outcome.error')),
      },
    )
  }

  const allDismissed =
    plan.blocks.length > 0 && plan.blocks.every((block, index) => dismissedKeys[blockKey(block, index)])

  return (
    <div
      {...(embedded ? {} : { 'data-chat-kind': 'action', 'data-testid': 'focus-plan-card' })}
      className={cn('space-y-3', embedded ? null : cn('p-3', CHAT_SURFACE.action))}
    >
      {embedded ? (
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {formatDay(plan.date, language)}
        </Text>
      ) : (
        <div className="flex items-start gap-2">
          <CalendarRange aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div className="min-w-0 flex-1 space-y-1">
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {t('focusPlan.title', { date: formatDay(plan.date, language) })}
            </Text>
            <div className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('focusPlan.guarantee')}
              </Text>
            </div>
          </div>
          {/* #2770.54 — toujours disponible, qu'un agenda soit connecté en écriture ou non. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t('focusPlan.copyPlan')}
            onClick={() => void onCopyPlan()}
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          </Button>
        </div>
      )}

      {/* #2391.18 — l'énergie DÉCLARÉE, jamais mesurée : absente quand rien n'a été dit. */}
      {plan.energy ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t(`focusPlan.energy.${plan.energy}`)}
        </Text>
      ) : null}

      {plan.blocks.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('focusPlan.noBlockPlaced')}
        </Text>
      ) : allDismissed ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('focusPlan.allBlocksDismissed')}
        </Text>
      ) : (
        <ul className="space-y-2">
          {plan.blocks.map((block, index) => {
            const key = blockKey(block, index)
            if (dismissedKeys[key]) return null
            const confirmedEventId = confirmedKeys[key]
            const cancelled = cancelledKeys[key] === true
            const closed = outcomeKeys[key]
            const canWrite = Boolean(block.start_iso && block.end_iso)
            return (
              <li key={key} className="space-y-0.5">
                {/* #2391.3-.13 — le TYPE du bloc, nommé, pas seulement son titre libre. */}
                <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-accent)]">
                  {t(`focusPlan.blockType.${block.type}`)}
                </Text>
                <div className="flex items-baseline justify-between gap-2">
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {block.title}
                  </Text>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]" className="shrink-0">
                    {[timeRange(block, language, plan.time_zone), durationLabel(block.duration_minutes, t)]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </div>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {block.priority_reason}
                </Text>
                {block.deadline ? (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('focusPlan.dueOn', { date: formatDay(block.deadline, language) })}
                  </Text>
                ) : null}
                {block.context ? (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {block.context}
                  </Text>
                ) : null}
                {/* #2770.49/.50/.51 — UN bloc à la fois, sur un geste explicite, jamais seul. */}
                {cancelled ? (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('focusPlan.blockCancelled')}
                  </Text>
                ) : confirmedEventId ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Text size="xs" weight="medium" className="text-[var(--success-soft-text)]">
                        {t('focusPlan.blockConfirmed')}
                      </Text>
                      {/* #2770.52 — revient sur l'écriture que le bouton du dessus vient de faire. */}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={cancelBlock.isPending}
                        onClick={() => onCancelBlock(key, confirmedEventId)}
                      >
                        {t('focusPlan.cancelBlock')}
                      </Button>
                    </div>
                    {/* #2770.63/.64/.65 — la mesure post-bloc, un clic déclaré, jamais une surveillance. */}
                    {closed ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* V4-CORRECTIFS-B 4293.8 — l'issue enregistrée SE VOIT (état, résultat, durée). */}
                        <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                          {[
                            t('focusPlan.outcome.recorded', { outcome: t(`focusPlan.outcome.${closed.outcome}`) }),
                            closed.note,
                            closed.actualMinutes !== undefined ? durationLabel(closed.actualMinutes, t) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                        {closed.open ? null : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setOutcomeKeys(prev => ({ ...prev, [key]: { ...closed, open: true } }))}
                          >
                            {t('focusPlan.outcome.edit')}
                          </Button>
                        )}
                      </div>
                    ) : null}
                    {!closed || closed.open ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {FOCUS_PLAN_BLOCK_OUTCOMES.map(outcome => (
                          <Button
                            key={outcome}
                            type="button"
                            size="sm"
                            variant={closed?.outcome === outcome ? 'secondary' : 'ghost'}
                            disabled={setOutcome.isPending}
                            onClick={() => onSetOutcome(key, confirmedEventId, outcome)}
                          >
                            {t(`focusPlan.outcome.${outcome}`)}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                    {/* #2770.66/.67 — facultatif, après le clic : résultat libre et durée tapée. */}
                    {closed?.open ? (
                      <BlockOutcomeDetails
                        key={closed.outcome}
                        pending={setOutcome.isPending}
                        initialNote={closed.note}
                        initialMinutes={closed.actualMinutes}
                        onSave={details => onSetOutcome(key, confirmedEventId, closed.outcome, details)}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {canWrite ? (
                      isDemo ? (
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {t('focusPlan.demoNothingSaved')}
                        </Text>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={confirmBlock.isPending}
                          onClick={() => onConfirmBlock(key, block)}
                        >
                          {t('focusPlan.confirmBlock')}
                        </Button>
                      )
                    ) : null}
                    {/* #2770.47 — retirer un bloc de la proposition, jamais un éditeur de titre/horaire. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDismissedKeys(prev => ({ ...prev, [key]: true }))}
                    >
                      {t('focusPlan.dismissBlock')}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* #2391.33 — l'excédent, NOMMÉ, jamais tu : la journée n'est pas surchargée pour tout caser. */}
      {plan.deferred_blocks.length > 0 ? (
        <div className="space-y-1">
          <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t('focusPlan.deferredTitle')}
          </Text>
          <ul className="space-y-0.5">
            {plan.deferred_blocks.map((deferred, index) => (
              <li key={`${deferred.type}-${index}`}>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {deferred.title} — {t(`focusPlan.deferredReason.${deferred.reason}`)}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* #2391.30/.32 — la marge, toujours dite : jamais une journée présentée pleine à ras bord.
          #2770 (recette prod 08/10) — SAUF à 0 bloc placé : « N h laissées libres » contredirait
          alors « aucun bloc placé », une carte ne dit jamais deux vérités opposées (même garde que
          `WeeklyPlanCard`, `days.length > 0`). */}
      {embedded || plan.blocks.length === 0 ? null : (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('focusPlan.margin', { duration: durationLabel(plan.margin_minutes, t) })}
        </Text>
      )}

      {/* #2770.35/.36/.37 — ce que le plan a lu (outils branchés, politique d'équipe) et ce qu'il n'a pas pu
          lire se nomment, jamais tus ; la semaine le dit une fois. */}
      {embedded ? null : <PlanInputs lines={planInputsLines(plan, t, { callSessionPlaced: hasCallSession(plan) })} />}
    </div>
  )
}

export function hasCallSession(plan: Pick<FocusPlan, 'blocks'>): boolean {
  return plan.blocks.some(block => block.type === 'call_session')
}

export function PlanInputs({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null
  return (
    <div className="space-y-0.5">
      {lines.map(line => (
        <Text key={line} element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {line}
        </Text>
      ))}
    </div>
  )
}
