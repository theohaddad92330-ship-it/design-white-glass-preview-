import { personAttendeesOf, type AgendaEvent, type FreeSlot } from '@bellum/contracts'
import { Badge, Box, Text, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { AlertTriangle, CircleDashed, MapPin, Plus, Repeat, Sparkles, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { isNoopDrag, proposeDrag, type DragMode, type DragProposal } from '../agenda-drag'
import { buildAgendaGrid, heightPercent, offsetPercent, type AgendaGridModel, type GridBlock } from '../agenda-grid'
import { agendaEventTitle, isBellumCreatedAgendaEvent, isProposedAgendaEvent, timingOf } from '../agenda-view'
import { durationLabel } from '../duration-label'
import { JoinButton } from './AgendaBoard'
import { AgendaKindLine } from './AgendaKindLine'
import { RoomLines } from './RoomLines'

/**
 * La journée en GRILLE — le temps se voit au lieu de se lire.
 *
 * Une liste donnait la même taille à une réunion de quinze minutes et à un
 * séminaire de trois heures, et ne montrait pas du tout les trous. Ici la
 * hauteur EST la durée : un après-midi vide se reconnaît sans compter, un
 * chevauchement se voit avant d'être annoncé par un compteur.
 *
 * Tout le placement vient de `agenda-grid.ts`, pur et testé. Ce composant ne
 * fait que poser des pourcentages : une erreur de calcul ne se verrait pas —
 * un rendez-vous mal placé reste un joli rectangle.
 */

/** Hauteur d'une heure, en pixels. C'est ce qui rend la grille lisible : plus
 *  bas, une réunion de trente minutes n'a plus la place d'afficher son titre. */
const HOUR_HEIGHT = 56

/**
 * Hauteur minimale, en pourcentage de la fenêtre, pour poser « Rejoindre » dans
 * un bloc. En dessous, le bouton recouvrirait le titre du rendez-vous — et un
 * bloc qui n'affiche plus que son bouton ne se reconnaît plus.
 *
 * Le rendez-vous garde son lien par ailleurs : le bandeau du haut porte celui
 * qui commence, et le survol donne le reste.
 */
const JOIN_MIN_HEIGHT_PERCENT = (45 / (12 * 60)) * 100

/**
 * Combien de pixels la souris doit parcourir pour qu'un appui devienne un GESTE.
 *
 * En dessous, c'est un clic — et un clic ouvre la préparation du rendez-vous.
 * Sans ce seuil, l'aimantation au quart d'heure faisait d'un appui immobile sur
 * un rendez-vous de 16 h 54 un déplacement vers 17 h : le panneau de
 * confirmation s'ouvrait par-dessus celui de préparation, prêt à prévenir les
 * invités d'un changement que personne n'avait demandé.
 */
const DRAG_THRESHOLD_PX = 5

/**
 * #2926 — la hauteur MINIMALE d'un rendez-vous, en pixels. À 56 px par heure, un
 * rendez-vous de quinze minutes se rendait à 14 px, un de dix à ≈ 9 : le titre
 * tronqué, le bloc illisible (recette prod 02/10, « Rendez-vous personnel » à
 * 12:00). Sous `COMPACT_BELOW_PX`, l'heure et le titre se posent sur UNE ligne.
 * Un bloc minimal peut en recouvrir un voisin tout proche : on préfère un titre
 * lisible à une échelle exacte pour un rendez-vous de dix minutes.
 */
const MIN_BLOCK_HEIGHT_PX = 28
const COMPACT_BELOW_PX = 44

export function AgendaGrid({
  events,
  freeSlots,
  now,
  language,
  conflictingIds,
  onPickFreeSlot,
  onOpenEvent,
  onDragEnd,
}: {
  events: AgendaEvent[]
  freeSlots: FreeSlot[]
  now: Date
  language: string
  /** Rendez-vous qui se chevauchent, calculés par le serveur. */
  conflictingIds?: ReadonlySet<string>
  /** Clic sur une plage libre — proposer un créneau. Absent ⇒ plages inertes. */
  onPickFreeSlot?: (slot: FreeSlot) => void
  /** Clic sur un rendez-vous — le préparer. Absent ⇒ blocs non cliquables. */
  onOpenEvent?: (event: AgendaEvent) => void
  /**
   * Un geste de déplacement ou d'étirement s'est terminé.
   *
   * Rien n'est écrit ici : la grille PROPOSE un nouvel horaire, et c'est
   * l'appelant qui demande confirmation puis enregistre. Un glisser-déposer qui
   * écrirait directement préviendrait les invités d'un frôlement de souris.
   */
  onDragEnd?: (event: AgendaEvent, proposal: DragProposal) => void
}) {
  const { t } = useTranslation('briefing')
  const model = useMemo(() => buildAgendaGrid(events, freeSlots), [events, freeSlots])
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowOffset = offsetPercent(model, nowMinutes)
  const gridHeight = (model.hours.length - 1) * HOUR_HEIGHT
  const drag = useDrag(model, gridHeight, onDragEnd)

  const hourLabel = (minutes: number) =>
    new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
      new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60),
    )

  return (
    <Box className="flex flex-col gap-3">
      {/* Les « journée entière » ne se placent pas sur une grille horaire : les
          étirer sur douze heures écraserait tout le reste. Ils vivent au-dessus,
          comme dans n'importe quel agenda. */}
      {model.allDay.length > 0 ? (
        <Box className="flex flex-wrap gap-1.5">
          {model.allDay.map(event => (
            <Badge key={event.id} variant="outline" className="max-w-full">
              <span className="truncate">
                {agendaEventTitle(event, { busy: t('agenda.grid.busy'), untitled: t('agenda.grid.untitled') })}
              </span>
            </Badge>
          ))}
        </Box>
      ) : null}

      {/* `shrink-0` et `minHeight` : la hauteur de la grille EST l'échelle de
          temps. Sans eux, un parent en `flex` la comprime — mesuré à 46 px par
          heure au lieu de 56 —, les blocs courts n'ont plus la place d'afficher
          leur titre, et l'échelle cesse d'être celle qu'on a calculée. */}
      <Box className="relative flex shrink-0" style={{ height: gridHeight, minHeight: gridHeight }}>
        {/* La colonne des heures. Chaque graduation est posée en pourcentage,
            comme les blocs : deux systèmes de position finiraient par se
            décaler d'un pixel et les rendez-vous ne seraient plus « à l'heure ». */}
        <Box className="relative w-12 shrink-0">
          {model.hours.map(minutes => (
            <Box
              key={minutes}
              className="absolute right-2 -translate-y-1/2"
              style={{ top: `${offsetPercent(model, minutes) ?? 0}%` }}
            >
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {hourLabel(minutes)}
              </Text>
            </Box>
          ))}
        </Box>

        <Box className="relative flex-1 border-l border-[var(--bellum-border)]">
          {model.hours.map(minutes => (
            <Box
              key={minutes}
              className="absolute inset-x-0 border-t border-[var(--bellum-border)] opacity-40"
              style={{ top: `${offsetPercent(model, minutes) ?? 0}%` }}
            />
          ))}

          {/* Les plages libres SOUS les rendez-vous : elles décrivent le vide,
              elles ne doivent jamais recouvrir ce qui l'occupe. */}
          {model.free.map(slot => {
            const top = offsetPercent(model, slot.startMinutes)
            if (top === null) return null
            const height = heightPercent(model, slot.startMinutes, slot.endMinutes)
            // Une durée lisible, pas un nombre de minutes : « 300 min libres »
            // est exact et ne dit rien à qui cherche « j'ai cinq heures ».
            const label = t('agenda.grid.freeSlot', {
              duration: durationLabel(slot.minutes, t('agenda.grid.hourSuffix')),
            })
            return (
              <button
                key={`${slot.start}-${slot.end}`}
                type="button"
                disabled={!onPickFreeSlot}
                onClick={() => onPickFreeSlot?.({ start: slot.start, end: slot.end, minutes: slot.minutes })}
                aria-label={label}
                className="group absolute inset-x-1 rounded-md border border-dashed border-[var(--bellum-border)] text-left transition-colors enabled:hover:border-[var(--bellum-primary-400)] enabled:hover:bg-[color-mix(in_srgb,var(--bellum-primary-400)_6%,transparent)]"
                style={{ top: `${top}%`, height: `${height}%` }}
              >
                <Text
                  size="xs"
                  className="flex items-center gap-1 px-2 py-1 text-[var(--bellum-text-muted)] group-enabled:group-hover:text-[var(--bellum-text-accent)]"
                >
                  {onPickFreeSlot ? <Plus className="size-3 shrink-0" /> : null}
                  <span className="truncate">{label}</span>
                </Text>
              </button>
            )
          })}

          {model.blocks.map(block => (
            <EventBlock
              key={block.event.id}
              block={drag.applyTo(block)}
              top={offsetPercent(model, drag.applyTo(block).startMinutes) ?? 0}
              height={heightPercent(model, drag.applyTo(block).startMinutes, drag.applyTo(block).endMinutes)}
              gridHeight={gridHeight}
              conflicting={conflictingIds?.has(block.event.id) ?? false}
              now={now}
              language={language}
              onOpen={onOpenEvent}
              onDragStart={onDragEnd ? drag.start : undefined}
              dragging={drag.activeId === block.event.id}
            />
          ))}

          {/* L'heure courante, par-dessus tout : c'est le seul repère qui bouge,
              et celui qu'on cherche en premier en ouvrant l'écran. */}
          {nowOffset !== null ? (
            <Box
              className="pointer-events-none absolute inset-x-0 z-10 flex items-center gap-1"
              style={{ top: `${nowOffset}%` }}
              aria-label={t('agenda.board.now')}
            >
              <Box className="size-1.5 rounded-full bg-[var(--bellum-danger)]" />
              <Box className="h-px flex-1 bg-[var(--bellum-danger)]" />
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Un rendez-vous sans date exploitable existe : le taire serait la seule
          façon de le rendre invisible pour de bon. */}
      {model.undated.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('agenda.board.undated', { count: model.undated.length })}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * Le geste de glisser-déposer, du bouton enfoncé au bouton relâché.
 *
 * Il vit dans un hook plutôt que dans le composant pour une raison précise : le
 * suivi de la souris se fait sur la FENÊTRE, pas sur le bloc. Un curseur qui
 * sort du rectangle pendant qu'on tire — ce qui arrive à chaque geste un peu
 * vif — perdrait sinon l'évènement et laisserait le rendez-vous accroché au
 * pointeur sans que rien ne le relâche.
 */
function useDrag(
  model: AgendaGridModel,
  gridHeight: number,
  onDragEnd?: (event: AgendaEvent, proposal: DragProposal) => void,
) {
  const [state, setState] = useState<{
    block: GridBlock
    mode: DragMode
    originY: number
    proposal: DragProposal
    /** La souris a-t-elle dépassé le seuil ? Tant que non, c'est un CLIC. */
    moved: boolean
  } | null>(null)

  const minutesPerPixel = gridHeight > 0 ? (model.toMinutes - model.fromMinutes) / gridHeight : 0

  useEffect(() => {
    if (!state) return
    const onMove = (mouseEvent: globalThis.MouseEvent) => {
      const pixels = mouseEvent.clientY - state.originY
      // SEUIL. Sans lui, un clic parfaitement immobile sur un rendez-vous de
      // 16 h 54 devenait un déplacement vers 17 h : l'aimantation au quart
      // d'heure suffisait à produire une proposition, et cliquer pour PRÉPARER
      // ouvrait une confirmation qui allait prévenir les invités. Vu en
      // production, les deux panneaux ouverts l'un sur l'autre.
      if (Math.abs(pixels) < DRAG_THRESHOLD_PX) return
      const delta = pixels * minutesPerPixel
      setState(current =>
        current
          ? { ...current, moved: true, proposal: proposeDrag(current.block, current.mode, delta, model) }
          : current,
      )
    }
    const onUp = () => {
      setState(current => {
        // Deux conditions, pas une : la souris doit avoir bougé pour de bon, ET
        // le résultat doit différer de l'original — on peut revenir à son point
        // de départ après avoir traversé la grille.
        if (current?.moved && !isNoopDrag(current.block, current.proposal)) {
          onDragEnd?.(current.block.event, current.proposal)
        }
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [state, minutesPerPixel, model, onDragEnd])

  return {
    activeId: state?.moved ? state.block.event.id : null,
    start: (block: GridBlock, mode: DragMode, clientY: number) => {
      setState({ block, mode, originY: clientY, proposal: { ...block }, moved: false })
    },
    /** Le bloc tel qu'il doit s'AFFICHER pendant le geste — l'aperçu suit le doigt. */
    applyTo: (block: GridBlock): GridBlock =>
      state?.moved && state.block.event.id === block.event.id ? { ...block, ...state.proposal } : block,
  }
}

/** Un clic sur « Rejoindre » n'est pas un clic sur le rendez-vous. */
const stopPropagation = (mouseEvent: MouseEvent) => mouseEvent.stopPropagation()

/** Un rendez-vous posé dans la grille, avec ses détails au survol. */
function EventBlock({
  block,
  top,
  height,
  gridHeight,
  conflicting,
  now,
  language,
  onOpen,
  onDragStart,
  dragging,
}: {
  block: GridBlock
  top: number
  height: number
  /** La hauteur de la grille en pixels, pour savoir si le bloc est COURT (#2926). */
  gridHeight: number
  conflicting: boolean
  now: Date
  language: string
  onOpen?: (event: AgendaEvent) => void
  onDragStart?: (block: GridBlock, mode: DragMode, clientY: number) => void
  dragging?: boolean
}) {
  const { t } = useTranslation('briefing')
  const { event } = block
  const timing = timingOf(event, now)
  const title = agendaEventTitle(event, { busy: t('agenda.grid.busy'), untitled: t('agenda.grid.untitled') })
  const persons = personAttendeesOf(event)
  const externals = persons.filter(attendee => attendee.external).length
  // Un créneau PROPOSÉ n'est pas un rendez-vous FIXÉ. Les deux autres états
  // qu'un évènement peut porter en pratique — confirmé, ou un statut
  // absent/non reconnu — ne réclament aucun geste : seul celui-ci est marqué,
  // sinon chaque bloc de la grille porterait une pastille et l'agenda
  // redeviendrait illisible.
  const proposed = isProposedAgendaEvent(event)
  // #2770 (#2101.19/.21/.22/.37) — un rendez-vous déjà FIXÉ dont seule
  // l'ORIGINE est distinguée, jamais confondu avec `proposed` ci-dessus.
  const createdByBellum = isBellumCreatedAgendaEvent(event)

  const tone = conflicting
    ? 'border-[var(--bellum-danger)] bg-[color-mix(in_srgb,var(--bellum-danger)_10%,var(--bellum-bg))]'
    : timing.phase === 'live'
      ? 'border-[var(--bellum-primary-400)] bg-[color-mix(in_srgb,var(--bellum-primary-400)_12%,var(--bellum-bg))]'
      : timing.phase === 'past'
        ? 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] opacity-60'
        : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]'

  // #2926 — court = l'heure et le titre sur une seule ligne, jamais empilés.
  const compact = (height / 100) * gridHeight < COMPACT_BELOW_PX

  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
  const startLabel = event.start ? time.format(new Date(event.start)) : ''

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // Désactivé SEULEMENT si le bloc ne sert à rien : un élément
          // `disabled` ne reçoit aucun évènement de souris, donc le lier au seul
          // `onOpen` rendait le glisser-déposer inerte sans rien casser
          // d'apparent — le curseur devenait bien une main, et il ne se passait
          // rien. Verrouillé par `AgendaGrid.test.tsx`.
          disabled={!onOpen && !onDragStart}
          onClick={() => onOpen?.(event)}
          // La largeur vient du groupe de chevauchement : deux rendez-vous
          // simultanés se partagent la place au lieu de se cacher l'un l'autre.
          style={{
            top: `${top}%`,
            height: `${height}%`,
            minHeight: MIN_BLOCK_HEIGHT_PX,
            left: `calc(${(block.column / block.columns) * 100}% + 4px)`,
            width: `calc(${(1 / block.columns) * 100}% - 8px)`,
          }}
          onMouseDown={mouseDown => {
            // Bouton gauche seulement : un clic droit ouvre le menu du
            // navigateur, et le rendez-vous resterait accroché au pointeur.
            if (!onDragStart || mouseDown.button !== 0) return
            onDragStart(block, 'move', mouseDown.clientY)
          }}
          data-compact={compact ? 'true' : 'false'}
          className={`absolute overflow-hidden rounded-md border px-2 ${compact ? 'py-0.5' : 'py-1'} text-left transition-colors enabled:hover:brightness-110 ${
            dragging ? 'z-20 shadow-lg ring-2 ring-[var(--bellum-primary-400)]' : ''
          } ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''} ${tone}`}
        >
          <Box className="flex items-center gap-1">
            <Text size="xs" weight="medium" className="shrink-0 text-[var(--bellum-text-secondary)]">
              {startLabel}
            </Text>
            {compact ? (
              <Text size="xs" weight="medium" className="min-w-0 truncate text-[var(--bellum-text-primary)]">
                {title}
              </Text>
            ) : null}
            {conflicting ? <AlertTriangle className="size-3 shrink-0 text-[var(--danger-soft-text)]" /> : null}
            {proposed ? (
              <CircleDashed
                className="size-3 shrink-0 text-[var(--warning-soft-text)]"
                aria-label={t('agenda.board.proposed')}
              />
            ) : null}
            {createdByBellum ? (
              <Sparkles
                className="size-3 shrink-0 text-[var(--bellum-text-accent)]"
                aria-label={t('agenda.board.createdByBellum')}
              />
            ) : null}
            {/* #2103.29 — appartient à une série récurrente (Google
                `recurringEventId` / Microsoft `seriesMasterId`). */}
            {event.recurring ? (
              <Repeat
                className="size-3 shrink-0 text-[var(--bellum-text-secondary)]"
                aria-label={t('agenda.board.recurring')}
              />
            ) : null}
          </Box>
          {/* La marge de droite réserve la place du bouton « Rejoindre », qui est
              posé hors du flux : sans elle, le titre passe DESSOUS et on lit
              « …parcours commandUeRejoindre ». */}
          {compact ? null : (
            <Text
              size="xs"
              weight="medium"
              className={`line-clamp-2 text-[var(--bellum-text-primary)] ${
                event.conferenceUrl && height >= JOIN_MIN_HEIGHT_PERCENT ? 'pr-24' : ''
              }`}
            >
              {title}
            </Text>
          )}
          {/* « Rejoindre » reste DANS le bloc. Le geste de 9 h 58 est de cliquer
              pour entrer : le remplacer par une icône de caméra obligerait à
              ouvrir le rendez-vous d'abord, pour un lien qu'on avait sous les
              yeux. Il est posé hors du flux pour ne pas pousser le titre, et
              n'apparaît qu'à partir d'une hauteur où il ne recouvre rien. */}
          {event.conferenceUrl && height >= JOIN_MIN_HEIGHT_PERCENT ? (
            <div className="absolute bottom-1 right-1" onClick={stopPropagation} onMouseDown={stopPropagation}>
              <JoinButton event={event} phase={timing.phase} />
            </div>
          ) : null}
          {/* La poignée d'étirement — une bande de six pixels au BORD BAS.
              Séparée du corps du bloc parce que les deux gestes se disputent la
              même surface : tirer le bas doit rallonger la réunion, pas la
              déplacer. Elle est absente des blocs courts, où elle couvrirait
              une part telle du bloc qu'on ne pourrait plus le déplacer. */}
          {onDragStart && height >= JOIN_MIN_HEIGHT_PERCENT ? (
            <div
              className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
              onMouseDown={(mouseDown: MouseEvent) => {
                mouseDown.stopPropagation()
                if (mouseDown.button !== 0) return
                onDragStart(block, 'resize-end', mouseDown.clientY)
              }}
            />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <Box className="flex flex-col gap-1">
          <Text size="sm" weight="semibold">
            {title}
          </Text>
          {/* Le créneau PROPOSÉ appelle une relance — c'est la seule des
              quatre valeurs qui demande un geste, et la tooltip le dit en
              toutes lettres là où le bloc ne peut porter qu'une icône. */}
          {proposed ? (
            <Text size="xs" className="text-[var(--warning-soft-text)]">
              {t('agenda.board.proposedHint')}
            </Text>
          ) : null}
          {/* La durée prêtée à une fin inconnue est DITE : sans cela, le bloc
              affirme une demi-heure que personne n'a saisie. */}
          {block.durationUnknown ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('agenda.grid.unknownDuration')}
            </Text>
          ) : null}
          {event.location ? (
            <Text size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </Text>
          ) : null}
          {persons.length > 0 ? (
            <Text size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
              <Users className="size-3 shrink-0" />
              {t('agenda.grid.attendees', { count: persons.length })}
              {externals > 0 ? ` · ${t('agenda.board.externalGuests', { count: externals })}` : ''}
            </Text>
          ) : null}
          {/* #2390.9 — une salle réservée n'est jamais un invité : elle
              s'affiche à part. Pas de salle, aucune ligne. */}
          <RoomLines event={event} />
          <AgendaKindLine event={event} />
        </Box>
      </TooltipContent>
    </Tooltip>
  )
}
