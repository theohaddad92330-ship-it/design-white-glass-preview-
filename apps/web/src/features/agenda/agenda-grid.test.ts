import type { AgendaEvent, FreeSlot } from '@bellum/contracts'
import { buildAgendaGrid, heightPercent, offsetPercent } from './agenda-grid'

/** Un rendez-vous du 18 août, aux heures LOCALES données. */
function event(id: string, start: string | null, end: string | null): AgendaEvent {
  return {
    id,
    summary: id,
    description: null,
    location: null,
    start,
    end,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: null,
    isExternal: false,
    cancelled: false,
  }
}

/** Une heure locale du 18 août, écrite avec son décalage explicite. */
function at(hour: number, minute = 0): string {
  const d = new Date(2026, 7, 18, hour, minute)
  return d.toISOString()
}

describe('buildAgendaGrid', () => {
  it('place un rendez-vous à son heure et lui donne la hauteur de sa durée', () => {
    const model = buildAgendaGrid([event('a', at(9), at(10))])
    const [block] = model.blocks
    expect(block?.startMinutes).toBe(9 * 60)
    expect(block?.endMinutes).toBe(10 * 60)
    // La fenêtre par défaut couvre 8 h → 20 h, soit 720 minutes : une heure y
    // occupe exactement un douzième.
    expect(heightPercent(model, block!.startMinutes, block!.endMinutes)).toBeCloseTo(100 / 12, 5)
  })

  it('donne DEUX fois plus de hauteur à une réunion deux fois plus longue', () => {
    // C'est toute la raison d'être de la grille : sur une liste, ces deux
    // rendez-vous ont la même taille.
    const model = buildAgendaGrid([event('court', at(9), at(9, 30)), event('long', at(14), at(15))])
    const [court, long] = model.blocks
    const hCourt = heightPercent(model, court!.startMinutes, court!.endMinutes)
    const hLong = heightPercent(model, long!.startMinutes, long!.endMinutes)
    expect(hLong / hCourt).toBeCloseTo(2, 5)
  })

  describe('les chevauchements', () => {
    it('mettent deux rendez-vous côte à côte plutôt que l’un sur l’autre', () => {
      const model = buildAgendaGrid([event('a', at(14), at(15)), event('b', at(14, 30), at(15, 30))])
      expect(model.blocks.map(b => b.column)).toEqual([0, 1])
      expect(model.blocks.every(b => b.columns === 2)).toBe(true)
    })

    it('font partager la largeur à TOUT un groupe lié de proche en proche', () => {
      // A chevauche B, B chevauche C, mais A et C ne se touchent pas. Les
      // traiter par paires poserait A et C dans la même colonne : C disparaît
      // derrière A pour qui regarde vite.
      const model = buildAgendaGrid([
        event('a', at(9), at(10)),
        event('b', at(9, 45), at(10, 45)),
        event('c', at(10, 30), at(11, 30)),
      ])
      expect(model.blocks.every(b => b.columns === 2)).toBe(true)
      expect(model.blocks.map(b => b.column)).toEqual([0, 1, 0])
    })

    it('rendent sa pleine largeur à un rendez-vous isolé', () => {
      const model = buildAgendaGrid([event('a', at(9), at(10)), event('b', at(14), at(15))])
      expect(model.blocks.every(b => b.columns === 1)).toBe(true)
    })
  })

  describe('la fenêtre affichée', () => {
    it('couvre la journée ouvrée quand tout y tient', () => {
      const model = buildAgendaGrid([event('a', at(9), at(10))])
      expect(model.fromMinutes).toBe(8 * 60)
      expect(model.toMinutes).toBe(20 * 60)
    })

    it('S’ÉTEND pour un rendez-vous hors plage plutôt que de le masquer', () => {
      // Une fenêtre fixe ferait disparaître le petit-déjeuner de 7 h. Un agenda
      // dont un rendez-vous n'apparaît pas est pire qu'une liste.
      const model = buildAgendaGrid([event('tôt', at(7), at(8)), event('tard', at(20, 30), at(21, 30))])
      expect(model.fromMinutes).toBe(7 * 60)
      expect(model.toMinutes).toBe(22 * 60)
      expect(offsetPercent(model, 7 * 60)).toBe(0)
    })

    it('gradue toutes les heures pleines, bornes comprises', () => {
      const model = buildAgendaGrid([])
      expect(model.hours[0]).toBe(8 * 60)
      expect(model.hours[model.hours.length - 1]).toBe(20 * 60)
      expect(model.hours).toHaveLength(13)
    })
  })

  describe('ce qui n’a pas d’heure', () => {
    it('sort les « journée entière » de la grille au lieu de les étirer', () => {
      const model = buildAgendaGrid([event('salon', '2026-08-18', '2026-08-19')])
      expect(model.allDay).toHaveLength(1)
      expect(model.blocks).toHaveLength(0)
    })

    it('garde un rendez-vous sans date exploitable au lieu de le jeter', () => {
      // Le jeter serait la seule façon de le rendre invisible pour de bon.
      const model = buildAgendaGrid([event('orphelin', null, null)])
      expect(model.undated).toHaveLength(1)
      expect(model.blocks).toHaveLength(0)
    })

    it('prête une durée à une fin inconnue, et le DIT', () => {
      const model = buildAgendaGrid([event('sans fin', at(9), null)])
      const [block] = model.blocks
      expect(block?.durationUnknown).toBe(true)
      expect(block?.endMinutes).toBe(9 * 60 + 30)
    })

    it('traite une fin AVANT le début comme une durée inconnue', () => {
      // Un horodatage abîmé donnerait sinon une hauteur négative, c'est-à-dire
      // un bloc qui remonte dans la grille.
      const model = buildAgendaGrid([event('cassé', at(15), at(14))])
      expect(model.blocks[0]?.durationUnknown).toBe(true)
      expect(model.blocks[0]!.endMinutes).toBeGreaterThan(model.blocks[0]!.startMinutes)
    })
  })

  describe('les plages libres', () => {
    it('sont placées comme les rendez-vous', () => {
      const free: FreeSlot[] = [{ start: at(11), end: at(13), minutes: 120 }]
      const model = buildAgendaGrid([], free)
      expect(model.free[0]?.startMinutes).toBe(11 * 60)
      expect(model.free[0]?.minutes).toBe(120)
    })

    it('FUSIONNENT les tranches contiguës en un seul trou', () => {
      // Le serveur rend tous les créneaux d'au moins N minutes, donc une suite
      // de tranches glissantes. Affichées telles quelles, elles transformaient
      // un après-midi vide en onze lignes « 30 min libres » empilées — du bruit
      // là où il fallait lire « l'après-midi est libre ».
      const free: FreeSlot[] = [
        { start: at(11), end: at(11, 30), minutes: 30 },
        { start: at(11, 30), end: at(12), minutes: 30 },
        { start: at(12), end: at(13), minutes: 60 },
      ]
      const model = buildAgendaGrid([], free)
      expect(model.free).toHaveLength(1)
      expect(model.free[0]?.startMinutes).toBe(11 * 60)
      expect(model.free[0]?.endMinutes).toBe(13 * 60)
      // La durée affichée est celle du trou RÉEL, pas celle d'une tranche.
      expect(model.free[0]?.minutes).toBe(120)
    })

    it('gardent deux trous séparés par un rendez-vous', () => {
      // Le garde ne doit pas tout coller : un créneau à cheval sur une réunion
      // se proposerait pendant celle-ci.
      const free: FreeSlot[] = [
        { start: at(9), end: at(10), minutes: 60 },
        { start: at(14), end: at(15), minutes: 60 },
      ]
      expect(buildAgendaGrid([], free).free).toHaveLength(2)
    })

    it('ignorent une plage vide ou inversée plutôt que d’afficher un trait', () => {
      const free: FreeSlot[] = [{ start: at(11), end: at(11), minutes: 0 }]
      expect(buildAgendaGrid([], free).free).toHaveLength(0)
    })
  })

  describe('les bornes de position', () => {
    it('rendent null pour un instant hors fenêtre', () => {
      const model = buildAgendaGrid([event('a', at(9), at(10))])
      // La ligne « maintenant » ne doit pas se dessiner à 6 h du matin en
      // haut de la grille : hors fenêtre, elle ne se dessine pas du tout.
      expect(offsetPercent(model, 6 * 60)).toBeNull()
      expect(offsetPercent(model, 23 * 60)).toBeNull()
    })

    it('coupent une plage qui déborde au lieu de dépasser du cadre', () => {
      const model = buildAgendaGrid([event('a', at(9), at(10))])
      expect(heightPercent(model, 19 * 60, 23 * 60)).toBeCloseTo(100 / 12, 5)
    })
  })
})
