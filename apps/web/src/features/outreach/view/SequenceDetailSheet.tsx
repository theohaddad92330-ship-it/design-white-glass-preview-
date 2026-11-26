import type {
  DuplicateOutreachSequenceRequest,
  OutreachSequence,
  OutreachSequenceStep,
  UpdateOutreachStepInput,
} from '@bellum/contracts'
import {
  canonicalSequenceStatus,
  OUTREACH_ENGAGEMENT_SIGNALS,
  outreachStepKindSchema,
  resolveStepVariables,
  type OutreachEngagementSignal,
  type OutreachStepKind,
} from '@bellum/contracts'
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
  Select,
  SelectContent,
  SelectField,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useColleagueContactGuard } from '@/features/team-guardrails/components/ColleagueContactDialog'
import type { TFunction } from 'i18next'
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Ban,
  CalendarCheck,
  CheckCircle2,
  Circle,
  CircleSlash,
  Copy,
  GripVertical,
  Pause,
  Play,
  Plus,
} from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers, type WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate, formatDateRange } from '@/lib/locale'
import {
  useOutreachAddStep,
  useOutreachDeclareEngagementSignal,
  useOutreachDeclareOutcome,
  useOutreachDuplicateSequence,
  useOutreachMeetingBooked,
  useOutreachRemoveStep,
  useOutreachReorderSteps,
  useOutreachSequenceAction,
  useOutreachStepDone,
  useOutreachUpdateStep,
} from '../hooks/useOutreachMutations'
import { displayStatusOf, progressOf, stopConditionKey } from '../sequences-cockpit'
import { blockedVariablesOf } from '../sequence-library'
import { STEP_KIND_ICON, delayOf, gateOf, moveId } from '../step-channels'
import { MessageQuality } from './MessageQuality'
import { SequenceStepStats } from './SequenceStepStats'
import { StepChannelGestures } from './StepChannelGestures'

/**
 * LE DÉTAIL D'UNE SÉQUENCE — la cadence, étape par étape (#1515).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT SANS PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pause, reprise, annulation et « étape faite » sont branchées depuis des mois —
 * et n'étaient atteignables QUE depuis une fiche contact. L'écran qui liste les
 * séquences était en lecture seule : on y voyait qu'une relance était due, sans
 * aucun moyen d'agir dessus. Le retour le dit à sa façon : « au clic sur une
 * ligne : ouvrir le détail existant avec timeline ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA FRISE DIT, ET CE QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour écrit « ✓ envoyé/copied selon preuve réelle ». Il n'existe aucune
 * preuve d'envoi dans ce moteur : une étape e-mail PRÉPARE un brouillon et pose
 * un rappel, et ce qu'on sait d'elle est qu'elle a été marquée FAITE, avec sa
 * date. La frise dit donc « fait le … », pas « envoyé » — écrire « envoyé »
 * serait affirmer un fait qu'aucune ligne du dépôt ne peut établir.
 *
 * Les trois autres états sont ceux du contrat : sautée (une réponse ou un
 * opt-out l'a coupée), à venir, et due — dont « en retard », qui est la même
 * chose vue un jour plus tard et qui mérite d'être nommée à part.
 */

/**
 * #4163 LF — les termes dont la présence dans le corps vaut « personnalisé » (score de qualité, lot L-C) :
 * prénom, nom, entreprise et poste du contact de la séquence. Ce qu'on ne connaît pas n'y figure pas.
 */
function personalizationTerms(sequence: OutreachSequence): string[] {
  const [firstName, ...rest] = (sequence.contact_name ?? '').split(' ').filter(Boolean)
  return [firstName, rest.join(' '), sequence.account_name, sequence.contact_role].filter(
    (term): term is string => typeof term === 'string' && term.trim() !== '',
  )
}

/** Le texte d'une invitation ou d'un message LinkedIn préparé pour l'étape — `null` quand rien n'est prêt. */
function stepLinkedinBody(step: OutreachSequenceStep): string | null {
  if (step.kind !== 'linkedin_message') return null
  const draft = step.payload['linkedin_draft']
  if (!draft || typeof draft !== 'object' || !('body' in draft)) return null
  const { body } = draft as { body: unknown }
  return typeof body === 'string' && body.trim() !== '' ? body : null
}

function stepLabel(step: OutreachSequenceStep, fallback: string): string {
  const label = step.payload['label']
  return typeof label === 'string' && label.length > 0 ? label : fallback
}

/**
 * #2153.31 — LA SÉQUENCE PORTE SES MESSAGES, PAS SEULEMENT LEUR LIBELLÉ.
 *
 * Le libellé (`stepLabel`) dit CE QU'EST l'étape (« Premier contact (J0) »),
 * jamais ce qu'elle DIT. `CreateSequenceDialog.tsx:610-649` relit déjà le
 * brouillon avant la création (#1935.24) — même contrat `email_message`,
 * snapshoté dans `step.payload.email_draft` par `buildStepPayload`
 * (`outreach.service.ts`). Cette frise, une fois la séquence lancée, ne
 * relisait plus rien : seul le libellé restait. `undefined` (étape non-email)
 * n'affiche rien — un brouillon ne se fabrique pas sur un rappel interne.
 */
function stepEmailDraft(step: OutreachSequenceStep): { subject: string; body: string } | null | undefined {
  if (step.kind !== 'email') return undefined
  const draft = step.payload['email_draft']
  if (draft && typeof draft === 'object' && 'subject' in draft && 'body' in draft) {
    const { subject, body } = draft as { subject: unknown; body: unknown }
    if (typeof subject === 'string' && typeof body === 'string') return { subject, body }
  }
  return null
}

/**
 * #2203.12 — LES CANAUX de la cadence, résumés EN TÊTE. `step.kind` le sait
 * déjà pas à pas dans la frise ; aucune ligne n'en faisait le résumé.
 */
function channelsSummary(steps: OutreachSequenceStep[], t: TFunction<'outreach'>): string {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const step of steps) {
    if (seen.has(step.kind)) continue
    seen.add(step.kind)
    labels.push(t(`stepKind.${step.kind}`))
  }
  return labels.join(', ')
}

/**
 * #2203.13 — LA PLAGE DE DATES de la cadence, résumée EN TÊTE — pas seulement
 * l'échéance de chaque étape dans la frise. `null` quand la cadence n'a
 * aucune étape : une plage ne se fabrique pas sur du vide (GA-18/GA-19).
 */
function dateRangeSummary(steps: OutreachSequenceStep[]): string | null {
  if (steps.length === 0) return null
  const times = steps.map(step => new Date(step.due_at).getTime()).filter(time => !Number.isNaN(time))
  if (times.length === 0) return null
  return formatDateRange(Math.min(...times), Math.max(...times))
}

/**
 * #2153.39 — SEPT JOURS après la DERNIÈRE étape, jamais avant : le service
 * (`OutreachService.addStep`) refuse toute échéance qui ne prolonge pas la
 * cadence. `reminder` n'est pas une nature qui ÉCRIT (`SENDING_KINDS` côté
 * serveur ne contient que `email`) : aucune règle d'espacement ne s'y
 * applique, donc pas de plancher à choisir ici au-delà de « après ».
 */
function nextFollowUpDueAt(steps: OutreachSequenceStep[]): string | null {
  if (steps.length === 0) return null
  const last = steps.reduce((latest, step) => (step.due_at > latest ? step.due_at : latest), steps[0]?.due_at ?? '')
  const at = new Date(last)
  if (Number.isNaN(at.getTime())) return null
  at.setUTCDate(at.getUTCDate() + 7)
  return at.toISOString()
}

export function SequenceDetailSheet({
  sequence,
  onClose,
  layout = 'sheet',
}: {
  sequence: OutreachSequence | null
  onClose: () => void
  /** Théo C sequences-detail.R1 — `page` : la même matière, dans une page pleine (`/actions/sequences/$id`). */
  layout?: 'sheet' | 'page' | 'embedded'
}) {
  // Le contenu est un composant SÉPARÉ, monté seulement quand une séquence est
  // ouverte : des hooks de mutation montés en permanence sur cinquante lignes
  // sont cinquante abonnements pour un panneau que personne n'a ouvert.
  if (!sequence) return null
  return <SequenceDetailContent sequence={sequence} onClose={onClose} layout={layout} />
}

function SequenceDetailContent({
  sequence,
  onClose,
  layout,
}: {
  sequence: OutreachSequence
  onClose: () => void
  layout: 'sheet' | 'page' | 'embedded'
}) {
  const { t } = useTranslation('outreach')
  // #2202.36 — les membres de l'espace : nomment le responsable d'une étape et le proposent dans « Modifier ».
  const { data: members = [] } = useWorkspaceMembers()
  const action = useOutreachSequenceAction()
  const stepDone = useOutreachStepDone()
  // #4158.51 — « contacté il y a N j par un collègue » (#21) aussi sur une étape
  // de séquence préparée : confirmation avant de la déclarer faite, jamais un
  // blocage dur (l'espace n'a rien à dire = le geste part sans dialogue).
  const colleagueGuard = useColleagueContactGuard(sequence.contact_id)
  const addStep = useOutreachAddStep()
  const updateStep = useOutreachUpdateStep()
  const removeStep = useOutreachRemoveStep()
  const declareEngagementSignal = useOutreachDeclareEngagementSignal()
  // Lot L-B (#4165) — réordonner, déclarer une issue, « RDV pris ».
  const reorder = useOutreachReorderSteps()
  const declareOutcome = useOutreachDeclareOutcome()
  const meetingBooked = useOutreachMeetingBooked()
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [newStepKind, setNewStepKind] = useState<OutreachStepKind>('reminder')
  // #2378.5 / #2378.6 — une SEULE étape s'édite à la fois : la frise n'est
  // plus un gabarit figé, mais ce n'est pas un formulaire par étape en
  // permanence non plus.
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  // #2203.62 — dupliquer vers un AUTRE contact : la même sheet, jamais un
  // second panneau empilé.
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const now = new Date()
  const status = displayStatusOf(sequence, now)
  const progress = progressOf(sequence)
  // #2378.5 — retoucher ou retirer ne vaut QUE pour une étape encore à faire,
  // sur une séquence encore vivante (active OU en pause) : une séquence
  // terminée ou annulée fige la frise, comme `sequence.addStep` juste plus bas.
  const stepsEditable = sequence.status === 'active' || sequence.status === 'paused'
  // Lot L-B — l'ordre des étapes ENCORE À FAIRE, seul réordonnable (l'historique ne bouge pas).
  const pendingIds = sequence.steps.filter(step => step.status === 'pending').map(step => step.id)
  const reorderable = stepsEditable && pendingIds.length > 1
  const applyOrder = (next: string[] | null) => {
    if (next) reorder.mutate({ id: sequence.id, stepIds: next })
  }

  return (
    <>
      <DetailShell layout={layout} onClose={onClose} closeLabel={t('common:actions.close')}>
        <DetailHeader layout={layout} title={sequence.name} backLabel={t('detail.backToList')}>
          {sequence.contact_name ?? ''}
          {sequence.account_name ? ` · ${sequence.account_name}` : ''}
        </DetailHeader>

        <Box className="px-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`status.${status}`)}</Badge>
          {/* #2366.6 — l'état CANONIQUE de la séquence (onze états), lu depuis le
              stockage existant : c'est le statut de la séquence, jamais celui d'un message. */}
          <Text size="sm" className="text-[var(--bellum-text-secondary)]" data-testid="sequence-canonical-status">
            {t('canonicalStatus.label')} : {t(`canonicalStatus.${canonicalSequenceStatus(sequence.status, status)}`)}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {progress.done} / {progress.total}
          </Text>
          <Box className="ml-auto flex items-center gap-2">
            <Link
              to="/contacts/$id"
              params={{ id: sequence.contact_id }}
              className="text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
            >
              {t('detail.openContact')}
            </Link>
            {/* Théo C sequences-detail.A5 — le compte aussi, depuis la séquence. */}
            {sequence.account_id ? (
              <Link
                to="/accounts/$id"
                params={{ id: sequence.account_id }}
                className="text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
              >
                {t('detail.openAccount')}
              </Link>
            ) : null}
          </Box>
        </Box>

        {/* #2203.12 / #2203.13 / #2203.14 — LE RÉSUMÉ EN TÊTE : canaux, plage
            de dates, prochaine exécution. Les trois existaient déjà pas à pas
            dans la frise (ou ailleurs, pour `next_step` : même clé i18n que
            `ContactOutreachCard.tsx:177-181`) — jamais résumés ici. */}
        <Box className="px-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          {dateRangeSummary(sequence.steps) ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('detail.dateRange', { range: dateRangeSummary(sequence.steps) })}
            </Text>
          ) : null}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {sequence.next_step
              ? t('sequence.nextDue', { date: formatDate(sequence.next_step.due_at) })
              : t('sequence.noNextDue')}
          </Text>
          {/* #3421 — la CONDITION D'ARRÊT, dite une fois, dans le résumé en
              tête (pas un bloc de plus) : avant l'arrêt, ce qui l'arrêtera ;
              après un refus ou une adresse en échec, pourquoi plus rien ne
              part. Une séquence terminée ou arrêtée sans cause connue n'a
              rien à dire : aucune ligne plutôt qu'une phrase devinée. */}
          {stopConditionKey(sequence.status, status) ? (
            <Text
              size="xs"
              className="w-full text-[var(--bellum-text-secondary)]"
              data-testid="sequence-stop-condition"
            >
              {t(stopConditionKey(sequence.status, status) as string)}
            </Text>
          ) : null}
        </Box>

        {/* LA FRISE. L'ordre est celui du serveur (`position`), jamais rejoué
            ici : deux ordres sur la même cadence finiraient par diverger. */}
        <Box className="px-4 flex flex-col gap-2">
          <Text size="sm" weight="medium">
            {t('detail.timeline')}
          </Text>
          {sequence.steps.map(step => {
            // ⚠️ TROIS états pour une étape en attente, pas deux. Mesuré dans
            // la salle le 04/09 : une étape due à 09:00 se lisait « En retard »
            // à 09:01, le jour même. C'est faux au sens où le commercial
            // l'entend — il lui reste la journée, et la ligne du tableau dit
            // d'ailleurs « en attente de ta validation ». « En retard » ne vaut
            // qu'à partir du LENDEMAIN, et se compare donc en JOURS, pas en
            // instants.
            const due = new Date(step.due_at)
            const startOfToday = new Date(now)
            startOfToday.setHours(0, 0, 0, 0)
            const endOfToday = new Date(now)
            endOfToday.setHours(23, 59, 59, 999)
            const late = step.status === 'pending' && due.getTime() < startOfToday.getTime()
            const dueToday = step.status === 'pending' && !late && due.getTime() <= endOfToday.getTime()
            const icon =
              step.status === 'done' ? (
                <CheckCircle2 className="size-4 shrink-0 text-[var(--success-soft-text)]" aria-hidden="true" />
              ) : step.status === 'skipped' ? (
                <CircleSlash className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
              )
            const state =
              step.status === 'done'
                ? t('detail.stepDone', { date: formatDate(step.done_at) ?? formatDate(step.due_at) ?? '' })
                : step.status === 'skipped'
                  ? t('detail.stepSkipped')
                  : late
                    ? t('detail.stepLate')
                    : dueToday
                      ? t('detail.stepDue')
                      : t('detail.stepPending')

            const draft = stepEmailDraft(step)
            // Lot L-B (#4165) — le canal, le délai en jours ouvrés/calendaires, la porte LinkedIn.
            const KindIcon = STEP_KIND_ICON[step.kind]
            const delay = delayOf(step, sequence)
            const gate = step.status === 'pending' ? gateOf(sequence.steps, step) : null
            const skipReason =
              typeof step.payload['skip_reason'] === 'string' ? (step.payload['skip_reason'] as string) : null
            const manualChannel =
              step.kind === 'linkedin_invite' || step.kind === 'linkedin_message' || step.kind === 'call'
            const pendingIndex = pendingIds.indexOf(step.id)
            // #3756.3 — une étape issue d'un modèle dont une variable n'a pas de
            // valeur est BLOQUÉE : la variable se nomme, aucun brouillon n'existe.
            const blockedVariables = blockedVariablesOf(step.payload)
            const linkedinBody = stepLinkedinBody(step)

            return (
              <div
                key={step.id}
                data-testid={`step-row-${step.position}`}
                draggable={reorderable && step.status === 'pending'}
                onDragStart={() => setDraggedId(step.id)}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                  if (draggedId && step.status === 'pending') event.preventDefault()
                }}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault()
                  if (!draggedId || draggedId === step.id || step.status !== 'pending') return
                  const from = pendingIds.indexOf(draggedId)
                  const to = pendingIds.indexOf(step.id)
                  setDraggedId(null)
                  if (from < 0 || to < 0) return
                  const next = [...pendingIds]
                  const [moved] = next.splice(from, 1)
                  next.splice(to, 0, moved as string)
                  applyOrder(next)
                }}
                onDragEnd={() => setDraggedId(null)}
                className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
              >
                <Box className="flex min-w-0 items-center gap-3">
                  {reorderable && step.status === 'pending' ? (
                    <GripVertical
                      className="size-4 shrink-0 cursor-grab text-[var(--bellum-text-muted)]"
                      aria-hidden="true"
                    />
                  ) : null}
                  {icon}
                  <KindIcon className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
                  <Box className="flex min-w-0 flex-col">
                    <Text size="sm" className="truncate">
                      {stepLabel(step, t(`stepKind.${step.kind}`))}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {t(`stepKind.${step.kind}`)} ·{' '}
                      {t(
                        delay.unit === 'business_days' ? 'multichannel.delay.business' : 'multichannel.delay.calendar',
                        { days: delay.days },
                      )}{' '}
                      · {formatDate(step.due_at) ?? ''} · {state}
                    </Text>
                    {/* #2202.36 — le responsable de l'étape, nommé ; sans responsable (ou membre inconnu) : aucune ligne. */}
                    {ownerName(step, members) ? (
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t('sequence.stepOwnerLine', { name: ownerName(step, members) })}
                      </Text>
                    ) : null}
                    {gate === 'awaiting_acceptance' ? (
                      <Badge variant="outline" className="mt-1 w-fit text-xs" data-testid="linkedin-gate">
                        {t('multichannel.gate.awaiting')}
                      </Badge>
                    ) : null}
                    {step.status === 'skipped' && skipReason ? (
                      <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="skip-reason">
                        {t(`multichannel.skipped.${skipReason}`, { defaultValue: t('detail.stepSkipped') })}
                      </Text>
                    ) : null}
                  </Box>
                  {step.status === 'pending' ? (
                    <Box className="ml-auto flex shrink-0 items-center gap-2">
                      {reorderable && step.status === 'pending' ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={t('multichannel.reorder.up')}
                            disabled={reorder.isPending || pendingIndex <= 0}
                            onClick={() => applyOrder(moveId(pendingIds, step.id, -1))}
                          >
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={t('multichannel.reorder.down')}
                            disabled={reorder.isPending || pendingIndex < 0 || pendingIndex >= pendingIds.length - 1}
                            onClick={() => applyOrder(moveId(pendingIds, step.id, 1))}
                          >
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          </Button>
                        </>
                      ) : null}
                      {step.status === 'pending' && sequence.status === 'active' && !manualChannel ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={stepDone.isPending}
                          onClick={() =>
                            colleagueGuard.run(() => stepDone.mutate({ id: sequence.id, stepId: step.id }))
                          }
                        >
                          {t('sequence.stepDone')}
                        </Button>
                      ) : null}
                      {/* #2378.5 / #2378.6 — retoucher ou retirer une étape ENCORE
                          À FAIRE : l'API (`PATCH .../steps/:stepId`,
                          `POST .../steps/:stepId/remove`) existe depuis
                          6730d402d, cette frise la BRANCHE — sans quoi la
                          route n'a aucun appelant écran (defaut n°1). */}
                      {step.status === 'pending' && stepsEditable ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingStepId(editingStepId === step.id ? null : step.id)}
                          >
                            {t('sequence.stepEdit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={removeStep.isPending}
                            onClick={() => removeStep.mutate({ id: sequence.id, stepId: step.id })}
                          >
                            {t('sequence.stepRemove')}
                          </Button>
                        </>
                      ) : null}
                    </Box>
                  ) : null}
                </Box>
                {/* #2909 (#2378.2) — déclencheur par ouverture/clic : DÉCLARÉ
                    par le commercial (ce qu'il a constaté dans sa messagerie),
                    jamais détecté automatiquement — voir le docblock de
                    `OUTREACH_ENGAGEMENT_SIGNALS`. N'a de sens que sur une
                    étape e-mail : une relance téléphonique ne s'ouvre pas. */}
                {step.kind === 'email' ? (
                  <EngagementSignalSelect
                    value={step.engagement_signal}
                    disabled={declareEngagementSignal.isPending}
                    onChange={signal =>
                      declareEngagementSignal.mutate({
                        id: sequence.id,
                        stepId: step.id,
                        input: { engagement_signal: signal },
                      })
                    }
                    t={t}
                  />
                ) : null}
                {/* Lot L-B (#4165) — le geste du canal : LinkedIn (copier + ouvrir le
                    profil, marquer envoyé), appel (trame + issue), invitation (issue). */}
                <StepChannelGestures
                  step={step}
                  sequence={sequence}
                  pending={stepDone.isPending || declareOutcome.isPending}
                  onDone={() => colleagueGuard.run(() => stepDone.mutate({ id: sequence.id, stepId: step.id }))}
                  onOutcome={outcome =>
                    declareOutcome.mutate({
                      id: sequence.id,
                      stepId: step.id,
                      input: {
                        outcome: outcome as 'accepted' | 'pending' | 'reached' | 'voicemail' | 'no_answer' | null,
                      },
                    })
                  }
                  onMeetingBooked={() => meetingBooked.mutate({ id: sequence.id, stepId: step.id })}
                  t={t}
                />
                {editingStepId === step.id ? (
                  <StepEditForm
                    step={step}
                    sequence={sequence}
                    members={members}
                    onDone={() => setEditingStepId(null)}
                    onSave={input => updateStep.mutate({ id: sequence.id, stepId: step.id, input })}
                    pending={updateStep.isPending}
                    t={t}
                  />
                ) : null}
                {/* #2153.31 — le brouillon lui-même, pas seulement son libellé.
                    `undefined` (étape non-email) n'affiche rien ; `null`
                    (aucun message préparé) le dit, plutôt que de rester muet —
                    même texte que `CreateSequenceDialog.tsx` (GA-26). */}
                {blockedVariables.length > 0 ? (
                  <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]" role="status">
                    {t('preview.blocked', { variables: blockedVariables.join(' · ') })}
                  </Text>
                ) : draft === null ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('preview.noDraft')}
                  </Text>
                ) : draft ? (
                  <Box className="flex flex-col gap-0.5 rounded-md bg-[var(--bellum-surface-2)] p-2">
                    <Text size="xs" weight="medium">
                      {draft.subject}
                    </Text>
                    <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                      {draft.body}
                    </Text>
                    <MessageQuality
                      channel="email"
                      subject={draft.subject}
                      body={draft.body}
                      personalization={personalizationTerms(sequence)}
                    />
                  </Box>
                ) : null}
                {linkedinBody ? (
                  <Box className="flex flex-col gap-0.5 rounded-md bg-[var(--bellum-surface-2)] p-2">
                    <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                      {linkedinBody}
                    </Text>
                    <MessageQuality
                      channel="linkedin"
                      body={linkedinBody}
                      personalization={personalizationTerms(sequence)}
                    />
                  </Box>
                ) : null}
              </div>
            )
          })}
        </Box>

        {/* Théo C sequences-detail.R4 — « Cadre de cette campagne » : canal · règles d'arrêt · étapes faites.
              « Fait » est déclaratif (doctrine : jamais une preuve d'envoi) — d'où « faites », pas « envois réels ». */}
        <Box className="px-4" data-testid="sequence-frame">
          <Box className="flex flex-col gap-1 rounded-xl border border-[var(--bellum-border)] p-3">
            <Text size="sm" weight="medium">
              {t('detail.frame.title')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('detail.frame.channel')} : {channelsSummary(sequence.steps, t)}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('detail.frame.stopRules')} : {t('detail.frame.stopRulesValue')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('detail.frame.done')} : {progress.done}
            </Text>
          </Box>
        </Box>

        {/* Lot L-B — les stats de CETTE séquence, par étape : préparé · fait · répondu · RDV. */}
        <Box className="px-4">
          <SequenceStepStats sequences={[sequence]} t={t} />
        </Box>

        <Box className="px-4 flex flex-wrap gap-2">
          {/* Lot L-B — « RDV pris » termine la séquence (cause `meeting_booked`). */}
          {sequence.status === 'active' || sequence.status === 'paused' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={meetingBooked.isPending}
              onClick={() => meetingBooked.mutate({ id: sequence.id })}
            >
              <CalendarCheck className="size-3.5" aria-hidden="true" />
              {t('multichannel.meeting.button')}
            </Button>
          ) : null}
          {sequence.status === 'active' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate({ id: sequence.id, action: 'pause' })}
            >
              <Pause className="size-3.5" aria-hidden="true" />
              {t('sequence.pause')}
            </Button>
          ) : null}
          {sequence.status === 'paused' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate({ id: sequence.id, action: 'resume' })}
            >
              <Play className="size-3.5" aria-hidden="true" />
              {t('sequence.resume')}
            </Button>
          ) : null}
          {sequence.status === 'active' || sequence.status === 'paused' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={action.isPending}
              onClick={() => action.mutate({ id: sequence.id, action: 'cancel' })}
            >
              <Ban className="size-3.5" aria-hidden="true" />
              {t('sequence.cancel')}
            </Button>
          ) : null}
          {/* #2153.39 — « elle ne doit pas être une liste figée » : la seule
              porte qui écrivait des étapes était la création. Sept jours après
              la dernière — le serveur refuse toute échéance qui ne prolonge
              pas la cadence. */}
          {(sequence.status === 'active' || sequence.status === 'paused') && nextFollowUpDueAt(sequence.steps) ? (
            <Select value={newStepKind} onValueChange={next => setNewStepKind(next as OutreachStepKind)}>
              <SelectTrigger aria-label={t('multichannel.editor.newStepKind')} className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outreachStepKindSchema.options.map(kind => (
                  <SelectItem key={kind} value={kind}>
                    {t(`stepKind.${kind}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {(sequence.status === 'active' || sequence.status === 'paused') && nextFollowUpDueAt(sequence.steps) ? (
            <Button
              size="sm"
              variant="outline"
              disabled={addStep.isPending}
              onClick={() => {
                const due_at = nextFollowUpDueAt(sequence.steps)
                if (due_at) addStep.mutate({ id: sequence.id, input: { kind: newStepKind, due_at } })
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {t('sequence.addStep')}
            </Button>
          ) : null}
          {/* #2203.62 / #2378.7 — dupliquer vers un AUTRE contact : la route
              serveur existe et est testée depuis #2378.7, cette sheet était
              le seul écran sans bouton pour l'atteindre. N'importe quel
              statut peut servir de modèle : dupliquer ne touche jamais CETTE
              séquence (mono-contact, c74). */}
          <Button size="sm" variant="outline" onClick={() => setDuplicateOpen(true)}>
            <Copy className="size-3.5" aria-hidden="true" />
            {t('sequence.duplicate')}
          </Button>
        </Box>

        {duplicateOpen ? (
          <DuplicateSequenceDialog sequence={sequence} onClose={() => setDuplicateOpen(false)} t={t} />
        ) : null}
      </DetailShell>
      {colleagueGuard.dialog}
    </>
  )
}

/**
 * Théo C sequences-detail.R1 — l'enveloppe du détail : feuille latérale (ouverte depuis la liste, comme
 * avant) ou page pleine. Le contenu est le même ; seule la coque change.
 */
function DetailShell({
  layout,
  onClose,
  closeLabel,
  children,
}: {
  layout: 'sheet' | 'page' | 'embedded'
  onClose: () => void
  closeLabel: string
  children: React.ReactNode
}) {
  if (layout === 'page') return <Box className="flex w-full max-w-3xl flex-col gap-4">{children}</Box>
  // Théo C sequences-detail — « Modifier la séquence » : le même détail, posé dans la page d'une campagne.
  if (layout === 'embedded') return <Box className="flex w-full flex-col gap-4">{children}</Box>
  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent
        closeLabel={closeLabel}
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-lg"
      >
        {children}
      </SheetContent>
    </Sheet>
  )
}

function DetailHeader({
  layout,
  title,
  backLabel,
  children,
}: {
  layout: 'sheet' | 'page' | 'embedded'
  title: string
  backLabel: string
  children: React.ReactNode
}) {
  if (layout === 'embedded') return null
  if (layout === 'page') {
    return (
      <Box className="flex flex-col gap-1">
        <Link
          to="/actions/sequences"
          className="inline-flex w-fit items-center gap-1 text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <Text element="h1" size="lg" weight="semibold">
          {title}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {children}
        </Text>
      </Box>
    )
  }
  return (
    <SheetHeader>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>{children}</SheetDescription>
    </SheetHeader>
  )
}

/**
 * #2203.62 / #2378.7 — DUPLIQUER VERS UN AUTRE CONTACT.
 *
 * `POST /outreach/sequences/:id/duplicate` reprend les étapes À VENIR de
 * cette séquence pour un autre contact (rythme, pas dates) ; l'originale et
 * ses inscriptions ne bougent pas (mono-contact, c74). La recherche relit le
 * MÊME `useContacts` que le reste du produit (`ContactsPageContent.tsx`),
 * aucune nouvelle route. Le contact déjà engagé sur CETTE séquence est
 * exclu de la liste — dupliquer vers lui-même n'a pas de sens (le serveur le
 * refuse aussi, en second rempart).
 */
function DuplicateSequenceDialog({
  sequence,
  onClose,
  t,
}: {
  sequence: OutreachSequence
  onClose: () => void
  t: TFunction<'outreach'>
}) {
  const [query, setQuery] = useState('')
  const [debouncedQuery] = useDebounce(query, 300)
  const duplicate = useOutreachDuplicateSequence()
  const trimmed = debouncedQuery.trim()
  const contactsQuery = useContacts(trimmed.length > 0 ? { q: trimmed } : {})
  const candidates = (contactsQuery.data?.pages[0]?.data ?? []).filter(contact => contact.id !== sequence.contact_id)

  const pick = (input: DuplicateOutreachSequenceRequest) => {
    duplicate.mutate({ id: sequence.id, input })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('duplicateDialog.title')}</DialogTitle>
          <DialogDescription>{t('duplicateDialog.description')}</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={t('duplicateDialog.searchPlaceholder')}
          aria-label={t('common:actions.search')}
          className="min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3"
        />
        <Box className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {trimmed.length === 0 ? null : candidates.length === 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('duplicateDialog.noResults')}
            </Text>
          ) : (
            candidates.map(contact => (
              <button
                key={contact.id}
                type="button"
                disabled={duplicate.isPending}
                onClick={() => pick({ contact_id: contact.id })}
                className="flex min-h-11 flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-[var(--bellum-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Text size="sm">{contact.full_name}</Text>
                {contact.title || contact.company_name ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {[contact.title, contact.company_name].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </button>
            ))
          )}
        </Box>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Sentinelle d'affichage pour « rien de rapporté » — `""` n'est pas une
 *  valeur admise par un `SelectItem` (@bellum/ui). `null` (rien rapporté)
 *  reste la valeur du contrat ; cette sentinelle ne voyage jamais côté API. */
const UNSPECIFIED_ENGAGEMENT_SIGNAL = 'unspecified' as const

/**
 * #2909 (#2378.2) — le signal d'ouverture/clic RAPPORTÉ par le commercial,
 * jamais détecté automatiquement (voir le docblock de
 * `OUTREACH_ENGAGEMENT_SIGNALS`, `@bellum/contracts`).
 */
function EngagementSignalSelect({
  value,
  disabled,
  onChange,
  t,
}: {
  value: OutreachEngagementSignal | null
  disabled: boolean
  onChange: (signal: OutreachEngagementSignal | null) => void
  t: TFunction<'outreach'>
}) {
  return (
    <Select
      value={value ?? UNSPECIFIED_ENGAGEMENT_SIGNAL}
      onValueChange={next =>
        onChange(next === UNSPECIFIED_ENGAGEMENT_SIGNAL ? null : (next as OutreachEngagementSignal))
      }
      disabled={disabled}
    >
      <SelectTrigger aria-label={t('detail.engagementSignalLabel')} className="h-8 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSPECIFIED_ENGAGEMENT_SIGNAL}>{t('detail.engagementSignalUnspecified')}</SelectItem>
        {OUTREACH_ENGAGEMENT_SIGNALS.map(signal => (
          <SelectItem key={signal} value={signal}>
            {t(`detail.engagementSignal.${signal}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * #2378.5 / #2378.6 — RETOUCHER UNE ÉTAPE ENCORE À FAIRE, PAS UN ÉCRASEMENT.
 *
 * Même contrat que le serveur (`updateOutreachStepInputSchema`) : libellé,
 * échéance, note, objectif — au moins un des quatre. `objectif` (#2202.33)
 * est un CHAMP DISTINCT de `note` : la note est un contexte sur le contact,
 * l'objectif est ce que l'étape cherche à obtenir — les confondre aurait
 * doublonné le même texte libre sous deux noms. Les gardes de cadence (ordre,
 * espacement minimal) se rejouent côté serveur (reco appliquée, decisions §1) ;
 * ce formulaire n'en devine aucune côté client.
 */
/** #2202.36 — le nom du responsable d'une étape (`payload.owner_id`), lu parmi les membres ; `null` si inconnu. */
function ownerName(step: OutreachSequenceStep, members: readonly WorkspaceMember[]): string | null {
  const id = step.payload['owner_id']
  if (typeof id !== 'string') return null
  const member = members.find(entry => entry.userId === id)
  return member ? (member.fullName ?? member.email) : null
}

const NO_OWNER = 'none'

function StepEditForm({
  step,
  sequence,
  members,
  onDone,
  onSave,
  pending,
  t,
}: {
  step: OutreachSequenceStep
  sequence: OutreachSequence
  members: readonly WorkspaceMember[]
  onDone: () => void
  onSave: (input: UpdateOutreachStepInput) => void
  pending: boolean
  t: TFunction<'outreach'>
}) {
  const [label, setLabel] = useState(stepLabel(step, ''))
  const [dueAt, setDueAt] = useState(step.due_at)
  const rawNote = step.payload['note']
  const [note, setNote] = useState(typeof rawNote === 'string' ? rawNote : '')
  // #2202.36 — « none » = aucun responsable nommé (jamais soi-même par défaut).
  const initialOwner = typeof step.payload['owner_id'] === 'string' ? (step.payload['owner_id'] as string) : NO_OWNER
  const [owner, setOwner] = useState(initialOwner)
  const rawObjective = step.payload['objective']
  const [objective, setObjective] = useState(typeof rawObjective === 'string' ? rawObjective : '')
  // #3702 — une étape e-mail SANS brouillon : la personne écrit elle-même l'objet
  // et le corps (ils iront dans « À valider »). Un brouillon existant se révise là-bas.
  const canWriteDraft =
    step.kind === 'email' && stepEmailDraft(step) === null && blockedVariablesOf(step.payload).length === 0
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  // Lot L-B (#4165) — le canal et le délai (en jours ouvrés ou calendaires, selon
  // la séquence) se retouchent comme le reste. Le délai et la date sont
  // EXCLUSIFS côté serveur : on n'envoie le délai que s'il a été touché.
  const [kind, setKind] = useState<OutreachStepKind>(step.kind)
  const initialDelay = delayOf(step, sequence).days
  const [delayDays, setDelayDays] = useState(String(initialDelay))
  const delayChanged = delayDays.trim() !== '' && Number(delayDays) !== initialDelay
  // Les variables du brouillon, avec valeur de repli : `{{prenom|à vous}}`. Une
  // variable SANS valeur ni repli est VIDE — l'alerte la nomme AVANT de valider.
  const [confirmedEmpty, setConfirmedEmpty] = useState(false)
  const [firstName, ...restName] = (sequence.contact_name ?? '').split(' ').filter(Boolean)
  const variableValues = {
    prenom: firstName ?? null,
    nom: restName.join(' ') || null,
    entreprise: sequence.account_name,
    poste: sequence.contact_role,
  }
  const resolvedSubject = resolveStepVariables(draftSubject, variableValues)
  const resolvedBody = resolveStepVariables(draftBody, variableValues)
  const emptyVariables = [...new Set([...resolvedSubject.empty, ...resolvedBody.empty])]

  return (
    <form
      className="flex flex-col gap-2 rounded-md bg-[var(--bellum-surface-2)] p-2"
      onSubmit={event => {
        event.preventDefault()
        // Alerte avant de valider : une variable vide se NOMME, la personne choisit.
        if (emptyVariables.length > 0 && !confirmedEmpty) return
        const input: UpdateOutreachStepInput = {
          ...(label.trim().length > 0 ? { label: label.trim() } : {}),
          ...(kind !== step.kind ? { kind } : {}),
          ...(delayChanged ? { offset_days: Number(delayDays) } : dueAt ? { due_at: dueAt } : {}),
          ...(note.trim().length > 0 ? { note: note.trim() } : {}),
          ...(objective.trim().length > 0 ? { objective: objective.trim() } : {}),
          // #2202.36 — seulement si touché ; `null` efface (une correction humaine gagne).
          ...(owner !== initialOwner ? { owner_id: owner === NO_OWNER ? null : owner } : {}),
          // Les deux ensemble ou rien : le serveur exige objet ET corps.
          ...(canWriteDraft && draftSubject.trim().length > 0 && draftBody.trim().length > 0
            ? {
                email_draft: {
                  subject: resolvedSubject.text.trim() || draftSubject.trim(),
                  body: resolvedBody.text.trim() || draftBody.trim(),
                },
              }
            : {}),
        }
        onSave(input)
        onDone()
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        {t('sequence.stepLabelField')}
        <input
          className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2"
          value={label}
          onChange={event => setLabel(event.target.value)}
        />
      </label>
      <Box className="flex flex-col gap-1 text-sm">
        <Text size="sm">{t('multichannel.editor.kindField')}</Text>
        <SelectField
          ariaLabel={t('multichannel.editor.kindField')}
          value={kind}
          onChange={next => setKind(next as OutreachStepKind)}
          options={outreachStepKindSchema.options.map(option => ({ value: option, label: t(`stepKind.${option}`) }))}
        />
      </Box>
      <label className="flex flex-col gap-1 text-sm">
        {t(
          sequence.delay_unit === 'business_days'
            ? 'multichannel.editor.delayFieldBusiness'
            : 'multichannel.editor.delayFieldCalendar',
        )}
        <input
          type="number"
          min={0}
          max={365}
          inputMode="numeric"
          className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2"
          value={delayDays}
          onChange={event => setDelayDays(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('sequence.stepDueAtField')}
        <input
          type="datetime-local"
          className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2"
          value={toDatetimeLocalValue(dueAt)}
          onChange={event => {
            if (!event.target.value) return
            const parsed = new Date(event.target.value)
            if (!Number.isNaN(parsed.getTime())) setDueAt(parsed.toISOString())
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('sequence.stepNoteField')}
        <textarea
          className="min-h-16 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-2"
          value={note}
          onChange={event => setNote(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('sequence.stepObjectiveField')}
        <input
          className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2"
          value={objective}
          onChange={event => setObjective(event.target.value)}
        />
      </label>
      <Box className="flex flex-col gap-1 text-sm">
        <Text size="sm">{t('sequence.stepOwnerField')}</Text>
        <SelectField
          ariaLabel={t('sequence.stepOwnerField')}
          value={owner}
          onChange={setOwner}
          options={[
            { value: NO_OWNER, label: t('sequence.stepOwnerNone') },
            ...members.map(member => ({
              value: member.userId,
              label: member.fullName ?? member.email ?? member.userId,
            })),
          ]}
        />
      </Box>
      {canWriteDraft ? (
        <>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('sequence.stepDraftHint')}
          </Text>
          <label className="flex flex-col gap-1 text-sm">
            {t('sequence.stepSubjectField')}
            <input
              className="min-h-11 min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2"
              value={draftSubject}
              onChange={event => setDraftSubject(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('sequence.stepBodyField')}
            <textarea
              className="min-h-32 min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] p-2"
              value={draftBody}
              onChange={event => {
                setDraftBody(event.target.value)
                setConfirmedEmpty(false)
              }}
            />
          </label>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('multichannel.editor.variablesHint', { example: '{{prenom|à vous}}' })}
          </Text>
          <MessageQuality
            channel="email"
            subject={draftSubject}
            body={draftBody}
            personalization={personalizationTerms(sequence)}
          />
          {emptyVariables.length > 0 ? (
            <Box
              role="alert"
              className="flex flex-col gap-1 rounded-md border border-[var(--bellum-warning)] p-2"
              data-testid="empty-variables-alert"
            >
              <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
                {t('multichannel.editor.emptyVariables', { variables: emptyVariables.join(' · ') })}
              </Text>
              <label className="flex items-start gap-2 pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  checked={confirmedEmpty}
                  onChange={event => setConfirmedEmpty(event.target.checked)}
                  aria-label={t('multichannel.editor.emptyVariablesConfirm')}
                />
                <Text size="xs">{t('multichannel.editor.emptyVariablesConfirm')}</Text>
              </label>
            </Box>
          ) : null}
        </>
      ) : null}
      <Box className="flex gap-2">
        <Button size="sm" type="submit" disabled={pending}>
          {t('sequence.stepSave')}
        </Button>
        <Button size="sm" variant="outline" type="button" onClick={onDone}>
          {t('sequence.stepCancelEdit')}
        </Button>
      </Box>
    </form>
  )
}

/** ISO complet → format attendu par `<input type="datetime-local">`
 *  (`YYYY-MM-DDTHH:mm`, heure locale). `''` sur une date invalide — un champ
 *  vide, jamais une date devinée. */
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
