import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityAvatar,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ChevronRight, Inbox, MoreHorizontal, Pause, Play, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { formatDate } from '@/lib/locale'
import { useMailboxStatus } from '@/features/mailbox/api'
import { useAskLauraAction } from '../hooks/useAskLauraAction'
import { useOutreachSequenceAction } from '../hooks/useOutreachMutations'
import {
  campaignCounts,
  campaignMembers,
  campaignTitle,
  dryRun,
  memberLine,
  pendingCalls,
  stepSummaries,
} from '../sequence-campaign'
import { blockedVariablesOf } from '../sequence-library'
import { groupByAudience } from '../sequences-audience'
import { displayStatusOf } from '../sequences-cockpit'
import { delayOf } from '../step-channels'
import { DeliverabilityBlock } from './DeliverabilityBlock'
import { SequencesPageHead } from './SequencesPageHead'
import { SequenceDetailSheet } from './SequenceDetailSheet'
import { SequenceStatusBadge } from './SequenceStatusBadge'

/**
 * Théo C sequences-detail — LA PAGE D'UNE CAMPAGNE (`/actions/sequences/$id`).
 *
 * Une séquence ouverte donne sa campagne entière : tous les membres qui partagent son étiquette (c131, audience
 * multi-contacts), lus dans la liste du workspace — aucune route serveur de plus. Les messages de la cadence,
 * l'audience (une ligne par personne, « Arrêter pour ce contact » sans arrêter les autres), l'essai à blanc, le
 * cadre, les appels, la délivrabilité.
 *
 * Rien n'est retiré : « Modifier la séquence » déplie, pour la personne choisie, tout le détail qu'avait la
 * feuille — étapes à retoucher, retirer, réordonner, signal d'ouverture, gestes du canal, « RDV pris »,
 * dupliquer. Chaque personne garde SA cadence (mono-contact) : une retouche vaut pour elle seule.
 */

type Member = OutreachSequence

// `.card` de la maquette : bord fin, rayon 10, en-tête 16–17 px, corps aéré (22 px).
const CARD =
  'flex min-w-0 flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 md:p-6'
const DOT_TONE = {
  green: 'bg-[var(--success-soft-text)]',
  purple: 'bg-[var(--accent-soft-text)]',
  amber: 'bg-[var(--warning-soft-text)]',
  red: 'bg-[var(--danger-soft-text)]',
  neutral: 'bg-[var(--bellum-text-muted)]',
} as const

export function SequenceCampaignPage({
  sequence,
  all,
}: {
  sequence: OutreachSequence
  all: readonly OutreachSequence[]
}) {
  const { t } = useTranslation('outreach')
  const askLaura = useAskLauraAction()
  const action = useOutreachSequenceAction()
  const { data: mailbox } = useMailboxStatus()
  const now = useMemo(() => new Date(), [all])
  const members = useMemo(() => campaignMembers(sequence, all), [sequence, all])
  const title = campaignTitle(sequence)
  const counts = campaignCounts(members)
  const summaries = useMemo(() => stepSummaries(members, now), [members, now])
  const calls = useMemo(() => pendingCalls(members), [members])
  const status = useMemo(() => {
    const row = groupByAudience(members, now)[0]
    return row?.kind === 'group' ? row.status : displayStatusOf(members[0] ?? sequence, now)
  }, [members, now, sequence])

  const [dialog, setDialog] = useState<'pause' | 'cancel' | 'replies' | 'dry' | 'duplicate' | null>(null)
  const [editing, setEditing] = useState(false)
  const [editMemberId, setEditMemberId] = useState(sequence.id)
  const editMember = members.find(member => member.id === editMemberId) ?? members[0] ?? sequence

  // Une personne qui a répondu est déjà sortie de la cadence d'elle-même : ni pause, ni arrêt à lui proposer.
  const live = members.filter(member => member.status === 'active' && !member.contact_replied)
  const paused = members.filter(member => member.status === 'paused')
  const stoppable = members.filter(
    member => (member.status === 'active' || member.status === 'paused') && !member.contact_replied,
  )

  const applyAll = async (targets: readonly Member[], verb: 'pause' | 'resume' | 'cancel', done: string) => {
    try {
      await Promise.all(targets.map(member => action.mutateAsync({ id: member.id, action: verb })))
      toast.success(done)
    } catch {
      // Le crochet d'action a déjà dit l'échec : rien à ajouter ici.
    }
  }

  // « Préparer les brouillons de la relance » : la première étape en retard ou due aujourd'hui, au-delà du premier message.
  const dueNow = summaries.find(summary => summary.position > 0 && summary.dueToday + summary.late > 0)

  return (
    <Box className="flex w-full flex-col gap-6" data-testid="sequence-campaign">
      {/* Théo C sequences-detail — `.v13-queuebridge`, EN TÊTE (avant l'en-tête, comme la maquette) : le pont vers la
          file — étapes faites, réponses, personnes arrêtées — et « Messages & réponses ». */}
      <Box className="flex flex-col gap-3" data-testid="campaign-bridge">
        <Box className="flex flex-wrap items-center gap-4 rounded-overlay border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-5 py-4">
          <Inbox className="size-5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
          <Box className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Text size="sm" weight="semibold">
              {t('campaign.bridge.title')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="campaign-bridge-figures">
              {[
                t('campaign.bridge.done', { count: counts.stepsDone }),
                t('campaign.bridge.replies', { count: counts.replies }),
                counts.stopped > 0 ? t('campaign.bridge.stopped', { count: counts.stopped }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Box>
          <Button
            type="button"
            size="sm"
            variant="soft"
            className="pointer-coarse:min-h-11"
            onClick={() => setDialog('replies')}
          >
            {t('campaign.bridge.open')}
          </Button>
        </Box>
        {dueNow ? (
          <Box className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={() =>
                askLaura(
                  t('campaign.prepareDraftsPrompt', {
                    step: stepTitle(dueNow.step, t),
                    names: members
                      .filter(member =>
                        member.steps.some(
                          step =>
                            step.position === dueNow.position &&
                            step.status === 'pending' &&
                            member.status === 'active',
                        ),
                      )
                      .map(member => member.contact_name)
                      .filter(Boolean)
                      .join(', '),
                  }),
                )
              }
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {t('campaign.prepareDrafts', { step: stepTitle(dueNow.step, t) })}
            </Button>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('campaign.prepareDraftsHint')}
            </Text>
          </Box>
        ) : null}
      </Box>

      {/* `.page-head` — le nom de la campagne (h1), une phrase ; [Retour aux séquences] [Mettre en pause] [⋯]. La pause
          (le geste réversible) est un bouton ; reprendre, dupliquer et arrêter vivent dans le menu. */}
      <SequencesPageHead
        title={title}
        subtitle={t('campaign.lead')}
        actions={
          <>
            <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/actions/sequences">
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t('detail.backToList')}
              </Link>
            </Button>
            {live.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                onClick={() => setDialog('pause')}
              >
                <Pause className="size-4" aria-hidden="true" />
                {t('campaign.pause')}
              </Button>
            ) : paused.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                disabled={action.isPending}
                onClick={() => void applyAll(paused, 'resume', t('campaign.resumed'))}
              >
                <Play className="size-4" aria-hidden="true" />
                {t('campaign.resume')}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  aria-label={t('campaign.moreActions')}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog('duplicate')}>
                  {t('campaign.menu.duplicate')}
                </DropdownMenuItem>
                {live.length > 0 && paused.length > 0 ? (
                  <DropdownMenuItem onSelect={() => void applyAll(paused, 'resume', t('campaign.resumed'))}>
                    {t('campaign.menu.resume')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={stoppable.length === 0} onSelect={() => setDialog('cancel')}>
                  {t('campaign.menu.cancel')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* `.main-aside` — le dossier à gauche, la colonne d'action à droite (320 px) ; elle passe dessous en dessous
          de 1 100 px, sur deux colonnes, puis une seule sur téléphone. */}
      <Box className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Box className="flex min-w-0 flex-col gap-5">
          <Box className="flex flex-wrap items-center gap-2" data-testid="campaign-badges">
            <SequenceStatusBadge status={status} />
            <Badge>{t('row.contacts', { count: counts.contacts })}</Badge>
            <Badge>{t('row.steps', { count: counts.steps })}</Badge>
            {counts.started ? <Badge>{t('campaign.started', { date: formatDate(counts.started) ?? '' })}</Badge> : null}
          </Box>

          <section className={CARD} aria-labelledby="campaign-messages-title" data-testid="campaign-messages">
            <Text element="h2" size="base" weight="semibold" id="campaign-messages-title">
              {t('campaign.messages')}
            </Text>
            <ol className="flex list-none flex-col p-0">
              {summaries.map((summary, index) => (
                <StepBlock
                  key={summary.position}
                  summary={summary}
                  reference={members[0] ?? sequence}
                  last={index === summaries.length - 1}
                  t={t}
                />
              ))}
            </ol>
          </section>

          <section className={CARD} aria-labelledby="campaign-audience-title" data-testid="campaign-audience">
            <Text element="h2" size="base" weight="semibold" id="campaign-audience-title">
              {t('campaign.audience')}
            </Text>
            <ul className="flex list-none flex-col divide-y divide-[var(--bellum-border)] p-0">
              {members.map(member => (
                <PersonRow
                  key={member.id}
                  member={member}
                  now={now}
                  t={t}
                  pending={action.isPending}
                  onStop={() =>
                    void applyAll(
                      [member],
                      'cancel',
                      t('campaign.stoppedFor', { name: member.contact_name ?? t('campaign.thisContact') }),
                    )
                  }
                />
              ))}
            </ul>
          </section>

          {editing ? (
            <section className={CARD} aria-labelledby="campaign-edit-title" data-testid="campaign-edit">
              <Text element="h2" size="base" weight="semibold" id="campaign-edit-title">
                {t('campaign.edit.title')}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('campaign.edit.lead')}
              </Text>
              {members.length > 1 ? (
                <Box className="flex flex-col gap-1">
                  <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t('campaign.edit.who')}
                  </Text>
                  <Select value={editMember.id} onValueChange={setEditMemberId}>
                    <SelectTrigger
                      aria-label={t('campaign.edit.who')}
                      className="w-72 max-w-full pointer-coarse:min-h-11"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map(member => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.contact_name ?? member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Box>
              ) : null}
              <SequenceDetailSheet
                key={editMember.id}
                layout="embedded"
                sequence={editMember}
                onClose={() => undefined}
              />
            </section>
          ) : null}
        </Box>

        <aside className="grid min-w-0 content-start gap-5 md:grid-cols-2 xl:grid-cols-1" data-testid="campaign-aside">
          {/* `.action-feature` — l'essai à blanc, en aplat d'accent. */}
          <Box
            className="flex flex-col gap-2 rounded-card border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-5"
            data-testid="campaign-dry-feature"
          >
            <Text size="xs" weight="semibold" className="text-[var(--accent-soft-text)]">
              {t('campaign.dry.eyebrow')}
            </Text>
            <Text element="h2" size="lg" weight="semibold" className="mt-1">
              {t('campaign.dry.title')}
            </Text>
            <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
              {t('campaign.dry.lead')}
            </Text>
            <Button type="button" className="mt-3 w-full pointer-coarse:min-h-11" onClick={() => setDialog('dry')}>
              {t('campaign.dry.cta')}
            </Button>
          </Box>

          <section className={CARD} data-testid="sequence-frame" aria-labelledby="campaign-frame-title">
            <Text element="h2" size="base" weight="semibold" id="campaign-frame-title">
              {t('detail.frame.title')}
            </Text>
            <Frame label={t('detail.frame.channel')}>
              {mailbox?.address ? `${channelsLine(members, t)} · ${mailbox.address}` : channelsLine(members, t)}
            </Frame>
            <Frame label={t('campaign.frame.send')}>{t('campaign.frame.sendValue')}</Frame>
            <Frame label={t('detail.frame.stopRules')}>{t('campaign.frame.stopValue')}</Frame>
            <Frame label={t('detail.frame.done')} strong>
              {counts.stepsDone}
            </Frame>
          </section>

          {calls.length > 0 ? (
            <section className={CARD} aria-labelledby="campaign-calls-title" data-testid="campaign-calls">
              <Text element="h2" size="base" weight="semibold" id="campaign-calls-title">
                {t('campaign.calls.title')}
              </Text>
              {calls.map(({ member, step }) => (
                <Box key={member.id} className="flex flex-col gap-2">
                  <Box className="flex items-center gap-3">
                    <EntityAvatar name={member.contact_name} size="xs" />
                    <Box className="flex min-w-0 flex-col">
                      <Text size="sm" weight="medium" className="truncate">
                        {member.contact_name ?? member.name}
                      </Text>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {stepTitle(step, t)} · {formatDate(step.due_at) ?? ''}
                      </Text>
                    </Box>
                  </Box>
                  <Box className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="pointer-coarse:min-h-11"
                      onClick={() =>
                        askLaura(t('campaign.calls.preparePrompt', { name: member.contact_name ?? member.name }))
                      }
                    >
                      {t('campaign.calls.prepare')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="pointer-coarse:min-h-11"
                      onClick={() => {
                        setEditing(true)
                        setEditMemberId(member.id)
                      }}
                    >
                      {t('campaign.calls.log')}
                    </Button>
                  </Box>
                </Box>
              ))}
            </section>
          ) : null}

          <DeliverabilityBlock />

          <Button
            type="button"
            variant="outline"
            className="w-full pointer-coarse:min-h-11"
            aria-expanded={editing}
            onClick={() => setEditing(open => !open)}
          >
            {t('campaign.edit.cta')}
          </Button>
        </aside>
      </Box>

      <PauseDialog
        open={dialog === 'pause'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          void applyAll(live, 'pause', t('campaign.paused'))
        }}
        t={t}
      />
      <CancelDialog
        open={dialog === 'cancel'}
        count={stoppable.length}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          void applyAll(stoppable, 'cancel', t('campaign.cancelled'))
        }}
        t={t}
      />
      <RepliesDialog open={dialog === 'replies'} onClose={() => setDialog(null)} members={members} now={now} t={t} />
      <DryRunDialog open={dialog === 'dry'} onClose={() => setDialog(null)} members={members} now={now} t={t} />
      <DuplicateCampaignDialog
        open={dialog === 'duplicate'}
        onClose={() => setDialog(null)}
        title={title}
        sequence={sequence}
        t={t}
      />
    </Box>
  )
}

/** « Relance sans réponse » : le libellé de l'étape, à défaut sa nature. */
function stepTitle(step: OutreachSequenceStep, t: TFunction<'outreach'>): string {
  const label = step.payload['label']
  return typeof label === 'string' && label.trim() !== '' ? label : t(`stepKind.${step.kind}`)
}

function emailDraft(step: OutreachSequenceStep): { subject: string; body: string } | null {
  const draft = step.payload['email_draft']
  if (!draft || typeof draft !== 'object') return null
  const { subject, body } = draft as { subject?: unknown; body?: unknown }
  return typeof body === 'string' && body.trim() !== ''
    ? { subject: typeof subject === 'string' ? subject : '', body }
    : null
}

function channelsLine(members: readonly Member[], t: TFunction<'outreach'>): string {
  const kinds = new Set(members.flatMap(member => member.steps.map(step => step.kind)))
  return [...kinds].map(kind => t(`stepKind.${kind}`)).join(' · ')
}

/** `.property` — un libellé discret, sa valeur ; un filet entre deux propriétés. */
function Frame({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <Box className="flex flex-col gap-1 border-t border-[var(--bellum-border)] pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm" weight={strong ? 'semibold' : 'normal'} className="break-words">
        {children}
      </Text>
    </Box>
  )
}

/**
 * `.sequence-step` — le jour dans un carré (J0, J3…), relié au suivant par un filet vertical ; à droite, le bloc de
 * l'étape : l'objet du message (à défaut le nom de l'étape), son texte tel que Laura l'a préparé, puis ses résultats
 * en pastilles teintées (faite, à valider, en retard, prévue, ignorée).
 */
function StepBlock({
  summary,
  reference,
  last,
  t,
}: {
  summary: ReturnType<typeof stepSummaries>[number]
  reference: OutreachSequence
  last: boolean
  t: TFunction<'outreach'>
}) {
  const { step } = summary
  const delay = delayOf(step, reference)
  const draft = emailDraft(summary.drafted ?? step)
  const blocked = blockedVariablesOf(step.payload)
  return (
    <li data-testid={`campaign-step-${summary.position}`} className="relative flex gap-4 pb-6 last:pb-0">
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[1.1875rem] top-10 border-l border-[var(--bellum-border)]"
        />
      )}
      <span className="z-10 grid size-10 shrink-0 place-items-center rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs font-semibold">
        {t('campaign.day', { day: delay.days })}
      </span>
      <Box className="flex min-w-0 flex-1 flex-col gap-2 rounded-card border border-[var(--bellum-border)] p-4">
        <Text element="h3" size="sm" weight="semibold">
          {draft?.subject || stepTitle(step, t)}
        </Text>
        {blocked.length > 0 ? (
          <Text size="xs" weight="medium" role="status">
            {t('preview.blocked', { variables: blocked.join(' · ') })}
          </Text>
        ) : draft ? (
          <Text
            size="sm"
            className="line-clamp-6 whitespace-pre-wrap leading-relaxed text-[var(--bellum-text-secondary)]"
          >
            {draft.body}
          </Text>
        ) : (
          <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
            {t(`campaign.purpose.${step.kind}`)}
          </Text>
        )}
        <Box className="mt-1 flex flex-wrap gap-2">
          {summary.done > 0 ? (
            <Badge variant="success">
              {t('campaign.step.done', { count: summary.done, date: formatDate(summary.doneAt) ?? '' })}
            </Badge>
          ) : null}
          {summary.dueToday > 0 ? (
            <Badge variant="primary">{t('campaign.step.dueToday', { count: summary.dueToday })}</Badge>
          ) : null}
          {summary.late > 0 ? (
            <Badge variant="warning">{t('campaign.step.late', { count: summary.late })}</Badge>
          ) : null}
          {summary.upcoming > 0 && summary.nextDueAt ? (
            <Badge variant="outline">{t('campaign.step.planned', { date: formatDate(summary.nextDueAt) ?? '' })}</Badge>
          ) : null}
          {summary.skipped > 0 ? (
            <Badge variant="outline">{t('campaign.step.skipped', { count: summary.skipped })}</Badge>
          ) : null}
        </Box>
      </Box>
    </li>
  )
}

function PersonRow({
  member,
  now,
  t,
  pending,
  onStop,
}: {
  member: Member
  now: Date
  t: TFunction<'outreach'>
  pending: boolean
  onStop: () => void
}) {
  const line = memberLine(member, now)
  const name = member.contact_name ?? member.name
  const canStop = (member.status === 'active' || member.status === 'paused') && !member.contact_replied
  const signal = [...member.steps].reverse().find(step => step.engagement_signal)?.engagement_signal ?? null
  return (
    <li data-testid={`campaign-person-${member.id}`} className="flex flex-wrap items-center gap-3 py-3.5">
      <EntityAvatar name={member.contact_name} size="sm" />
      <Box className="flex min-w-0 flex-1 flex-col">
        <Link
          to="/contacts/$id"
          params={{ id: member.contact_id }}
          className="w-fit text-sm font-medium text-[var(--bellum-text-primary)] underline-offset-2 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
        >
          {name}
        </Link>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {member.contact_role ?? t('columns.noRole')}
          {' · '}
          {member.account_id ? (
            <Link to="/accounts/$id" params={{ id: member.account_id }} className="underline-offset-2 hover:underline">
              {member.account_name ?? t('columns.noAccount')}
            </Link>
          ) : (
            (member.account_name ?? t('columns.noAccount'))
          )}
        </Text>
        <Text size="xs" className="flex items-center gap-1.5 text-[var(--bellum-text-secondary)]">
          <span className={`inline-block size-2 shrink-0 rounded-full ${DOT_TONE[line.tone]}`} aria-hidden="true" />
          {memberLineText(line, t)}
        </Text>
      </Box>
      <Box className="ml-auto flex items-center gap-2">
        {/* Les signaux de la personne en pastilles : rendez-vous pris, ouverture / clic rapportés — jamais devinés. */}
        {line.key === 'meeting' ? <Badge variant="success">{t('campaign.person.meeting')}</Badge> : null}
        {signal ? <Badge variant="outline">{t(`detail.engagementSignal.${signal}`)}</Badge> : null}
        {canStop ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            aria-label={t('campaign.stopFor', { name })}
            onClick={onStop}
          >
            {t('campaign.stopForShort')}
          </Button>
        ) : null}
        <Link
          to="/contacts/$id"
          params={{ id: member.contact_id }}
          aria-label={t('campaign.openContact', { name })}
          className="inline-flex size-9 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:size-11"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </Box>
    </li>
  )
}

function memberLineText(line: ReturnType<typeof memberLine>, t: TFunction<'outreach'>): string {
  const when = line.date ? (formatDate(line.date) ?? '') : ''
  const kind = line.stepKind ? t(`stepKind.${line.stepKind}`) : ''
  return t(`campaign.person.${line.key}`, { date: when, kind })
}

function PauseDialog({
  open,
  onClose,
  onConfirm,
  t,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  t: TFunction<'outreach'>
}) {
  const { t: tc } = useTranslation('common')
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent closeLabel={tc('actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('campaign.pauseDialog.title')}</DialogTitle>
          <DialogDescription>{t('campaign.pauseDialog.body')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="pointer-coarse:min-h-11" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button className="pointer-coarse:min-h-11" onClick={onConfirm}>
            {t('campaign.pause')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CancelDialog({
  open,
  count,
  onClose,
  onConfirm,
  t,
}: {
  open: boolean
  count: number
  onClose: () => void
  onConfirm: () => void
  t: TFunction<'outreach'>
}) {
  const { t: tc } = useTranslation('common')
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent closeLabel={tc('actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('campaign.cancelDialog.title')}</DialogTitle>
          <DialogDescription>{t('campaign.cancelDialog.body', { count })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="pointer-coarse:min-h-11" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button variant="destructive" className="pointer-coarse:min-h-11" onClick={onConfirm}>
            {t('campaign.menu.cancelShort')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RepliesTab = 'replies' | 'done' | 'prepared'

function RepliesDialog({
  open,
  onClose,
  members,
  now,
  t,
}: {
  open: boolean
  onClose: () => void
  members: readonly Member[]
  now: Date
  t: TFunction<'outreach'>
}) {
  const { t: tc } = useTranslation('common')
  const [tab, setTab] = useState<RepliesTab>('replies')
  const replies = members.filter(member => member.contact_replied || member.cancel_reason !== null)
  const done = members.filter(member => member.steps.some(step => step.status === 'done'))
  const prepared = members.filter(member => member.status === 'active' && memberLine(member, now).key === 'dueNow')
  const tabs: { key: RepliesTab; list: Member[] }[] = [
    { key: 'replies', list: replies },
    { key: 'done', list: done },
    { key: 'prepared', list: prepared },
  ]
  const shown = tabs.find(candidate => candidate.key === tab)?.list ?? []
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent closeLabel={tc('actions.close')} className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('campaign.replies.title')}</DialogTitle>
          <DialogDescription>{t('campaign.replies.lead')}</DialogDescription>
        </DialogHeader>
        <Box className="flex flex-wrap gap-2" role="group" aria-label={t('campaign.replies.title')}>
          {tabs.map(({ key, list }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={tab === key ? 'default' : 'outline'}
              aria-pressed={tab === key}
              className="pointer-coarse:min-h-11"
              onClick={() => setTab(key)}
            >
              {t(`campaign.replies.tab.${key}`, { count: list.length })}
            </Button>
          ))}
        </Box>
        {shown.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t(`campaign.replies.empty.${tab}`)}
          </Text>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0" data-testid="campaign-replies-list">
            {shown.map(member => (
              <li key={member.id} className="flex items-center gap-3">
                <EntityAvatar name={member.contact_name} size="xs" />
                <Box className="flex min-w-0 flex-1 flex-col">
                  <Text size="sm" weight="medium">
                    {member.contact_name ?? member.name}
                  </Text>
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {tab === 'done'
                      ? t('campaign.replies.doneCount', {
                          count: member.steps.filter(step => step.status === 'done').length,
                        })
                      : memberLineText(memberLine(member, now), t)}
                  </Text>
                </Box>
              </li>
            ))}
          </ul>
        )}
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('campaign.replies.hint')}
        </Text>
        <DialogFooter>
          <Button asChild variant="outline" className="pointer-coarse:min-h-11">
            <Link to="/mailbox">{t('campaign.replies.mailbox')}</Link>
          </Button>
          <Button className="pointer-coarse:min-h-11" onClick={onClose}>
            {tc('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DryRunDialog({
  open,
  onClose,
  members,
  now,
  t,
}: {
  open: boolean
  onClose: () => void
  members: readonly Member[]
  now: Date
  t: TFunction<'outreach'>
}) {
  const { t: tc } = useTranslation('common')
  const items = dryRun(members, now)
  const reference = members[0]
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent closeLabel={tc('actions.close')} className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('campaign.dry.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('campaign.dry.dialogLead')}</DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="dry-run-empty">
            {t('campaign.dry.empty')}
          </Text>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0" data-testid="dry-run-list">
            {items.map(item => {
              const step = reference?.steps.find(candidate => candidate.position === item.position)
              return (
                <li key={`${item.date}-${item.position}-${item.kind}`} className="flex flex-col gap-0.5">
                  <Text size="sm" weight="medium">
                    {formatDate(item.date) ?? ''} · {step ? stepTitle(step, t) : t(`stepKind.${item.kind}`)} ·{' '}
                    {item.names.join(', ')}
                  </Text>
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {t(`campaign.dry.what.${item.kind === 'call' ? 'call' : item.kind === 'email' ? 'email' : 'task'}`)}
                  </Text>
                </li>
              )
            })}
          </ul>
        )}
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('campaign.dry.note')}
        </Text>
        <DialogFooter>
          <Button className="pointer-coarse:min-h-11" onClick={onClose}>
            {tc('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Dupliquer… » : le nom de la copie, puis l'assistant s'ouvre avec ce nom ET la cadence — l'audience se choisit là. */
function DuplicateCampaignDialog({
  open,
  onClose,
  title,
  sequence,
  t,
}: {
  open: boolean
  onClose: () => void
  title: string
  sequence: OutreachSequence
  t: TFunction<'outreach'>
}) {
  const { t: tc } = useTranslation('common')
  const [name, setName] = useState(() => t('campaign.duplicate.copyName', { name: title }))
  const cadence = sequence.steps
    .map(step => `${step.kind}.${Math.max(0, Math.round(delayOf(step, sequence).days))}`)
    .join(',')
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent closeLabel={tc('actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('campaign.duplicate.title')}</DialogTitle>
          <DialogDescription>{t('campaign.duplicate.lead')}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-sm">
          {t('campaign.duplicate.name')}
          <Input value={name} onChange={event => setName(event.target.value)} className="pointer-coarse:min-h-11" />
        </label>
        <DialogFooter>
          <Button variant="outline" className="pointer-coarse:min-h-11" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button asChild disabled={name.trim() === ''} className="pointer-coarse:min-h-11">
            <Link to="/actions/sequences" search={{ parcours: 1, nom: name.trim(), cadence }}>
              {t('campaign.duplicate.go')}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
