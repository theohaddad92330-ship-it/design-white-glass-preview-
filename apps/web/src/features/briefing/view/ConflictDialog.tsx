import type { AgendaConflict, AgendaEvent } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { ArrowUpRight, Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { guestCount } from '@/features/agenda/agenda-drag'
import { agendaEventTitle, isAllDay, timingOf } from '@/features/agenda/agenda-view'
import { useAgendaStatus, useRescheduleEvent } from '@/features/agenda/api'
import { JoinButton } from '@/features/agenda/view/AgendaBoard'
import { WarnGuestDialog } from '@/features/agenda/view/WarnGuestDialog'
import { resolveOverlap, type ConflictResolutionOption } from '@/features/agenda/conflict-resolution'
import { durationLabel } from '@/features/agenda/duration-label'
import { guestResponseTally } from '@/features/agenda/guest-responses'
import { useNow } from '@/lib/hooks/use-now'
import { safeHref } from '@/lib/safe-href'

/**
 * #2390.12 — les battements CONCRETS que l'écran propose : des choix, jamais
 * un champ libre ni une valeur devinée par le calcul (voir le docblock de
 * `resolveOverlap`). Un réglage vit à un seul endroit (GA-26) — cette
 * constante-ci, nulle part ailleurs.
 */
const BUFFER_MINUTES_CHOICES = [15, 30] as const

/**
 * #2102.1 / #2102.2 — LE PARCOURS RÉEL D'UN CONFLIT D'AGENDA.
 *
 * La carte de conflit du brief (`briefing-actions.ts`) portait `href: null` :
 * « aucun écran d'agenda n'existe, le conflit se lit, il ne s'ouvre pas ». Ce
 * constat reste vrai — il n'y a toujours pas de ROUTE dédiée — mais rien
 * n'empêchait d'ouvrir les deux rendez-vous eux-mêmes, dont les données
 * complètes (`AgendaConflict.first`/`second`) voyagent déjà jusqu'ici
 * (`briefingAgendaBlockSchema.conflicts`). Cette boîte de dialogue est ce
 * parcours : elle ne navigue nulle part, elle montre.
 *
 * #2102.11 — « Proposer rejoindre » réutilise `JoinButton`, déjà écrit pour
 * `AgendaBoard` : un second bouton « Rejoindre » ne doit pas dire autre chose
 * que le premier (GA-26).
 *
 * #2390.11 / #2390.12 (LAU-FINAL-104) — DES OPTIONS CONCRÈTES, PAS SEULEMENT
 * UN CONSTAT.
 *
 * Cette boîte se contentait de MONTRER les deux rendez-vous : aucune action
 * de résolution n'existait (`git grep` vide sur « déléguer »/« buffer » côté
 * agenda). `resolveOverlap` (`conflict-resolution.ts`) calcule les seules
 * résolutions qui ne demandent RIEN d'inventé — décaler l'un après l'autre, ou
 * raccourcir le premier jusqu'au début du second — et chaque carte propose
 * celles qui la concernent. « Déléguer » et « ajouter un buffer » restent hors
 * de cette tranche : l'un exige de choisir un délégataire, l'autre une
 * politique de battement — deux décisions produit que rien ici ne permet de
 * prendre à la place de l'utilisateur.
 *
 * #2390.19 — NO-GO : aucune option n'écrit directement. Un clic ouvre
 * `ConflictResolutionConfirm` (avant/après, qui sera prévenu, confirmation
 * explicite) ; rien ne part sans elle.
 *
 * #2938 (#2102.12) — « prévenir un invité » : un brouillon `mailto:` vers un
 * destinataire HORS CRM (e-mail libre, validé par `validatedSingleEmail` —
 * MÊME règle que `NewEventDialog`), ouvert dans `WarnGuestDialog`. Le
 * registre du 16/09 l'avait laissé hors de la première tranche en l'appelant
 * « un chantier de messagerie à part entière » — reclassé le 24/09 : ce
 * n'était pas un second système, seulement un brouillon `mailto:` de plus
 * (même famille que `ContactDialog.tsx`/`MissionDetailPanel.tsx`). Le
 * copilote PRÉPARE (sujet, corps) ; le commercial ENVOIE, depuis SON client
 * de messagerie — aucun appel ne part d'ici (doctrine, CLAUDE.md).
 *
 * #2102.3 / #2102.4 / #2102.5 / #2102.7 — CE QUE CHAQUE CARTE AJOUTE.
 *
 * Quatre compléments, tous lus sur `AgendaEvent` ou déjà écrits ailleurs — GA-26
 * refuse un second mot pour la même idée :
 *  - interne/externe : `agenda.external`/`agenda.internal`, le badge de
 *    `AgendaBoard`.
 *  - invités et durée : `guestCount` (`agenda-drag.ts`) et `durationLabel`
 *    (`duration-label.ts`), déjà ceux de `RescheduleDialog`/`AgendaGrid`.
 *    ⚠️ « importance connue » (#2102.4) n'a AUCUNE source dans `AgendaEvent` —
 *    aucun champ ne la porte nulle part dans ce dépôt. Elle n'est pas inventée
 *    (doctrine « jamais de donnée fictive ») : cette carte ne l'affiche pas.
 *  - qui sera prévenu : `agenda.reschedule.guests`/`externals`, la MÊME phrase
 *    que `RescheduleDialog` pour la même question.
 *  - proposer lequel déplacer, sans décider seul : un lien « Ouvrir dans
 *    l'agenda » (`event.webUrl`), SYMÉTRIQUE sur les deux cartes — le geste de
 *    déplacer reste dans l'agenda du fournisseur, cette boîte ne décide pas à
 *    la place de l'utilisateur laquelle des deux bouger.
 */
export function ConflictDialog({ conflict, onClose }: { conflict: AgendaConflict; onClose: () => void }) {
  const { t, i18n } = useTranslation('briefing')
  // #2938 — la capacité du fournisseur, lue AVANT d'ouvrir la confirmation :
  // MÊME lecture que `AgendaBoard.tsx`, pour la même question exactement
  // (peut-on décocher « prévenir les invités » ?).
  const { data: agendaStatus } = useAgendaStatus(true)
  const reschedule = useRescheduleEvent()
  const [pendingResolution, setPendingResolution] = useState<{
    event: AgendaEvent
    option: ConflictResolutionOption
  } | null>(null)
  // #2938 — le geste PRÉPARE un brouillon (`WarnGuestDialog`), il n'écrit
  // rien : même précaution que `pendingResolution`, un état SÉPARÉ, jamais
  // confondu (un déplacement et un e-mail hors CRM ne partagent aucune donnée).
  const [warnEvent, setWarnEvent] = useState<AgendaEvent | null>(null)
  // #2390.12 — déléguer = une PROPOSITION (brouillon `mailto:`), état séparé
  // des deux autres : ni écriture d'agenda, ni avertissement.
  const [delegateEvent, setDelegateEvent] = useState<AgendaEvent | null>(null)

  const options = resolveOverlap(conflict, { bufferMinutes: BUFFER_MINUTES_CHOICES })

  const confirmResolution = (notifyGuests: boolean) => {
    if (!pendingResolution) return
    const { option } = pendingResolution
    reschedule.mutate(
      { eventId: option.eventId, startsAt: option.startsAt, endsAt: option.endsAt, notifyGuests },
      {
        onSuccess: result => {
          // Même principe que `AgendaBoard.confirmMove` : ce qui s'est
          // RÉELLEMENT passé, pas ce qui a été demandé.
          toast.success(
            option.kind === 'shortenFirst'
              ? result.guestsNotified
                ? t('conflictDialog.resolution.shortenedNotified')
                : t('conflictDialog.resolution.shortenedSilent')
              : result.guestsNotified
                ? t('agenda.reschedule.movedNotified')
                : t('agenda.reschedule.movedSilent'),
          )
          setPendingResolution(null)
          // Les deux rendez-vous affichés ne sont plus le conflit résolu :
          // refermer plutôt que montrer une carte devenue fausse.
          onClose()
        },
        onError: (error: Error) => {
          toast.error(
            error?.message ||
              (option.kind === 'shortenFirst' ? t('conflictDialog.resolution.failed') : t('agenda.reschedule.failed')),
          )
          setPendingResolution(null)
        },
      },
    )
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={open => {
          if (!open) onClose()
        }}
      >
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('conflictDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('conflictDialog.description', { minutes: conflict.overlapMinutes })}
            </DialogDescription>
          </DialogHeader>
          <Box className="flex flex-col gap-3">
            <ConflictEventCard
              event={conflict.first}
              resolutions={options.filter(option => option.eventId === conflict.first.id)}
              onResolve={option => setPendingResolution({ event: conflict.first, option })}
              onWarn={() => setWarnEvent(conflict.first)}
              onDelegate={() => setDelegateEvent(conflict.first)}
            />
            <ConflictEventCard
              event={conflict.second}
              resolutions={options.filter(option => option.eventId === conflict.second.id)}
              onResolve={option => setPendingResolution({ event: conflict.second, option })}
              onWarn={() => setWarnEvent(conflict.second)}
              onDelegate={() => setDelegateEvent(conflict.second)}
            />
          </Box>
          {/* #2102.4 (arbitrage Louis 31/10) — l'importance = le TYPE de réunion, lu sur `isExternal` : un
              rendez-vous client pèse plus qu'un point interne. Ce n'est pas un verdict de déplacement : le
              choix de ce qui bouge reste à l'utilisateur, rien ne se déplace sans sa confirmation. Deux
              rendez-vous du même type : le type ne départage pas, on n'invente pas de gagnant. */}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {conflict.first.isExternal === conflict.second.isExternal
              ? t('conflictDialog.importance.same')
              : t('conflictDialog.importance.different')}
          </Text>
        </DialogContent>
      </Dialog>
      <ConflictResolutionConfirm
        event={pendingResolution?.event ?? null}
        option={pendingResolution?.option ?? null}
        canStaySilent={agendaStatus?.capabilities.silentReschedule === true}
        pending={reschedule.isPending}
        onConfirm={confirmResolution}
        onCancel={() => setPendingResolution(null)}
      />
      {/* #2938 — sibling du dialogue de conflit, jamais imbriqué dedans : rend
          `null` tant qu'aucun avertissement n'est proposé. */}
      <WarnGuestDialog event={warnEvent} language={i18n.language} onClose={() => setWarnEvent(null)} />
      <WarnGuestDialog
        mode="delegate"
        event={delegateEvent}
        language={i18n.language}
        onClose={() => setDelegateEvent(null)}
      />
    </>
  )
}

function ConflictEventCard({
  event,
  resolutions,
  onResolve,
  onWarn,
  onDelegate,
}: {
  event: AgendaEvent
  resolutions: ConflictResolutionOption[]
  onResolve: (option: ConflictResolutionOption) => void
  onWarn: () => void
  onDelegate: () => void
}) {
  const { t, i18n } = useTranslation('briefing')
  const now = useNow()
  const timing = timingOf(event, now)

  const time =
    isAllDay(event) || !event.start
      ? null
      : new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(event.start))

  // #2102.4 — la durée réelle, jamais un nombre de minutes brut : même lecture
  // que `AgendaGrid`/`RescheduleDialog` (`durationLabel`).
  const durationMinutes =
    event.start && event.end
      ? Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000)
      : null
  const duration =
    durationMinutes !== null && Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationLabel(durationMinutes, t('agenda.grid.hourSuffix'))
      : null

  // #2102.7 — qui sera prévenu si CE rendez-vous bouge. `guestCount` est déjà
  // celui de `RescheduleDialog`, pour la même question exactement.
  const guests = guestCount(event)

  const tally = guestResponseTally(event)
  const responses = tally
    ? (['accepted', 'tentative', 'declined', 'pending'] as const)
        .filter(kind => tally[kind] > 0)
        .map(kind => t(`conflictDialog.responses.${kind}`, { count: tally[kind] }))
        .join(' · ')
    : ''

  const webUrl = safeHref(event.webUrl)

  return (
    <Box className="flex flex-col gap-1.5 rounded-lg border border-[var(--bellum-border)] p-3">
      <Box display="flex" className="items-start justify-between gap-2">
        <Text size="sm" weight="medium">
          {agendaEventTitle(event, { busy: t('agenda.grid.busy'), untitled: '' })}
        </Text>
        {/* #2102.3 — interne/externe : le même mot que `AgendaBoard`, jamais un
            second (GA-26). */}
        <Badge variant="outline" className="shrink-0 text-xs">
          {event.isExternal ? t('agenda.external') : t('agenda.internal')}
        </Badge>
      </Box>
      {/* #2102.4 — l'importance, dérivée du seul type de réunion que l'évènement porte déjà. */}
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {event.isExternal ? t('conflictDialog.importance.client') : t('conflictDialog.importance.internal')}
      </Text>
      {time ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {[time, duration].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {guests.total > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('agenda.reschedule.guests', { count: guests.total })}
          {guests.external > 0 ? ` · ${t('agenda.reschedule.externals', { count: guests.external })}` : ''}
        </Text>
      ) : null}
      {/* #2390.14 — le critère « engagement » : ce que les invités ont
          répondu, en décompte. Aucune réponse lisible, aucune ligne. */}
      {responses ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('conflictDialog.responses.label', { list: responses })}
        </Text>
      ) : null}
      {timing.phase === 'live' || timing.phase === 'soon' ? (
        <Box className="pt-0.5">
          <JoinButton event={event} phase={timing.phase} />
        </Box>
      ) : null}
      {timing.phase !== 'live' || resolutions.length || guests.total > 0 ? (
        <Box className="flex flex-wrap items-center gap-3 pt-1">
          {/* #2102.10 — si CE rendez-vous a déjà commencé (`timing.phase ===
              'live'`), le résoudre serait rétroactif : les options
              disparaissent pour LUI, mais restent sur l'autre carte si elle
              n'a pas commencé — c'est « replanifier la suite » (#2102.13),
              jamais le rendez-vous en cours. */}
          {timing.phase !== 'live'
            ? resolutions.map(option => (
                <Button
                  key={option.kind === 'moveSecondWithBuffer' ? `${option.kind}:${option.bufferMinutes}` : option.kind}
                  size="sm"
                  variant="outline"
                  onClick={() => onResolve(option)}
                >
                  {option.kind === 'shortenFirst'
                    ? t('conflictDialog.resolution.shorten')
                    : option.kind === 'moveSecondWithBuffer'
                      ? t('conflictDialog.resolution.buffer', {
                          duration: durationLabel(option.bufferMinutes, t('agenda.grid.hourSuffix')),
                        })
                      : t('conflictDialog.resolution.move')}
                </Button>
              ))
            : null}
          {/* #2938 (#2102.12) — prévenir quelqu'un HORS CRM d'un brouillon
              `mailto:` : n'apparaît que s'il y a au moins un invité à propos de
              qui écrire, indépendamment des options de résolution — même
              garde que le bloc « X invités » juste au-dessus, une case pour un
              geste sans objet ferait hésiter sur rien. */}
          {/* #2390.12 — déléguer : une PROPOSITION (brouillon `mailto:`), jamais
              un changement d'organisateur ni une écriture d'agenda. */}
          {timing.phase !== 'live' ? (
            <Button size="sm" variant="outline" onClick={onDelegate}>
              {t('conflictDialog.delegate')}
            </Button>
          ) : null}
          {guests.total > 0 ? (
            <Button size="sm" variant="outline" onClick={onWarn}>
              {t('conflictDialog.warn')}
            </Button>
          ) : null}
        </Box>
      ) : null}
      {/* #2102.5 — proposer lequel déplacer, sans décider seul : le MÊME lien,
          à la même place, sur les deux cartes. Le déplacement lui-même se fait
          dans l'agenda du fournisseur — cette boîte ne fait que lire. */}
      {webUrl ? (
        <a
          href={webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 pt-0.5 text-xs font-medium text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
        >
          {t('conflictDialog.openInAgenda')}
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
      ) : null}
    </Box>
  )
}

/**
 * #2390.19 — LA SEULE PORTE VERS L'ÉCRITURE.
 *
 * Même geste que `RescheduleDialog` (avant/après, qui sera prévenu, un clic
 * pour confirmer) mais construit directement sur les horaires ISO de
 * `ConflictResolutionOption` plutôt que sur un `DragProposal` en minutes de la
 * journée : ces options ne viennent pas d'un geste de souris borné à une
 * grille, elles sont déjà des horaires absolus.
 */
function ConflictResolutionConfirm({
  event,
  option,
  canStaySilent,
  pending,
  onConfirm,
  onCancel,
}: {
  event: AgendaEvent | null
  option: ConflictResolutionOption | null
  canStaySilent: boolean
  pending: boolean
  onConfirm: (notifyGuests: boolean) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation('briefing')
  const [notifyGuests, setNotifyGuests] = useState(true)

  // À chaque nouvelle option, on repart de « prévenir ». Le silence est un
  // choix délibéré, jamais un reste de la résolution précédente.
  useEffect(() => {
    if (option) setNotifyGuests(true)
  }, [option])

  if (!event || !option) return null

  const guests = guestCount(event)
  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' })
  const before =
    event.start && event.end ? `${time.format(new Date(event.start))} → ${time.format(new Date(event.end))}` : ''
  const after = `${time.format(new Date(option.startsAt))} → ${time.format(new Date(option.endsAt))}`
  const effectiveNotify = canStaySilent ? notifyGuests : true
  const isShorten = option.kind === 'shortenFirst'
  const eventTitle = agendaEventTitle(event, { busy: t('agenda.grid.busy'), untitled: '' })

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onCancel())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isShorten ? t('conflictDialog.resolution.shortenTitle') : t('agenda.reschedule.title')}
          </DialogTitle>
          {/* #3533 — sans titre, jamais « (sans objet » : la plage horaire en tient lieu. */}
          <DialogDescription>{eventTitle || before}</DialogDescription>
        </DialogHeader>

        <Box className="flex flex-col gap-3 px-1">
          <Box className="flex flex-col gap-1 rounded-lg bg-[var(--bellum-surface-2)] p-3">
            <Text size="sm" className="text-[var(--bellum-text-secondary)] line-through">
              {before}
            </Text>
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {after}
            </Text>
          </Box>

          {guests.total > 0 ? (
            <>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('agenda.reschedule.guests', { count: guests.total })}
                {guests.external > 0 ? ` · ${t('agenda.reschedule.externals', { count: guests.external })}` : ''}
              </Text>
              {/* #2102.8 — le message de notification calendrier : ce que les invités vont recevoir,
                  avant de confirmer. Le texte exact est celui de ton agenda ; ici, ce que Bellum SAIT du
                  changement : le nouvel horaire. Pas de notification, pas de message annoncé. */}
              {effectiveNotify ? (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('agenda.reschedule.notifyPreview', { after, before })}
                </Text>
              ) : null}
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={effectiveNotify}
                  disabled={!canStaySilent}
                  onCheckedChange={checked => setNotifyGuests(checked === true)}
                  aria-label={t('agenda.reschedule.notify')}
                />
                <Text size="sm" className="text-[var(--bellum-text-primary)]">
                  {t('agenda.reschedule.notify')}
                </Text>
              </label>
              {!canStaySilent ? (
                <Text size="xs" className="flex items-start gap-1.5 text-[var(--bellum-text-muted)]">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {t('agenda.reschedule.alwaysNotifies')}
                </Text>
              ) : null}
            </>
          ) : (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('agenda.reschedule.noGuests')}
            </Text>
          )}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t('agenda.reschedule.cancel')}
          </Button>
          <Button onClick={() => onConfirm(effectiveNotify)} disabled={pending}>
            {isShorten ? t('conflictDialog.resolution.confirmShorten') : t('agenda.reschedule.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
