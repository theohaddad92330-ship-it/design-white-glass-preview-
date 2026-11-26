import { ACTION_DISPATCH_BULK_MAX, type ActionIntent } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  Textarea,
} from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Check, Sparkles, Upload, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import { actionsApi } from '@/features/actions/api'
import { gestureIdempotency, type GestureIdempotency } from '@/features/actions/lib/gesture-idempotency'
import { useCrmStatus } from '@/features/crm/hooks/useCrmStatus'

/** A contact the dispatch can act on — just the id + a display name. */
type ExecutableContact = { id: string; name: string }

type ActionKind = 'schedule_reminder' | 'enrich_contact' | 'create_crm_task'

/** Normalised outcome shown after a single OR bulk dispatch. */
type DispatchSummary = {
  total: number
  done: number
  queued: number
  skipped: number
  failed: number
  /** Single-dispatch reason (for a skipped / failed one-off). */
  reason?: string
  /** Whether this was a one-contact dispatch (drives the result copy). */
  single: boolean
}

/**
 * Un intent PRÊT À PARTIR et la façon de déclarer son geste fini (#1952.38).
 *
 * L'intent porte déjà sa clé ; `release` est ce qui rouvre la porte à un geste
 * refait délibérément une fois l'issue connue. Les deux voyagent ensemble parce
 * que les séparer reviendrait à recalculer les coordonnées ailleurs, et deux
 * dérivations d'une même clé finissent toujours par diverger.
 */
type DispatchGesture = {
  intent: ActionIntent
  release: GestureIdempotency['release']
}

type ExecuteActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 1 contact → `POST /actions/dispatch`; many → `POST /actions/dispatch/bulk`. */
  contacts: readonly ExecutableContact[]
  contextLabel?: string
  /** Fired after a run completes and the user closes the summary. */
  onDone?: (summary: { total: number; done: number; failed: number }) => void
}

/**
 * Ce que CE lot engage AU MAXIMUM, en crédits — `null` quand l'action est
 * incluse dans l'abonnement.
 *
 * Le total exact ne peut PAS être connu avant le run : seul un contact pour
 * lequel un fournisseur trouve une coordonnée est débité
 * (`ContactsService.enrichContact` ne consomme un crédit que sur `matched`).
 * Inventer une estimation reviendrait à écrire un chiffre que rien ne mesure ;
 * on annonce donc la borne HAUTE, et l'écran dit pourquoi elle peut être
 * moindre. Le prix unitaire vient de la grille, jamais d'un littéral.
 */
/** Default the reminder picker to the next round hour. */
function nextHourLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

/**
 * Review-before-execute dispatcher for the Action Router (§3 — "passer de la
 * recommandation à l'exécution"). One reusable dialog for a single recommendation
 * (NextBestActionCard) and for a multi-contact selection. An outbound action is
 * NEVER automatic: the user picks the action, reviews it, and clicks Execute. The
 * server re-resolves ownership + opt-out and skips (never fakes) any contact that
 * fails a precondition — those come back in the summary.
 */
export function ExecuteActionDialog({ open, onOpenChange, contacts, contextLabel, onDone }: ExecuteActionDialogProps) {
  const { t } = useTranslation('actions')
  const crm = useCrmStatus().data
  const [kind, setKind] = useState<ActionKind>('schedule_reminder')
  const [reminderAt, setReminderAt] = useState('')
  const [note, setNote] = useState('')
  const [summary, setSummary] = useState<DispatchSummary | null>(null)

  const crmConnected = !!crm?.connected

  // Re-seed the ephemeral state each time the dialog (re)opens so a second run
  // never inherits the previous batch's summary or a stale reminder time.
  useEffect(() => {
    if (open) {
      setKind('schedule_reminder')
      setReminderAt(nextHourLocal())
      setNote('')
      setSummary(null)
    }
  }, [open])

  const targets = contacts.slice(0, ACTION_DISPATCH_BULK_MAX)
  const overCap = contacts.length > ACTION_DISPATCH_BULK_MAX
  const count = targets.length

  const run = useMutation({
    /**
     * #1952.38 — LA CLÉ D'IDEMPOTENCE DU GESTE, QUI MANQUAIT ICI.
     *
     * `ActionRouterService.dispatchIdempotent` rend la main à `dispatchOne` dès
     * que `idempotencyKey` est absente : la protection du routeur existait et
     * ne protégeait rien depuis cette fenêtre — celle qui engage le plus, car
     * un seul clic peut porter cinquante contacts.
     *
     * ⚠️ UNE CLÉ PAR CONTACT, jamais une pour le lot : le routeur déduplique
     * sur (espace, clé), donc une clé commune ferait exécuter le premier intent
     * et avaler les quarante-neuf autres — sans qu'aucun d'eux n'échoue.
     */
    mutationFn: async (gestures: DispatchGesture[]): Promise<DispatchSummary> => {
      const intents = gestures.map(g => g.intent)
      if (intents.length === 1) {
        const r = await actionsApi.dispatch(intents[0])
        // L'issue est CONNUE et la fenêtre va la dire : le geste est fini, un
        // prochain clic en sera un autre. Jamais sur `unknown` — la requête a
        // peut-être abouti, et relâcher la clé laisserait un re-clic refaire
        // partir ce qui est déjà parti (doctrine « un timeout n'est pas un
        // échec »).
        if (r.status !== 'unknown') gestures[0].release()
        return {
          total: 1,
          done: r.status === 'done' ? 1 : 0,
          queued: r.status === 'queued' ? 1 : 0,
          skipped: r.status === 'skipped' ? 1 : 0,
          failed: r.status === 'failed' ? 1 : 0,
          reason: r.reason,
          single: true,
        }
      }
      const r = await actionsApi.dispatchBulk({ intents })
      // ⚠️ UN SEUL `unknown` retient TOUT le lot. `results` ne porte aucun
      // identifiant de contact : les rapprocher par position serait une
      // jointure positionnelle, et le dépôt en a déjà payé une. On tranche donc
      // par le lot entier, dans le sens sûr — relire ce qui s'est passé plutôt
      // que risquer de le refaire.
      if (!r.results.some(one => one.status === 'unknown')) gestures.forEach(gesture => gesture.release())
      return { ...r.summary, single: false }
    },
    onSuccess: setSummary,
    onError: (err: unknown) =>
      toast.error(err instanceof Error && err.message ? err.message : t('execute.errorGeneric')),
  })

  /**
   * Les intents du geste, chacun avec SA clé d'idempotence (#1952.38).
   *
   * Les coordonnées sont celles de la décision prise dans cette fenêtre : le
   * contact visé, et ce que l'utilisateur a choisi — l'échéance, la note, le
   * CRM. Deux gestes qui diffèrent par l'une de ces valeurs sont deux gestes ;
   * le même geste refait après un rafraîchissement est le même. La règle
   * entière est dans `gestureIdempotency`.
   *
   * ⚠️ Appelé AU CLIC, jamais au rendu : une fenêtre ouverte puis annulée ne
   * doit rien laisser derrière elle.
   */
  const buildGestures = (): DispatchGesture[] =>
    targets.map(contact => {
      const trimmed = note.trim()
      if (kind === 'enrich_contact') {
        const gesture = gestureIdempotency('execute.enrich_contact', [contact.id])
        return {
          intent: { type: 'enrich_contact', contactId: contact.id, idempotencyKey: gesture.key },
          release: gesture.release,
        }
      }
      if (kind === 'create_crm_task') {
        const crmProvider = crm?.provider ?? 'hubspot'
        const gesture = gestureIdempotency('execute.create_crm_task', [contact.id, crmProvider, trimmed])
        return {
          intent: {
            type: 'create_crm_task',
            contactId: contact.id,
            crmProvider,
            ...(trimmed ? { note: trimmed } : {}),
            idempotencyKey: gesture.key,
          },
          release: gesture.release,
        }
      }
      const at = new Date(reminderAt).toISOString()
      const gesture = gestureIdempotency('execute.schedule_reminder', [contact.id, at, trimmed])
      return {
        intent: {
          type: 'schedule_reminder',
          contactId: contact.id,
          at,
          ...(trimmed ? { note: trimmed } : {}),
          idempotencyKey: gesture.key,
        },
        release: gesture.release,
      }
    })

  const canRun =
    count > 0 &&
    (kind === 'schedule_reminder' ? reminderAt.length > 0 : true) &&
    (kind === 'create_crm_task' ? crmConnected : true)

  const handleClose = () => {
    if (run.isPending) return
    onOpenChange(false)
    if (summary) onDone?.(summary)
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
        {summary ? (
          <ResultView summary={summary} onClose={handleClose} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[var(--bellum-text-primary)]">
                <Zap className="size-4" aria-hidden />
                {t('execute.title')}
              </DialogTitle>
              <DialogDescription className="text-[var(--bellum-text-secondary)]">
                {count <= 1
                  ? t('execute.subtitleOne', { name: contextLabel ?? targets[0]?.name ?? '' })
                  : t('execute.subtitleMany', { count })}
              </DialogDescription>
            </DialogHeader>

            <Box className="space-y-3">
              <Label>{t('execute.chooseAction')}</Label>
              <ActionOption
                icon={CalendarClock}
                label={t('execute.actions.reminder')}
                description={t('execute.actions.reminderDesc')}
                active={kind === 'schedule_reminder'}
                onSelect={() => setKind('schedule_reminder')}
              />
              <ActionOption
                icon={Sparkles}
                label={t('execute.actions.enrich')}
                description={t('execute.enrichHint')}
                active={kind === 'enrich_contact'}
                onSelect={() => setKind('enrich_contact')}
              />
              <ActionOption
                icon={Upload}
                label={t('execute.actions.crmTask')}
                description={crmConnected ? t('execute.actions.crmTaskDesc') : t('execute.crmNotConnected')}
                active={kind === 'create_crm_task'}
                disabled={!crmConnected}
                onSelect={() => setKind('create_crm_task')}
              />

              {kind === 'schedule_reminder' ? (
                <Box className="space-y-1.5">
                  <Label htmlFor="exec-reminder-at">{t('execute.reminderAt')}</Label>
                  <Input
                    id="exec-reminder-at"
                    type="datetime-local"
                    value={reminderAt}
                    onChange={e => setReminderAt(e.target.value)}
                  />
                </Box>
              ) : null}

              {kind !== 'enrich_contact' ? (
                <Box className="space-y-1.5">
                  <Label htmlFor="exec-note">{t('execute.note')}</Label>
                  <Textarea
                    id="exec-note"
                    value={note}
                    rows={3}
                    placeholder={t('execute.notePlaceholder')}
                    onChange={e => setNote(e.target.value)}
                  />
                </Box>
              ) : null}

              {overCap ? (
                <Box
                  display="flex"
                  className="items-start gap-2 rounded-md border border-[var(--bellum-warning)]/40 bg-[color-mix(in_srgb,var(--bellum-warning)_10%,transparent)] p-3"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" />
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('execute.capNote', { max: ACTION_DISPATCH_BULK_MAX })}
                  </Text>
                </Box>
              ) : null}

              {/*
                Le TOTAL engagé, juste au-dessus du bouton qui l'engage.

                L'écran annonçait le prix UNITAIRE (« 1 crédit par contact
                trouvé ») et laissait la multiplication au commercial, au moment
                exact où il décide de payer. C'est un maximum — « jusqu'à » — et
                la phrase dit pourquoi il peut être moindre : un maximum sans sa
                raison se lit comme un prix ferme.
              */}
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('execute.reviewHint')}
              </Text>
            </Box>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={handleClose} disabled={run.isPending}>
                {t('common:actions.cancel')}
              </Button>
              <Button
                variant="black"
                size="sm"
                icon={Zap}
                disabled={!canRun}
                isLoading={run.isPending}
                onClick={() => run.mutate(buildGestures())}
              >
                {count > 1 ? t('execute.confirmMany', { count }) : t('execute.confirmOne')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ActionOption({
  icon: Icon,
  label,
  description,
  active,
  disabled = false,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  description: string
  active: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-55 ${
        active
          ? 'border-[var(--bellum-primary-500)] bg-[color-mix(in_srgb,var(--bellum-primary-500)_12%,transparent)]'
          : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]'
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
      <Box className="min-w-0 flex-1">
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {label}
        </Text>
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {description}
        </Text>
      </Box>
      {active ? <Check className="size-4 shrink-0 text-[var(--success-soft-text)]" /> : null}
    </button>
  )
}

function ResultView({ summary, onClose }: { summary: DispatchSummary; onClose: () => void }) {
  const { t } = useTranslation('actions')

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-[var(--bellum-text-primary)]">{t('execute.doneTitle')}</DialogTitle>
        <DialogDescription className="text-[var(--bellum-text-secondary)]">
          {summary.single ? singleResultLine(t, summary) : t('execute.subtitleMany', { count: summary.total })}
        </DialogDescription>
      </DialogHeader>

      <Box display="flex" className="flex-wrap gap-2">
        {summary.done > 0 ? (
          <Badge variant="success">{t('execute.summary.done', { count: summary.done })}</Badge>
        ) : null}
        {summary.queued > 0 ? (
          <Badge variant="secondary">{t('execute.summary.queued', { count: summary.queued })}</Badge>
        ) : null}
        {summary.skipped > 0 ? (
          <Badge variant="outline">{t('execute.summary.skipped', { count: summary.skipped })}</Badge>
        ) : null}
        {summary.failed > 0 ? (
          <Badge variant="destructive">{t('execute.summary.failed', { count: summary.failed })}</Badge>
        ) : null}
      </Box>

      <DialogFooter>
        <Button variant="default" size="sm" onClick={onClose}>
          {t('execute.close')}
        </Button>
      </DialogFooter>
    </>
  )
}

function singleResultLine(t: ReturnType<typeof useTranslation>['0'], summary: DispatchSummary): string {
  const reason = summary.reason ?? t('execute.skippedReasonFallback')
  if (summary.done > 0) return t('execute.singleDone')
  if (summary.queued > 0) return t('execute.singleQueued')
  if (summary.failed > 0) return t('execute.singleFailed', { reason })
  return t('execute.singleSkipped', { reason })
}
