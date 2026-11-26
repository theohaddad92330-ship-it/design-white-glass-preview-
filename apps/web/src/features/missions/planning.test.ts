import { describe, expect, it } from 'vitest'
import {
  declaredAvailability,
  PLANNING_WINDOW_MONTHS,
  monthOf,
  placeMission,
  planningWindow,
  shiftMonth,
  sortPlacements,
  summarizePlanning,
  todayOffsetPercent,
  matchesPlanningFacet,
  availabilityFrom,
  availabilityBucket,
  consultantsAvailableSoon,
  isWithinDaysFromToday,
  SOON_WINDOW_DAYS,
  PLANNING_FACETS,
  pixelsToDayDelta,
  shiftDateByDays,
  canDragMission,
  isoDay,
  dragBlockReason,
  type PlanningFacet,
  type PlannedMission,
} from './planning'

function mission(over: Partial<PlannedMission> = {}): PlannedMission {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    startedOn: '2026-07-10',
    endsOn: '2026-09-20',
    ...over,
  }
}

const WINDOW = planningWindow('2026-07', 4) // juillet → octobre 2026

describe('planningWindow', () => {
  it('borne la fenêtre au premier et au dernier jour des mois demandés', () => {
    expect(WINDOW.startsOn).toBe('2026-07-01')
    expect(WINDOW.endsOn).toBe('2026-10-31')
    expect(WINDOW.months.map(m => m.key)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
  })

  it('donne à chaque mois la largeur de SES jours, pas un quart de la fenêtre', () => {
    // 31 + 31 + 30 + 31 = 123 jours. Une largeur égale décalerait chaque entête
    // de plusieurs jours par rapport aux barres, qui se placent au jour près.
    const total = 31 + 31 + 30 + 31
    expect(WINDOW.totalDays).toBe(total)
    expect(WINDOW.months[0]?.widthPercent).toBeCloseTo((31 / total) * 100, 6)
    expect(WINDOW.months[2]?.widthPercent).toBeCloseTo((30 / total) * 100, 6)
    // Les largeurs couvrent exactement la fenêtre — sinon la dernière colonne
    // déborde ou laisse un blanc.
    const sum = WINDOW.months.reduce((acc, m) => acc + m.widthPercent, 0)
    expect(sum).toBeCloseTo(100, 6)
  })

  it('traverse février bissextile sans perdre un jour', () => {
    const leap = planningWindow('2028-02', 1)
    expect(leap.endsOn).toBe('2028-02-29')
    expect(leap.totalDays).toBe(29)
  })

  it('refuse un mois illisible plutôt que de retomber sur aujourd’hui', () => {
    expect(() => planningWindow('2026-13', 2)).toThrow()
    expect(() => planningWindow('juillet', 2)).toThrow()
  })

  it('expose une fenêtre par défaut de quatre mois', () => {
    expect(PLANNING_WINDOW_MONTHS).toBe(4)
    expect(planningWindow('2026-07').months).toHaveLength(4)
  })
})

describe('shiftMonth / monthOf', () => {
  it('avance et recule en passant les fins d’année', () => {
    expect(shiftMonth('2026-11', 3)).toBe('2027-02')
    expect(shiftMonth('2026-02', -3)).toBe('2025-11')
    expect(shiftMonth('2026-07', 0)).toBe('2026-07')
  })

  it('lit le mois d’une date, en heure locale du lecteur', () => {
    expect(monthOf(new Date(2026, 7, 29, 23, 30))).toBe('2026-08')
  })
})

/**
 * #2408.60 — exportée hors de `PlanningPage.tsx` (où elle vivait, non
 * testée directement) pour que `filters.ts` lise la MÊME horloge : deux
 * implémentations de « aujourd'hui » auraient divergé à minuit.
 */
describe('isoDay', () => {
  it('lit le jour d’une date, en heure locale du lecteur, avec le zéro qui manque', () => {
    expect(isoDay(new Date(2026, 7, 9, 23, 30))).toBe('2026-08-09')
    expect(isoDay(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01')
  })
})

describe('placeMission', () => {
  it('place une mission entièrement contenue dans la fenêtre', () => {
    const placed = placeMission(mission(), WINDOW)
    expect(placed.kind).toBe('bar')
    if (placed.kind !== 'bar') return
    // Du 10 juillet (index 9) au 20 septembre inclus.
    expect(placed.leftPercent).toBeCloseTo((9 / 123) * 100, 6)
    expect(placed.widthPercent).toBeCloseTo((73 / 123) * 100, 6)
    expect(placed.openStart).toBe(false)
    expect(placed.openEnd).toBe(false)
    expect(placed.clippedStart).toBe(false)
    expect(placed.clippedEnd).toBe(false)
  })

  it('rogne une mission commencée avant la fenêtre sans la faire commencer au 1er juillet', () => {
    const placed = placeMission(mission({ startedOn: '2026-05-02' }), WINDOW)
    if (placed.kind !== 'bar') throw new Error('attendu : une barre')
    expect(placed.leftPercent).toBe(0)
    // `clippedStart` est ce qui empêche l'écran de raconter un démarrage au
    // premier jour de la fenêtre : la barre COMMENCE avant, et elle le dit.
    expect(placed.clippedStart).toBe(true)
    expect(placed.openStart).toBe(false)
  })

  it('rogne une mission qui finit après la fenêtre', () => {
    const placed = placeMission(mission({ endsOn: '2027-03-31' }), WINDOW)
    if (placed.kind !== 'bar') throw new Error('attendu : une barre')
    expect(placed.leftPercent + placed.widthPercent).toBeCloseTo(100, 6)
    expect(placed.clippedEnd).toBe(true)
    expect(placed.openEnd).toBe(false)
  })

  it('ne fait JAMAIS finir une mission sans date de fin au bord de la fenêtre', () => {
    // Le cœur du lot. Une fin absente n'est pas une fin au 31 octobre : la
    // barre court jusqu'au bord, et `openEnd` dit que ce bord n'est pas une
    // fin. Sans lui, l'écran promettrait une disponibilité que personne n'a
    // annoncée — exactement ce que `deriveStaffing` refuse déjà de conclure.
    const placed = placeMission(mission({ endsOn: null }), WINDOW)
    if (placed.kind !== 'bar') throw new Error('attendu : une barre')
    expect(placed.openEnd).toBe(true)
    expect(placed.clippedEnd).toBe(false)
    expect(placed.leftPercent + placed.widthPercent).toBeCloseTo(100, 6)
  })

  it('ne fait JAMAIS commencer une mission sans date de début au bord de la fenêtre', () => {
    const placed = placeMission(mission({ startedOn: null }), WINDOW)
    if (placed.kind !== 'bar') throw new Error('attendu : une barre')
    expect(placed.openStart).toBe(true)
    expect(placed.clippedStart).toBe(false)
    expect(placed.leftPercent).toBe(0)
  })

  it('range hors fenêtre ce qui ne la touche pas, plutôt que de le coller au bord', () => {
    expect(placeMission(mission({ startedOn: '2025-01-05', endsOn: '2025-03-04' }), WINDOW).kind).toBe('outside')
    expect(placeMission(mission({ startedOn: '2027-01-05', endsOn: '2027-03-04' }), WINDOW).kind).toBe('outside')
  })

  it('garde une mission sans AUCUNE date hors du dessin, et la nomme', () => {
    const placed = placeMission(mission({ startedOn: null, endsOn: null }), WINDOW)
    expect(placed.kind).toBe('undated')
  })

  it('traite une date illisible comme une date absente, jamais comme le 1er janvier 1970', () => {
    const placed = placeMission(mission({ startedOn: '2026-02-31', endsOn: null }), WINDOW)
    // Le 31 février n'existe pas : `new Date` le roulerait au 3 mars et la
    // barre partirait d'un jour que personne n'a saisi.
    expect(placed.kind).toBe('undated')
  })

  it('accepte une date portant une heure, comme les colonnes horodatées', () => {
    const placed = placeMission(mission({ startedOn: '2026-07-10T00:00:00.000Z' }), WINDOW)
    if (placed.kind !== 'bar') throw new Error('attendu : une barre')
    expect(placed.leftPercent).toBeCloseTo((9 / 123) * 100, 6)
  })

  it('donne une largeur non nulle à une mission d’un seul jour', () => {
    const placed = placeMission(mission({ startedOn: '2026-08-03', endsOn: '2026-08-03' }), WINDOW)
    if (placed.kind !== 'bar') throw new Error('attendu : une barre')
    expect(placed.widthPercent).toBeCloseTo((1 / 123) * 100, 6)
    expect(placed.widthPercent).toBeGreaterThan(0)
  })

  it('refuse de dessiner une mission qui finit avant de commencer', () => {
    // Une saisie incohérente ne se rattrape pas par une barre de largeur
    // négative, qui se rendrait à l'envers ou pas du tout, sans rien dire.
    const placed = placeMission(mission({ startedOn: '2026-09-20', endsOn: '2026-07-10' }), WINDOW)
    expect(placed.kind).toBe('inconsistent')
  })
})

describe('todayOffsetPercent', () => {
  it('place le repère au jour près', () => {
    expect(todayOffsetPercent(WINDOW, '2026-07-01')).toBeCloseTo(0, 6)
    expect(todayOffsetPercent(WINDOW, '2026-08-01')).toBeCloseTo((31 / 123) * 100, 6)
  })

  it('rend `null` — et jamais 0 — quand aujourd’hui n’est pas dans la fenêtre', () => {
    // 0 est le BORD GAUCHE : rendre 0 tracerait « nous sommes ici » au 1er
    // juillet en plein mois de décembre. C'est le zéro qui ment, appliqué à
    // une position.
    expect(todayOffsetPercent(WINDOW, '2026-12-25')).toBeNull()
    expect(todayOffsetPercent(WINDOW, '2026-06-30')).toBeNull()
    expect(todayOffsetPercent(WINDOW, 'pas-une-date')).toBeNull()
  })
})

describe('summarizePlanning', () => {
  const rows = [
    mission({ id: 'a', startedOn: '2026-07-10', endsOn: '2026-09-20' }), // démarre ET finit dedans
    mission({ id: 'b', startedOn: '2026-05-02', endsOn: null }), // court, sans fin connue
    mission({ id: 'c', startedOn: '2026-08-15', endsOn: '2027-06-30' }), // démarre dedans, finit après
    mission({ id: 'd', startedOn: null, endsOn: null }), // sans date
    mission({ id: 'e', startedOn: '2024-01-01', endsOn: '2024-02-01' }), // hors fenêtre
  ]

  it('compte séparément ce qui démarre, ce qui finit et ce qui n’a pas de fin', () => {
    const summary = summarizePlanning(rows, WINDOW)
    expect(summary.visible).toBe(3)
    expect(summary.startsInWindow).toBe(2)
    expect(summary.endsInWindow).toBe(1)
    expect(summary.openEnded).toBe(1)
    expect(summary.undated).toBe(1)
    expect(summary.outside).toBe(1)
  })

  it('ne compte JAMAIS une mission sans fin dans « finit dans la fenêtre »', () => {
    // C'est la même erreur que `COALESCE` sur une somme : l'absence deviendrait
    // une échéance, et le renouvellement serait annoncé pour un mois où rien
    // n'a été promis.
    const summary = summarizePlanning([mission({ startedOn: '2026-07-01', endsOn: null })], WINDOW)
    expect(summary.endsInWindow).toBe(0)
    expect(summary.openEnded).toBe(1)
  })

  it('ne compte pas dans « démarre dans la fenêtre » une mission déjà commencée avant', () => {
    const summary = summarizePlanning([mission({ startedOn: '2026-05-02', endsOn: '2026-08-02' })], WINDOW)
    expect(summary.startsInWindow).toBe(0)
    expect(summary.endsInWindow).toBe(1)
  })

  it('range une saisie incohérente à part, sans la compter comme visible', () => {
    const summary = summarizePlanning([mission({ startedOn: '2026-09-20', endsOn: '2026-07-10' })], WINDOW)
    expect(summary.visible).toBe(0)
    expect(summary.inconsistent).toBe(1)
  })

  it('sur une liste vide, tout vaut zéro — et ce zéro-là est VRAI', () => {
    const summary = summarizePlanning([], WINDOW)
    expect(summary).toEqual({
      visible: 0,
      startsInWindow: 0,
      endsInWindow: 0,
      openEnded: 0,
      undated: 0,
      outside: 0,
      inconsistent: 0,
    })
  })
})

describe('sortPlacements', () => {
  it('lit la fenêtre de gauche à droite, à égalité par libellé', () => {
    const rows = [
      { id: 'c', label: 'Zeta', placement: placeMission(mission({ startedOn: '2026-09-01' }), WINDOW) },
      { id: 'a', label: 'Alpha', placement: placeMission(mission({ startedOn: '2026-07-05' }), WINDOW) },
      { id: 'b', label: 'Beta', placement: placeMission(mission({ startedOn: '2026-07-05' }), WINDOW) },
    ]
    expect(sortPlacements(rows).map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('ne réordonne pas les lignes qu’on ne peut pas placer', () => {
    const rows = [
      { id: 'u', label: 'Sans date', placement: placeMission(mission({ startedOn: null, endsOn: null }), WINDOW) },
      { id: 'a', label: 'Alpha', placement: placeMission(mission({ startedOn: '2026-07-05' }), WINDOW) },
    ]
    // Les non-plaçables sortent du tri : elles vivent dans leur propre bloc,
    // nommé, et non en haut d'une frise où leur position dirait une date.
    expect(sortPlacements(rows).map(r => r.id)).toEqual(['a'])
  })
})

/**
 * LES POPULATIONS DE LA FRISE, ET LEURS PRÉDICATS — #1370, #1374.
 *
 * `summarizePlanning` comptait déjà ces trois populations ; les pastilles
 * doivent RETENIR exactement ce qu'elles annoncent. Un compteur et un filtre
 * écrits séparément divergent au premier seuil changé (GA-26) — ces tests
 * vérifient qu'ils sont d'accord, mission par mission.
 */
describe('matchesPlanningFacet (#1370, #1374)', () => {
  it('« démarrages » retient les missions dont le DÉBUT tombe dans la fenêtre', () => {
    const inside = mission({ startedOn: '2026-08-03', endsOn: '2026-09-20' })
    const before = mission({ startedOn: '2026-05-03', endsOn: '2026-09-20' })
    expect(matchesPlanningFacet(inside, 'starts', WINDOW)).toBe(true)
    // Une mission déjà commencée ne DÉMARRE pas dans la fenêtre, elle continue.
    expect(matchesPlanningFacet(before, 'starts', WINDOW)).toBe(false)
  })

  it('« échéances » ne retient JAMAIS une mission sans date de fin', () => {
    const ends = mission({ startedOn: '2026-07-01', endsOn: '2026-09-20' })
    const open = mission({ startedOn: '2026-07-01', endsOn: null })
    expect(matchesPlanningFacet(ends, 'ends', WINDOW)).toBe(true)
    // Le bord droit d'une barre ouverte touche le bout de la fenêtre : le
    // compter comme une échéance annoncerait un renouvellement que personne
    // n'a promis.
    expect(matchesPlanningFacet(open, 'ends', WINDOW)).toBe(false)
  })

  it('« sans date de fin » retient la barre ouverte à droite, et elle seule', () => {
    const open = mission({ startedOn: '2026-07-01', endsOn: null })
    const dated = mission({ startedOn: '2026-07-01', endsOn: '2026-09-20' })
    expect(matchesPlanningFacet(open, 'openEnded', WINDOW)).toBe(true)
    expect(matchesPlanningFacet(dated, 'openEnded', WINDOW)).toBe(false)
  })

  it('une mission NON DESSINÉE ne tombe dans aucune facette', () => {
    // Sans date : elle vit dans son bloc nommé, pas dans la frise. La retenir
    // ferait cliquer une pastille pour n'afficher aucune ligne.
    const undated = mission({ startedOn: null, endsOn: null })
    const outside = mission({ startedOn: '2020-01-01', endsOn: '2020-03-01' })
    for (const facet of PLANNING_FACETS) {
      expect(matchesPlanningFacet(undated, facet, WINDOW)).toBe(false)
      expect(matchesPlanningFacet(outside, facet, WINDOW)).toBe(false)
    }
  })

  it('compte exactement ce que la synthèse annonce — le filtre et le compteur sont le MÊME calcul', () => {
    const missions = [
      mission({ id: 'a', startedOn: '2026-08-03', endsOn: '2026-09-20' }),
      mission({ id: 'b', startedOn: '2026-05-03', endsOn: null }),
      mission({ id: 'c', startedOn: '2026-09-01', endsOn: null }),
      mission({ id: 'd', startedOn: null, endsOn: null }),
    ]
    const summary = summarizePlanning(missions, WINDOW)
    const counted = (facet: PlanningFacet) => missions.filter(m => matchesPlanningFacet(m, facet, WINDOW)).length
    expect(counted('starts')).toBe(summary.startsInWindow)
    expect(counted('ends')).toBe(summary.endsInWindow)
    expect(counted('openEnded')).toBe(summary.openEnded)
  })
})

/**
 * QUAND LA PERSONNE SE LIBÈRE — #1373.
 *
 * La promesse de l'écran. Elle se DÉRIVE de `ends_on`, et de rien d'autre :
 * sans date de fin, on ne l'estime pas.
 */
describe('availabilityFrom (#1373)', () => {
  const today = '2026-09-04'

  it('sans date de fin lisible, elle ne dit RIEN — jamais une estimation', () => {
    expect(availabilityFrom(null, today)).toEqual({ kind: 'unknown' })
    expect(availabilityFrom('', today)).toEqual({ kind: 'unknown' })
    // Une date illisible vaut une absence, jamais 1970 ni le 3 mars.
    expect(availabilityFrom('2026-02-31', today)).toEqual({ kind: 'unknown' })
    expect(availabilityFrom('pas une date', today)).toEqual({ kind: 'unknown' })
  })

  it('une fin à venir rend le LENDEMAIN — `ends_on` est le dernier jour travaillé', () => {
    // La frise compte `ends_on` comme un jour OCCUPÉ (`+ 1` sur la largeur) :
    // annoncer la disponibilité le jour même contredirait la barre juste à côté.
    // #2410.60 — fin CONFIRMÉE par le client : la disponibilité est certaine.
    expect(availabilityFrom('2026-10-01', today, 'fin_confirmee')).toEqual({
      kind: 'from',
      on: '2026-10-02',
      certainty: 'certaine',
    })
  })

  it('passe les fins de mois et les fins d’année sans se tromper de jour', () => {
    expect(availabilityFrom('2026-09-30', today, 'fin_confirmee')).toEqual({
      kind: 'from',
      on: '2026-10-01',
      certainty: 'certaine',
    })
    expect(availabilityFrom('2026-12-31', today, 'fin_confirmee')).toEqual({
      kind: 'from',
      on: '2027-01-01',
      certainty: 'certaine',
    })
    // 2028 est bissextile : le 29 février existe.
    expect(availabilityFrom('2028-02-28', today, 'fin_confirmee')).toEqual({
      kind: 'from',
      on: '2028-02-29',
      certainty: 'certaine',
    })
  })

  it('une fin déjà passée, ou aujourd’hui, veut dire « disponible maintenant »', () => {
    expect(availabilityFrom('2026-08-31', today, 'fin_confirmee')).toEqual({ kind: 'now', certainty: 'certaine' })
    // Le dernier jour travaillé est aujourd'hui : plus rien n'est engagé
    // au-delà. C'est le signal qu'on vient chercher sur cet écran.
    // Le consultant est en repositionnement : la mission ne sera pas reconduite ICI.
    expect(availabilityFrom(today, today, 'repositionnement_lance')).toEqual({ kind: 'now', certainty: 'certaine' })
  })

  /**
   * #2410.60 (LAU-FINAL-124, NO-GO du chapitre) — un renouvellement OUVERT
   * n'est jamais une disponibilité certaine. Le bug : une mission « à
   * renouveler » (`non_engage`) ou « en discussion » affichait quand même
   * `kind: 'now' | 'from'` tel quel, rendu en vert comme une fin confirmée.
   */
  describe('#2410.60 — le renouvellement gagne sur la date', () => {
    it('« à renouveler » (non_engage) sur une fin connue rend une disponibilité INCERTAINE, jamais certaine', () => {
      expect(availabilityFrom('2026-10-01', today, 'non_engage')).toEqual({
        kind: 'from',
        on: '2026-10-02',
        certainty: 'incertaine',
      })
    })

    it('« discussion en cours » rend aussi une disponibilité incertaine', () => {
      expect(availabilityFrom('2026-08-31', today, 'discussion_en_cours')).toEqual({
        kind: 'now',
        certainty: 'incertaine',
      })
    })

    it('un statut de renouvellement ABSENT (null ou non fourni) reste incertain, jamais promu certaine', () => {
      expect(availabilityFrom('2026-10-01', today, null)).toEqual({
        kind: 'from',
        on: '2026-10-02',
        certainty: 'incertaine',
      })
      expect(availabilityFrom('2026-10-01', today)).toEqual({
        kind: 'from',
        on: '2026-10-02',
        certainty: 'incertaine',
      })
    })

    it('une reconduction SIGNÉE (renouvele) ne libère personne : pas de disponibilité à cette date', () => {
      expect(availabilityFrom('2026-10-01', today, 'renouvele')).toEqual({ kind: 'renewed' })
      // Même une fin déjà passée ne libère pas quelqu'un dont la mission a été reconduite.
      expect(availabilityFrom('2026-08-31', today, 'renouvele')).toEqual({ kind: 'renewed' })
    })
  })
})

// #2194.3, #2194.4, #2194.28
describe('isWithinDaysFromToday', () => {
  const soonToday = '2026-09-04'

  it('rend vrai à la borne du jour même et à la borne des N jours', () => {
    expect(isWithinDaysFromToday(soonToday, soonToday, SOON_WINDOW_DAYS)).toBe(true)
    expect(isWithinDaysFromToday('2026-10-04', soonToday, SOON_WINDOW_DAYS)).toBe(true)
  })

  it('rend faux un jour après la borne', () => {
    expect(isWithinDaysFromToday('2026-10-05', soonToday, SOON_WINDOW_DAYS)).toBe(false)
  })

  it('rend faux une date déjà passée — "bientôt" ne regarde jamais en arrière', () => {
    expect(isWithinDaysFromToday('2026-09-03', soonToday, SOON_WINDOW_DAYS)).toBe(false)
  })

  it('rend faux sur une date absente ou illisible — jamais "bientôt" par défaut', () => {
    expect(isWithinDaysFromToday(null, soonToday, SOON_WINDOW_DAYS)).toBe(false)
    expect(isWithinDaysFromToday(undefined, soonToday, SOON_WINDOW_DAYS)).toBe(false)
    expect(isWithinDaysFromToday('pas une date', soonToday, SOON_WINDOW_DAYS)).toBe(false)
  })
})

describe('availabilityBucket (#2194.28)', () => {
  const soonToday = '2026-09-04'

  it('« now » reste "now"', () => {
    expect(availabilityBucket({ kind: 'now', certainty: 'certaine' }, soonToday)).toBe('now')
  })

  it('« unknown » reste "unknown"', () => {
    expect(availabilityBucket({ kind: 'unknown' }, soonToday)).toBe('unknown')
  })

  it('« from » dans les 30 jours devient "soon"', () => {
    expect(availabilityBucket({ kind: 'from', on: '2026-10-04', certainty: 'certaine' }, soonToday)).toBe('soon')
  })

  it('« from » au-delà de 30 jours devient "later"', () => {
    expect(availabilityBucket({ kind: 'from', on: '2026-10-05', certainty: 'certaine' }, soonToday)).toBe('later')
  })

  it('« renewed » devient "later" — pas de date à cette échéance, mais pas "bientôt" non plus', () => {
    expect(availabilityBucket({ kind: 'renewed' }, soonToday)).toBe('later')
  })
})

describe('consultantsAvailableSoon (#2194.4)', () => {
  const soonToday = '2026-09-04'

  it('compte une personne sur UNE mission qui se termine bientôt', () => {
    expect(consultantsAvailableSoon([{ assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-09-10' }], soonToday)).toBe(1)
  })

  it('ne compte PAS une personne dont la fin est au-delà de la fenêtre', () => {
    expect(consultantsAvailableSoon([{ assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-12-01' }], soonToday)).toBe(0)
  })

  it('ne compte pas une personne sur DEUX missions tant que la PLUS TARDIVE ne libère pas bientôt', () => {
    expect(
      consultantsAvailableSoon(
        [
          { assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-09-10' },
          { assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-12-01' },
        ],
        soonToday,
      ),
    ).toBe(0)
  })

  it('la compte une fois ses DEUX missions terminées bientôt', () => {
    expect(
      consultantsAvailableSoon(
        [
          { assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-09-10' },
          { assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-09-15' },
        ],
        soonToday,
      ),
    ).toBe(1)
  })

  it('ne compte PAS une personne dont une mission n’a pas de date de fin — un silence n’est jamais "bientôt"', () => {
    expect(consultantsAvailableSoon([{ assigneeNames: ['Léa Kaczmarek'], endsOn: null }], soonToday)).toBe(0)
  })

  it('ne compte PAS une personne dont une mission est RECONDUITE — jamais libre à cette échéance', () => {
    expect(
      consultantsAvailableSoon(
        [{ assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-09-10', renewalStatus: 'renouvele' }],
        soonToday,
      ),
    ).toBe(0)
  })

  it('ne compte chaque personne QU’UNE fois, même sur plusieurs missions bientôt libres', () => {
    expect(
      consultantsAvailableSoon(
        [
          { assigneeNames: ['Léa Kaczmarek', 'Sam Bertrand'], endsOn: '2026-09-10' },
          { assigneeNames: ['Léa Kaczmarek'], endsOn: '2026-09-12' },
        ],
        soonToday,
      ),
    ).toBe(2)
  })
})

// #2194.44 — GLISSER UNE BARRE
describe('pixelsToDayDelta', () => {
  it('convertit un déplacement en pixels en jours entiers, au prorata de la piste', () => {
    // 122 jours (juillet → octobre) sur une piste de 1220 px : 0,1 jour/px.
    expect(pixelsToDayDelta(50, 1220, WINDOW.totalDays)).toBe(5)
  })

  it('arrondit au jour le plus proche, jamais tronqué', () => {
    // 4 px à 0,1 jour/px = 0,4 jour : arrondi à 0, pas à 1.
    expect(pixelsToDayDelta(4, 1220, WINDOW.totalDays)).toBe(0)
    // 6 px à 0,1 jour/px = 0,6 jour : arrondi à 1.
    expect(pixelsToDayDelta(6, 1220, WINDOW.totalDays)).toBe(1)
  })

  it('revient à ZÉRO jour pour un déplacement nul — la position de départ', () => {
    expect(pixelsToDayDelta(0, 1220, WINDOW.totalDays)).toBe(0)
  })

  it('rend un déplacement NÉGATIF vers le passé', () => {
    expect(pixelsToDayDelta(-50, 1220, WINDOW.totalDays)).toBe(-5)
  })

  it('rend 0 sans piste mesurée — jamais une division par zéro qui mentirait en NaN', () => {
    expect(pixelsToDayDelta(50, 0, WINDOW.totalDays)).toBe(0)
  })
})

describe('shiftDateByDays', () => {
  it('avance une date de N jours', () => {
    expect(shiftDateByDays('2026-07-10', 5)).toBe('2026-07-15')
  })

  it('recule une date de N jours, changement de mois compris', () => {
    expect(shiftDateByDays('2026-07-02', -5)).toBe('2026-06-27')
  })

  it('un delta nul rend la MÊME date', () => {
    expect(shiftDateByDays('2026-07-10', 0)).toBe('2026-07-10')
  })

  it('jette sur une date illisible plutôt que de deviner un jour', () => {
    expect(() => shiftDateByDays('pas une date', 3)).toThrow()
  })
})

describe('canDragMission (#2194.44)', () => {
  it('autorise une barre aux DEUX bords connus et dans le champ', () => {
    expect(canDragMission(placeMission(mission(), WINDOW))).toBe(true)
  })

  it('refuse un bord OUVERT — glisser inventerait la date qui manque', () => {
    expect(canDragMission(placeMission(mission({ startedOn: null }), WINDOW))).toBe(false)
    expect(canDragMission(placeMission(mission({ endsOn: null }), WINDOW))).toBe(false)
  })

  it('refuse un bord ROGNÉ — la fenêtre ne montre pas toute la date à déplacer', () => {
    expect(canDragMission(placeMission(mission({ startedOn: '2026-01-01' }), WINDOW))).toBe(false)
  })

  it('refuse une mission non plaçable (undated/outside/inconsistent)', () => {
    expect(canDragMission(placeMission(mission({ startedOn: null, endsOn: null }), WINDOW))).toBe(false)
    expect(canDragMission({ kind: 'outside' })).toBe(false)
    expect(canDragMission({ kind: 'inconsistent' })).toBe(false)
  })
})

describe('dragBlockReason (#2989, recette 27/09)', () => {
  it('rend `null` sur une barre qui SE GLISSE — aucune raison à annoncer', () => {
    expect(dragBlockReason(placeMission(mission(), WINDOW))).toBeNull()
  })

  it('nomme le bord OUVERT gauche avant tout autre — même priorité que les notes de bord (#1372)', () => {
    expect(dragBlockReason(placeMission(mission({ startedOn: null }), WINDOW))).toBe('openStart')
  })

  it('nomme le bord OUVERT droit — sans date de fin, jamais devinée', () => {
    expect(dragBlockReason(placeMission(mission({ endsOn: null }), WINDOW))).toBe('openEnd')
  })

  it('nomme le bord ROGNÉ gauche — la fenêtre ne montre pas tout le début', () => {
    expect(dragBlockReason(placeMission(mission({ startedOn: '2026-01-01' }), WINDOW))).toBe('clippedStart')
  })

  it('nomme le bord ROGNÉ droit — la fenêtre ne montre pas toute la fin', () => {
    expect(dragBlockReason(placeMission(mission({ endsOn: '2026-12-31' }), WINDOW))).toBe('clippedEnd')
  })

  it('rend `null` sur une mission non plaçable (undated/outside/inconsistent) — rien à glisser, rien à nommer', () => {
    expect(dragBlockReason(placeMission(mission({ startedOn: null, endsOn: null }), WINDOW))).toBeNull()
    expect(dragBlockReason({ kind: 'outside' })).toBeNull()
    expect(dragBlockReason({ kind: 'inconsistent' })).toBeNull()
  })
})

// Point propre du lot MISSIONS-A (23/10) — « la disponibilité DÉCLARÉE gagne » : quand la fiche d'une personne
// affectée porte une date de disponibilité saisie, c'est elle que le planning écrit, pas la fin de mission.
describe('declaredAvailability', () => {
  const declared = new Map([
    ['c-1', '2026-11-03'],
    ['c-2', null],
  ])
  it('rend la date déclarée de la première personne qui en a une', () => {
    expect(declaredAvailability(['c-2', 'c-1'], declared)).toBe('2026-11-03')
  })
  it('rend null quand personne n’a déclaré (jamais une date devinée)', () => {
    expect(declaredAvailability(['c-2', 'c-9'], declared)).toBeNull()
    expect(declaredAvailability([null], declared)).toBeNull()
  })
  it('ignore une date illisible', () => {
    expect(declaredAvailability(['c-3'], new Map([['c-3', 'bientôt']]))).toBeNull()
  })
})
