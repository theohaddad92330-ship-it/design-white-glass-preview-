import type { AgendaEvent, FreeSlot } from '@bellum/contracts'
import { isAllDay } from './agenda-view'

/**
 * Le modèle d'une GRILLE horaire — la vue où le temps se voit au lieu de se lire.
 *
 * Une liste de rendez-vous donne à une réunion de quinze minutes et à un
 * séminaire de trois heures exactement la même taille, et ne montre pas du tout
 * les trous. C'est le reproche fait au brief en bêta : « ça devrait ressembler
 * beaucoup plus à un agenda ». Un agenda, c'est une hauteur proportionnelle à
 * la durée — le reste en découle.
 *
 * Tout le calcul est ICI, pur et testé, parce qu'une erreur de placement ne se
 * voit pas : un rendez-vous mal positionné reste un joli rectangle. Le
 * composant ne fait que poser des pourcentages.
 */

/** Fenêtre d'affichage par défaut — la journée ouvrée. */
const DEFAULT_FROM_MINUTES = 8 * 60
const DEFAULT_TO_MINUTES = 20 * 60

/**
 * Durée prêtée à un rendez-vous dont la fin est inconnue.
 *
 * On ne l'invente pas : le bloc est marqué {@link GridBlock.durationUnknown} et
 * la vue le dit. Mais il lui faut bien une hauteur, sinon il n'existe pas à
 * l'écran — et un rendez-vous invisible est pire qu'un rendez-vous approximatif.
 */
const UNKNOWN_DURATION_MINUTES = 30

export type GridBlock = {
  event: AgendaEvent
  /** Minutes depuis minuit, dans le fuseau de l'utilisateur. */
  startMinutes: number
  endMinutes: number
  /** Colonne occupée dans son groupe de chevauchement (0 = la plus à gauche). */
  column: number
  /** Nombre de colonnes du groupe — la largeur du bloc en découle. */
  columns: number
  /** La fin n'était pas connue : la hauteur est une convention, pas une donnée. */
  durationUnknown: boolean
}

type GridFreeSlot = { startMinutes: number; endMinutes: number; minutes: number; start: string; end: string }

export type AgendaGridModel = {
  fromMinutes: number
  toMinutes: number
  /** Les heures pleines à graduer, bornes comprises. */
  hours: number[]
  blocks: GridBlock[]
  free: GridFreeSlot[]
  /** Les évènements « journée entière » : hors grille, en bandeau. */
  allDay: AgendaEvent[]
  /** Ceux dont la date n'est pas exploitable — jamais jetés, jamais placés. */
  undated: AgendaEvent[]
}

/** Minutes depuis minuit LOCAL, ou `null` si l'horodatage n'est pas exploitable. */
function minutesOfDay(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const date = new Date(ms)
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Assigne une colonne à chaque bloc d'un groupe qui se chevauche.
 *
 * Un groupe est un ensemble d'évènements liés de proche en proche : A chevauche
 * B, B chevauche C, donc les trois partagent la largeur — même si A et C ne se
 * touchent pas. Les traiter par paires donnerait deux blocs superposés au même
 * endroit, ce qui masque un rendez-vous derrière un autre.
 */
function assignColumns(blocks: GridBlock[]): void {
  let group: GridBlock[] = []
  let groupEnd = -1

  const closeGroup = () => {
    if (group.length === 0) return
    // Chaque bloc prend la première colonne libre à son heure de début.
    const columnEnds: number[] = []
    for (const block of group) {
      let column = columnEnds.findIndex(end => end <= block.startMinutes)
      if (column === -1) {
        column = columnEnds.length
        columnEnds.push(block.endMinutes)
      } else {
        columnEnds[column] = block.endMinutes
      }
      block.column = column
    }
    for (const block of group) block.columns = columnEnds.length
    group = []
    groupEnd = -1
  }

  for (const block of blocks) {
    if (group.length > 0 && block.startMinutes >= groupEnd) closeGroup()
    group.push(block)
    groupEnd = Math.max(groupEnd, block.endMinutes)
  }
  closeGroup()
}

/**
 * Fusionne les plages libres qui se touchent ou se chevauchent.
 *
 * Les bornes ISO conservées sont celles des EXTRÊMES — début de la première,
 * fin de la dernière — pour qu'un clic sur la plage fusionnée propose bien le
 * trou entier et non sa première tranche.
 */
function mergeFreeSlots(slots: GridFreeSlot[]): GridFreeSlot[] {
  const sorted = [...slots].sort((a, b) => a.startMinutes - b.startMinutes)
  const merged: GridFreeSlot[] = []
  for (const slot of sorted) {
    const last = merged[merged.length - 1]
    if (last && slot.startMinutes <= last.endMinutes) {
      if (slot.endMinutes > last.endMinutes) {
        last.endMinutes = slot.endMinutes
        last.end = slot.end
      }
      last.minutes = last.endMinutes - last.startMinutes
      continue
    }
    merged.push({ ...slot, minutes: slot.endMinutes - slot.startMinutes })
  }
  return merged
}

/**
 * Construit la grille d'une journée.
 *
 * La fenêtre s'ÉTEND au contenu : le défaut couvre la journée ouvrée, mais un
 * rendez-vous à 7 h ou un dîner client à 21 h repousse la borne. Une fenêtre
 * fixe ferait disparaître le rendez-vous hors plage — et un agenda dont un
 * rendez-vous n'apparaît pas est pire qu'une liste.
 */
export function buildAgendaGrid(events: AgendaEvent[], freeSlots: FreeSlot[] = []): AgendaGridModel {
  const allDay: AgendaEvent[] = []
  const undated: AgendaEvent[] = []
  const blocks: GridBlock[] = []

  for (const event of events) {
    if (isAllDay(event)) {
      allDay.push(event)
      continue
    }
    const start = minutesOfDay(event.start)
    if (start === null) {
      undated.push(event)
      continue
    }
    const rawEnd = minutesOfDay(event.end)
    // Une fin AVANT le début (rendez-vous qui passe minuit, horodatage abîmé)
    // n'est pas une durée négative : on retombe sur la convention.
    const durationUnknown = rawEnd === null || rawEnd <= start
    const end = durationUnknown ? start + UNKNOWN_DURATION_MINUTES : rawEnd
    blocks.push({ event, startMinutes: start, endMinutes: end, column: 0, columns: 1, durationUnknown })
  }

  blocks.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes)
  assignColumns(blocks)

  // Les plages libres arrivent DÉCOUPÉES : le serveur rend tous les créneaux
  // d'au moins N minutes, ce qui donne une suite de tranches glissantes qui se
  // chevauchent. Utile pour proposer un horaire, illisible sur une grille — un
  // après-midi vide devenait onze lignes « 30 min libres » empilées, c'est-à-dire
  // du bruit là où il fallait lire « l'après-midi est libre ».
  //
  // On les fusionne donc pour l'affichage. La durée affichée redevient celle du
  // trou réel, et le clic porte sur toute la plage.
  const free = mergeFreeSlots(
    freeSlots.flatMap(slot => {
      const start = minutesOfDay(slot.start)
      const end = minutesOfDay(slot.end)
      if (start === null || end === null || end <= start) return []
      return [{ startMinutes: start, endMinutes: end, minutes: slot.minutes, start: slot.start, end: slot.end }]
    }),
  )

  const bounds = [
    ...blocks.flatMap(b => [b.startMinutes, b.endMinutes]),
    ...free.flatMap(s => [s.startMinutes, s.endMinutes]),
  ]
  const fromMinutes = Math.floor(Math.min(DEFAULT_FROM_MINUTES, ...bounds) / 60) * 60
  const toMinutes = Math.ceil(Math.max(DEFAULT_TO_MINUTES, ...bounds) / 60) * 60

  const hours: number[] = []
  for (let hour = fromMinutes; hour <= toMinutes; hour += 60) hours.push(hour)

  return { fromMinutes, toMinutes, hours, blocks, free, allDay, undated }
}

/** Position verticale d'un instant dans la fenêtre, en pourcentage. `null` hors fenêtre. */
export function offsetPercent(model: AgendaGridModel, minutes: number): number | null {
  const span = model.toMinutes - model.fromMinutes
  if (span <= 0) return null
  if (minutes < model.fromMinutes || minutes > model.toMinutes) return null
  return ((minutes - model.fromMinutes) / span) * 100
}

/** Hauteur d'une plage dans la fenêtre, en pourcentage. */
export function heightPercent(model: AgendaGridModel, startMinutes: number, endMinutes: number): number {
  const span = model.toMinutes - model.fromMinutes
  if (span <= 0) return 0
  const clampedStart = Math.max(startMinutes, model.fromMinutes)
  const clampedEnd = Math.min(endMinutes, model.toMinutes)
  return Math.max(0, ((clampedEnd - clampedStart) / span) * 100)
}
