import { describe, expect, it } from 'vitest'
import {
  GRACE_MISE_EN_SERVICE_JOURS,
  TAUX_ACTION_MIN_TRAVAILLE,
  TAUX_REBOND_MIN_SURVOLE,
  compterVerdicts,
  libelleVerdict,
  verdictEcranAbsent,
  verdictEcranPresent,
  verdictsDesEcrans,
  type EcranCatalogue,
  type EcranMesureLigne,
  type VerdictEcran,
} from './screen-verdict.logic'

/**
 * #1683.1 — LE VERDICT PAR ÉCRAN, testé AVANT d'être rendu.
 *
 * Trois choses à prouver, dans l'ordre du ticket :
 *  1. un écran MESURÉ (présent dans `rapport.screens`) reçoit un verdict parmi
 *     travaillé/consulté/survolé, jamais un zéro déguisé ;
 *  2. un écran ABSENT du rapport (zéro vue sur la fenêtre) ne devient JAMAIS
 *     « jamais ouvert » par défaut — sans date de mise en service, c'est
 *     « non mesuré » ;
 *  3. les verdicts, mis bout à bout sur un catalogue d'écrans, en couvrent
 *     EXACTEMENT le total — aucun écran compté deux fois, aucun oublié.
 */

const LABEL = { fr: 'Comptes', en: 'Accounts' }

function ecranMesure(overrides: Partial<EcranMesureLigne> = {}): EcranMesureLigne {
  return {
    route: '/accounts',
    label: LABEL,
    nature: 'produit',
    views: 20,
    sessions: 8,
    measures: {
      kind: 'measured',
      viewsPerWeek: 20,
      medianDuration: { kind: 'measured', seconds: 40 },
      bounceRate: { kind: 'measured', ratio: 0.1, over: 18 },
      actionRate: { kind: 'measured', ratio: 0.1, over: 20 },
    },
    ...overrides,
  }
}

describe('#1683.1 — verdictEcranPresent (un écran qui a au moins une vue dans la fenêtre)', () => {
  it('sous le seuil de sessions distinctes → « observations insuffisantes », jamais « survolé »', () => {
    const verdict = verdictEcranPresent({ sessions: 3, measures: { kind: 'below_threshold', minSessions: 5 } })
    expect(verdict).toEqual({ kind: 'observations_insuffisantes', sessions: 3, seuil: 5 })
  })

  it('taux d’action au-dessus du seuil → « travaillé », même si le rebond est aussi haut', () => {
    // « travaillé » l'emporte : une action prise malgré un rebond mesuré ailleurs
    // reste un signe d'usage réel, pas un survol.
    const verdict = verdictEcranPresent(
      ecranMesure({
        measures: {
          kind: 'measured',
          viewsPerWeek: 20,
          medianDuration: { kind: 'measured', seconds: 5 },
          bounceRate: { kind: 'measured', ratio: 0.9, over: 18 },
          actionRate: { kind: 'measured', ratio: TAUX_ACTION_MIN_TRAVAILLE, over: 20 },
        },
      }),
    )
    expect(verdict).toEqual({ kind: 'travaille' })
  })

  it('taux d’action bas et rebond au-dessus du seuil → « survolé »', () => {
    const verdict = verdictEcranPresent(
      ecranMesure({
        measures: {
          kind: 'measured',
          viewsPerWeek: 20,
          medianDuration: { kind: 'measured', seconds: 5 },
          bounceRate: { kind: 'measured', ratio: TAUX_REBOND_MIN_SURVOLE, over: 18 },
          actionRate: { kind: 'measured', ratio: 0.05, over: 20 },
        },
      }),
    )
    expect(verdict).toEqual({ kind: 'survole' })
  })

  it('ni action ni rebond marqués → « consulté », le seau du milieu', () => {
    const verdict = verdictEcranPresent(ecranMesure())
    expect(verdict).toEqual({ kind: 'consulte' })
  })

  it('rebond NON MESURÉ (aucune vue jamais fermée) ne fait pas basculer en « survolé » à tort', () => {
    const verdict = verdictEcranPresent(
      ecranMesure({
        measures: {
          kind: 'measured',
          viewsPerWeek: 20,
          medianDuration: { kind: 'unmeasured' },
          bounceRate: { kind: 'unmeasured' },
          actionRate: { kind: 'measured', ratio: 0.05, over: 20 },
        },
      }),
    )
    expect(verdict).toEqual({ kind: 'consulte' })
  })

  it('sait dire NON — un taux d’action calculé au-dessus du seuil mais rendu comme « consulté » serait faux', () => {
    // Contrôle négatif explicite : si l'implémentation inversait la priorité
    // (rebond avant action), ce cas rendrait « survolé » au lieu de
    // « travaillé » — ce test casse dans ce cas précis.
    const verdict = verdictEcranPresent(
      ecranMesure({
        measures: {
          kind: 'measured',
          viewsPerWeek: 20,
          medianDuration: { kind: 'measured', seconds: 5 },
          bounceRate: { kind: 'measured', ratio: 0.95, over: 18 },
          actionRate: { kind: 'measured', ratio: 0.99, over: 20 },
        },
      }),
    )
    expect(verdict.kind).not.toBe('survole')
    expect(verdict).toEqual({ kind: 'travaille' })
  })
})

describe('#1683.1 — verdictEcranAbsent (zéro vue mesurée sur la fenêtre)', () => {
  const MAINTENANT = new Date('2026-09-10T00:00:00.000Z')

  it('sans date de mise en service → « non mesuré », JAMAIS « jamais ouvert » deviné', () => {
    const verdict = verdictEcranAbsent({ now: MAINTENANT })
    expect(verdict.kind).toBe('non_mesure')
    if (verdict.kind === 'non_mesure') {
      expect(verdict.raison).toMatch(/date de mise en service/)
    }
  })

  it('mis en service il y a moins de la grâce → « trop récent », pas « jamais ouvert »', () => {
    const misEnService = new Date(MAINTENANT.getTime() - 2 * 24 * 60 * 60 * 1000) // 2 jours
    const verdict = verdictEcranAbsent({ shippedAt: misEnService, now: MAINTENANT })
    expect(verdict).toEqual({ kind: 'trop_recent', depuisJours: 2 })
  })

  it('mis en service il y a plus que la grâce → « jamais ouvert »', () => {
    const misEnService = new Date(MAINTENANT.getTime() - (GRACE_MISE_EN_SERVICE_JOURS + 1) * 24 * 60 * 60 * 1000)
    const verdict = verdictEcranAbsent({ shippedAt: misEnService, now: MAINTENANT })
    expect(verdict).toEqual({ kind: 'jamais_ouvert' })
  })

  it('exactement à la borne de la grâce → « jamais ouvert » (la grâce est un MOINS QUE, pas un AU PLUS)', () => {
    const misEnService = new Date(MAINTENANT.getTime() - GRACE_MISE_EN_SERVICE_JOURS * 24 * 60 * 60 * 1000)
    const verdict = verdictEcranAbsent({ shippedAt: misEnService, now: MAINTENANT })
    expect(verdict).toEqual({ kind: 'jamais_ouvert' })
  })

  it('une date de mise en service illisible se comporte comme absente — non mesuré, jamais une exception', () => {
    const verdict = verdictEcranAbsent({ shippedAt: 'pas une date', now: MAINTENANT })
    expect(verdict.kind).toBe('non_mesure')
  })
})

describe('#1683.1 — verdictsDesEcrans (totalité : chaque écran reçoit EXACTEMENT un verdict)', () => {
  const CATALOGUE: EcranCatalogue[] = [
    { route: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
    { route: '/accounts', label: LABEL },
    { route: '/contacts', label: { fr: 'Contacts', en: 'Contacts' } },
    { route: '/rfp', label: { fr: 'Appels d’offres', en: 'Tenders' } },
  ]

  it('un écran présent, un absent avec date récente, un absent avec date ancienne, un absent sans date', () => {
    const MAINTENANT = new Date('2026-09-10T00:00:00.000Z')
    const mesures: EcranMesureLigne[] = [
      ecranMesure({ route: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } }),
    ]
    const shippedAtParRoute = (route: string): Date | null => {
      if (route === '/contacts') return new Date(MAINTENANT.getTime() - 1 * 24 * 60 * 60 * 1000)
      if (route === '/rfp') return new Date(MAINTENANT.getTime() - 400 * 24 * 60 * 60 * 1000)
      return null
    }

    const lignes = verdictsDesEcrans(CATALOGUE, mesures, { shippedAtParRoute, now: MAINTENANT })

    expect(lignes).toHaveLength(CATALOGUE.length)
    expect(lignes.find(l => l.route === '/dashboard')?.verdict.kind).toBe('consulte')
    expect(lignes.find(l => l.route === '/accounts')?.verdict.kind).toBe('non_mesure')
    expect(lignes.find(l => l.route === '/contacts')?.verdict.kind).toBe('trop_recent')
    expect(lignes.find(l => l.route === '/rfp')?.verdict.kind).toBe('jamais_ouvert')
  })

  it('les verdicts s’ADDITIONNENT jusqu’au nombre d’écrans — aucun compté deux fois, aucun oublié', () => {
    const mesures: EcranMesureLigne[] = [
      ecranMesure({ route: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } }),
      ecranMesure({
        route: '/accounts',
        sessions: 2,
        measures: { kind: 'below_threshold', minSessions: 5 },
      }),
    ]
    const lignes = verdictsDesEcrans(CATALOGUE, mesures, { now: new Date('2026-09-10T00:00:00.000Z') })

    const parKind = new Map<VerdictEcran['kind'], number>()
    for (const ligne of lignes) parKind.set(ligne.verdict.kind, (parKind.get(ligne.verdict.kind) ?? 0) + 1)
    const total = [...parKind.values()].reduce((somme, n) => somme + n, 0)

    expect(total).toBe(CATALOGUE.length)
    expect(new Set(lignes.map(l => l.route)).size).toBe(CATALOGUE.length)
  })

  it('sait dire NON — un écran présent ne doit jamais recevoir un verdict d’écran absent', () => {
    const mesures: EcranMesureLigne[] = [
      ecranMesure({ route: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } }),
    ]
    const lignes = verdictsDesEcrans(
      [{ route: '/dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } }],
      mesures,
    )
    expect(['jamais_ouvert', 'trop_recent', 'non_mesure']).not.toContain(lignes[0]?.verdict.kind)
  })
})

describe('#1683.1 — compterVerdicts (la preuve d’ADDITION, tenue par construction)', () => {
  it('le total des sept compartiments égale toujours le nombre de lignes', () => {
    const CATALOGUE: EcranCatalogue[] = Array.from({ length: 9 }, (_, i) => ({
      route: `/e${i}`,
      label: { fr: `Écran ${i}`, en: `Screen ${i}` },
    }))
    const mesures: EcranMesureLigne[] = [
      ecranMesure({ route: '/e0' }), // consulté
      ecranMesure({
        route: '/e1',
        measures: {
          kind: 'measured',
          viewsPerWeek: 1,
          medianDuration: { kind: 'unmeasured' },
          bounceRate: { kind: 'unmeasured' },
          actionRate: { kind: 'measured', ratio: 0.9, over: 1 },
        },
      }), // travaillé
      ecranMesure({ route: '/e2', sessions: 2, measures: { kind: 'below_threshold', minSessions: 5 } }), // observations insuffisantes
    ]
    const lignes = verdictsDesEcrans(CATALOGUE, mesures, { now: new Date('2026-09-10T00:00:00.000Z') })
    const compte = compterVerdicts(lignes)
    const total = Object.values(compte).reduce((somme, n) => somme + n, 0)
    expect(total).toBe(CATALOGUE.length)
    expect(compte.consulte).toBe(1)
    expect(compte.travaille).toBe(1)
    expect(compte.observations_insuffisantes).toBe(1)
    expect(compte.non_mesure).toBe(6) // les six écrans absents, sans date de mise en service
  })

  it('sait dire NON — une ligne fabriquée avec un kind inconnu au compilateur ferait échouer la somme, pas grossir un compartiment existant', () => {
    // Contrôle négatif indirect : chaque clé démarre à 0 et TOUTES sont
    // présentes même sur un jeu vide — un compteur qui « oublierait » une clé
    // absente du jeu observé la rendrait `undefined`, et la somme échouerait.
    const compte = compterVerdicts([])
    expect(Object.keys(compte).sort()).toEqual(
      [
        'consulte',
        'jamais_ouvert',
        'non_mesure',
        'observations_insuffisantes',
        'survole',
        'travaille',
        'trop_recent',
      ].sort(),
    )
    expect(Object.values(compte).reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('#1683.1 — libelleVerdict', () => {
  it('nomme les sept états, jamais un nombre nu à la place du mot', () => {
    expect(libelleVerdict({ kind: 'travaille' })).toBe('travaillé')
    expect(libelleVerdict({ kind: 'consulte' })).toBe('consulté')
    expect(libelleVerdict({ kind: 'survole' })).toBe('survolé')
    expect(libelleVerdict({ kind: 'jamais_ouvert' })).toBe('jamais ouvert')
    expect(libelleVerdict({ kind: 'trop_recent', depuisJours: 3 })).toContain('trop récent')
    expect(libelleVerdict({ kind: 'observations_insuffisantes', sessions: 2, seuil: 5 })).toContain('insuffisantes')
    expect(libelleVerdict({ kind: 'non_mesure', raison: 'x' })).toBe('non mesuré')
  })
})
