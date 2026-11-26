import type { Intervention } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  COCKPIT_BLOCKS,
  capacityWindow,
  cockpitState,
  interventionHref,
  isBlankWorkspace,
  myQueue,
  sourceState,
  type CockpitBlock,
  type SourceState,
} from './cockpit'

/**
 * Le cockpit du commercial (BEL-BO-002).
 *
 * Chaque test protège une lecture FAUSSE que le code produirait sans lui — pas
 * une ligne de code. Les cinq qui comptent :
 *
 *  · « Négociation · 0 € » sur six affaires dont aucune n'est chiffrée ;
 *  · « 0 jour à vendre » qui se lit « tout le monde est staffé » ;
 *  · une mission sans échéance triée comme une mission qui finit demain ;
 *  · la file du voisin dans mon brief, le temps que la session se charge ;
 *  · « 3 blocs sur 6 » affiché en permanence à qui n'a pas le droit financier.
 */

const now = new Date('2026-08-28T09:00:00Z')

describe('sourceState', () => {
  it('sépare un REFUS (403) d’une panne — les deux appellent des gestes opposés', () => {
    expect(sourceState({ isLoading: false, isError: true, error: { status: 403 } })).toBe('refused')
    expect(sourceState({ isLoading: false, isError: true, error: { status: 500 } })).toBe('failed')
    // Une erreur sans code HTTP (réseau coupé) est une panne, pas un refus :
    // la traiter en refus ferait disparaître le bloc pour toujours.
    expect(sourceState({ isLoading: false, isError: true, error: new Error('offline') })).toBe('failed')
  })

  it('l’erreur passe avant le chargement — sinon un bloc refusé afficherait « … » sans fin', () => {
    expect(sourceState({ isLoading: true, isError: true, error: { status: 403 } })).toBe('refused')
  })

  it('une réponse arrivée sans donnée reste en chargement', () => {
    expect(sourceState({ isLoading: false, isError: false, data: undefined })).toBe('loading')
    expect(sourceState({ isLoading: false, isError: false, data: {} })).toBe('ready')
  })
})

describe('capacityWindow', () => {
  it('somme les trois mois quand les trois sont mesurés', () => {
    const window = capacityWindow([
      { periodMonth: '2026-08-01', availableDays: 12.5 },
      { periodMonth: '2026-09-01', availableDays: 20 },
      { periodMonth: '2026-10-01', availableDays: 18.25 },
    ])
    expect(window.sellableDays).toBe(50.75)
    expect(window.unmeasuredMonths).toBe(0)
    expect(window.months).toHaveLength(3)
  })

  it('un mois manquant rend null, PAS une somme partielle qui a l’air juste', () => {
    const window = capacityWindow([
      { periodMonth: '2026-08-01', availableDays: 12 },
      { periodMonth: '2026-09-01', availableDays: null },
      undefined,
    ])
    expect(window.sellableDays).toBeNull()
    expect(window.unmeasuredMonths).toBe(2)
  })

  it('rien de mesurable : null et non 0 — « 0 jour à vendre » se lit « tout le monde est staffé »', () => {
    const window = capacityWindow([undefined, undefined, undefined])
    expect(window.sellableDays).toBeNull()
    expect(window.unmeasuredMonths).toBe(3)
  })

  it('une vraie capacité nulle reste 0 : trois mois mesurés à zéro sont une MESURE', () => {
    const window = capacityWindow([
      { periodMonth: '2026-08-01', availableDays: 0 },
      { periodMonth: '2026-09-01', availableDays: 0 },
      { periodMonth: '2026-10-01', availableDays: 0 },
    ])
    expect(window.sellableDays).toBe(0)
    expect(window.unmeasuredMonths).toBe(0)
  })
})

describe('myQueue', () => {
  const item = (id: string, ownerId: string | null): Intervention => ({
    id,
    kind: 'renewal_at_risk',
    subjectType: 'mission',
    subjectId: `s-${id}`,
    subjectLabel: null,
    ownerId,
    ownerName: null,
    detail: `${id} : fin prévue dans 12 jours.`,
    state: 'open',
    openedAt: '2026-08-20T08:00:00.000Z',
    resolvedAt: null,
  })

  it('ne garde que MES lignes', () => {
    const queue = myQueue([item('a', 'moi'), item('b', 'toi'), item('c', 'moi')], 'moi')
    expect(queue.shown.map(row => row.id)).toEqual(['a', 'c'])
    expect(queue.total).toBe(2)
  })

  it('PRÉSERVE l’ordre du serveur — le classement gravité × âge ne se refait pas ici', () => {
    // C'est la propriété qui empêche le second moteur de priorité : la file du
    // brief et celle du responsable doivent dire la même chose de la même ligne.
    const ordered = [item('z', 'moi'), item('a', 'moi'), item('m', 'moi')]
    expect(myQueue(ordered, 'moi').shown.map(row => row.id)).toEqual(['z', 'a', 'm'])
  })

  it('annonce ce qu’elle replie, elle ne coupe pas en silence', () => {
    const many = Array.from({ length: 12 }, (_, index) => item(`i${index}`, 'moi'))
    const queue = myQueue(many, 'moi')
    expect(queue.shown).toHaveLength(5)
    expect(queue.hidden).toBe(7)
  })

  it('sans identité connue, la file est VIDE — jamais celle de tout l’espace', () => {
    expect(myQueue([item('a', 'quelqu-un')], null).total).toBe(0)
  })

  it('une ligne sans propriétaire n’est celle de personne', () => {
    expect(myQueue([item('a', null)], 'moi').total).toBe(0)
  })
})

describe('interventionHref', () => {
  it('mène à l’objet quand il a un écran', () => {
    expect(interventionHref({ subjectType: 'account', subjectId: 'a1' })).toBe('/accounts/a1')
    expect(interventionHref({ subjectType: 'mission', subjectId: 'm1' })).toBe('/missions')
  })

  it('rend null pour ce qui ne s’ouvre pas — un lien mort est pire qu’une ligne inerte', () => {
    expect(interventionHref({ subjectType: 'user', subjectId: 'u1' })).toBeNull()
    expect(interventionHref({ subjectType: 'workspace', subjectId: 'w1' })).toBeNull()
  })

  // #2107.3 — RÉFUTÉ en prod le 21/09/2026 : la ligne « Besoin sans shortlist »
  // du bloc « Ce qui attend ta décision » (DailyGesturesBlock, #2567.K2) mène à
  // `/projects` générique. `subjectType` vaut `project` par convention
  // (`intervention-rules.ts`, `detectNeedsWithoutShortlist`) mais `subjectId`
  // porte l'identifiant du BESOIN, jamais lu par le `switch` sur `subjectType`
  // seul. Le producteur `need_stale` du brief (`briefing-actions.ts:552`) a la
  // bonne route depuis ce matin ; cette ligne-ci, sur le MÊME écran, ne l'avait
  // pas.
  it('un besoin sans shortlist mène à sa fiche, jamais à la liste des projets', () => {
    expect(interventionHref({ kind: 'need_without_shortlist', subjectType: 'project', subjectId: 'need-1' })).toBe(
      '/projects/needs/need-1',
    )
  })

  it('un projet immobile, lui, reste sur la liste générique — aucun écran par identifiant', () => {
    expect(interventionHref({ kind: 'project_no_decision', subjectType: 'project', subjectId: 'proj-1' })).toBe(
      '/projects',
    )
  })
})

describe('cockpitState', () => {
  // #2567.K2 — `awaiting` est sorti de `COCKPIT_BLOCKS` : la file « ce qui
  // m'attend » ne vit plus dans « Mon activité » (voir `DailyGesturesBlock`).
  const states = (over: Partial<Record<CockpitBlock, SourceState>> = {}): Record<CockpitBlock, SourceState> => ({
    revenue: 'ready',
    capacity: 'ready',
    sinceLastVisit: 'ready',
    ...over,
  })

  it('trois sur trois : l’écran ne dit rien de particulier', () => {
    expect(cockpitState(states())).toMatchObject({ kind: 'ready', served: 3, expected: 3 })
  })

  it('une panne : « 2 blocs sur 3 », et on NOMME celui qui n’a pas répondu', () => {
    const state = cockpitState(states({ capacity: 'failed' }))
    expect(state).toMatchObject({ kind: 'partial', served: 2, expected: 3 })
    expect(state.failed).toEqual(['capacity'])
  })

  it('un bloc REFUSÉ sort du dénominateur — sinon on annoncerait une panne à qui n’a pas le droit', () => {
    const state = cockpitState(states({ revenue: 'refused', capacity: 'refused' }))
    expect(state).toMatchObject({ kind: 'ready', served: 1, expected: 1, failed: [] })
  })

  it('un refus ET une panne : le refus sort, la panne compte', () => {
    const state = cockpitState(states({ revenue: 'refused', capacity: 'failed' }))
    expect(state).toMatchObject({ kind: 'partial', served: 1, expected: 2 })
    expect(state.failed).toEqual(['capacity'])
  })

  it('#1394 — le compteur ne compte QUE ce que l’écran montre', () => {
    // Le pipe et les missions restent LUS (l'espace neuf se reconnaît à eux),
    // mais ils ne sont plus rendus : les compter ferait annoncer une panne
    // permanente à un écran complet.
    expect(COCKPIT_BLOCKS).not.toContain('pipe')
    expect(COCKPIT_BLOCKS).not.toContain('missions')
    expect(COCKPIT_BLOCKS.length).toBeGreaterThan(2)
  })
})

describe('isBlankWorkspace', () => {
  const empty = { total_count: 0, intake: 0, signals: 0 }

  it('pipe vide et aucune mission : l’espace n’a rien', () => {
    expect(isBlankWorkspace({ pipe: empty, pipeState: 'ready', missions: 0, missionsState: 'ready' })).toBe(true)
  })

  it('un seul signal détecté suffit à dire que quelque chose existe', () => {
    expect(
      isBlankWorkspace({
        pipe: { total_count: 0, intake: 0, signals: 3 },
        pipeState: 'ready',
        missions: 0,
        missionsState: 'ready',
      }),
    ).toBe(false)
  })

  it('ne conclut JAMAIS d’un silence : une source en panne n’est pas un espace vide', () => {
    expect(isBlankWorkspace({ pipe: undefined, pipeState: 'failed', missions: 0, missionsState: 'ready' })).toBe(false)
    expect(isBlankWorkspace({ pipe: empty, pipeState: 'ready', missions: undefined, missionsState: 'failed' })).toBe(
      false,
    )
  })
})
