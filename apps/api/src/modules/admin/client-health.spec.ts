import {
  ACTIVITY_STALE_DAYS,
  AXIS_ORDER,
  AXIS_WEIGHTS,
  CHURN_ALERT_SCORE,
  MIN_MEASURED_AXES,
  TOO_RECENT_DAYS,
  computeAxes,
  computeClientHealth,
  daysBetween,
  type ClientHealthInput,
} from './client-health'

/**
 * Le calcul de santé d'un espace (#1652).
 *
 * ⚠️ TOUT EST PUR ICI : `today` est passé, jamais lu. Une spec qui lit
 * l'horloge est verte à Paris et rouge dans une CI en UTC — et celle-ci
 * couvrirait justement les seuils de jours, donc elle basculerait un soir sur
 * deux.
 *
 * Les cas qui comptent, dans l'ordre où l'issue les écrit :
 *  - un axe sans donnée SORT du dénominateur (il ne vaut pas zéro) ;
 *  - sous trois axes mesurés, il n'y a PAS de score ;
 *  - un espace de moins de quatorze jours affiche « trop récent » ;
 *  - un score sous 25 est une alerte de churn ;
 *  - et dans TOUS les cas, ce qui n'a pas pu être évalué est NOMMÉ.
 */

const AUJOURD_HUI = new Date('2026-09-07T12:00:00Z')

/** `n` jours avant l'ancre. Aucune horloge lue. */
function ilYA(jours: number): string {
  return new Date(AUJOURD_HUI.getTime() - jours * 86_400_000).toISOString()
}

/** Un espace dont TOUT est mesuré. Chaque cas ne surcharge que ce qu'il teste. */
function espace(over: Partial<ClientHealthInput> = {}): ClientHealthInput {
  return {
    createdAt: ilYA(200),
    lastActivityAt: ilYA(3),
    featuresUsed: 5,
    featuresAvailable: 10,
    creditsUsed: 40,
    creditsAllowance: 100,
    activeMembers: 2,
    seats: 4,
    incidents: 2,
    runs: 10,
    ...over,
  }
}

describe('les poids et les seuils sont ceux de #1652', () => {
  it('les cinq axes portent les poids de l’issue, et ils totalisent 100', () => {
    expect(AXIS_WEIGHTS).toEqual({ activite: 30, adoption: 25, credits: 20, sieges: 15, incidents: 10 })
    expect(Object.values(AXIS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
    expect(AXIS_ORDER).toEqual(['activite', 'adoption', 'credits', 'sieges', 'incidents'])
  })

  it('les seuils sont ceux de la doctrine, pas des nombres improvisés', () => {
    expect(MIN_MEASURED_AXES).toBe(3)
    expect(TOO_RECENT_DAYS).toBe(14)
    expect(CHURN_ALERT_SCORE).toBe(25)
  })
})

describe('daysBetween', () => {
  it('compte les jours pleins, et ne rend jamais un négatif', () => {
    expect(daysBetween(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-08T00:00:00Z'))).toBe(7)
    expect(daysBetween(new Date('2026-09-08T00:00:00Z'), new Date('2026-09-08T23:59:00Z'))).toBe(0)
    // Une date de création dans le futur (horloge de base décalée) ne rend pas
    // un âge négatif, qui ferait passer l'espace pour « trop récent » à jamais.
    expect(daysBetween(new Date('2026-09-10T00:00:00Z'), new Date('2026-09-08T00:00:00Z'))).toBe(0)
  })
})

describe('le score, quand les cinq axes sont mesurés', () => {
  it('pondère exactement comme l’issue le demande', () => {
    // 30×1 + 25×0,5 + 20×0,4 + 15×0,5 + 10×0,8 = 66, sur 100 de poids.
    const verdict = computeClientHealth(espace(), AUJOURD_HUI)
    expect(verdict.kind).toBe('score')
    if (verdict.kind !== 'score') throw new Error('inatteignable')
    expect(verdict.score).toBe(66)
    expect(verdict.measured).toBe(5)
    expect(verdict.churnRisk).toBe(false)
  })

  it('rend TOUJOURS ses cinq axes — un score n’est jamais nu', () => {
    const verdict = computeClientHealth(espace(), AUJOURD_HUI)
    expect(verdict.axes).toHaveLength(5)
    expect(verdict.axes.map(axe => axe.key)).toEqual([...AXIS_ORDER])
    for (const axe of verdict.axes) {
      expect(axe.label.length).toBeGreaterThan(3)
      expect(axe.detail).not.toBeNull()
      expect(axe.unmeasured).toBeNull()
    }
  })
})

describe('un axe sans donnée SORT du dénominateur', () => {
  it('quatre axes parfaits et un axe absent donnent 100, jamais 75', () => {
    // C'est LE test de la règle. Avec un dénominateur figé à 100, l'adoption
    // absente coûterait 25 points à un client irréprochable — le score
    // mesurerait alors la complétude de nos données.
    const verdict = computeClientHealth(
      espace({
        lastActivityAt: ilYA(0),
        featuresUsed: null,
        featuresAvailable: null,
        creditsUsed: 100,
        creditsAllowance: 100,
        activeMembers: 4,
        seats: 4,
        incidents: 0,
        runs: 10,
      }),
      AUJOURD_HUI,
    )
    expect(verdict.kind).toBe('score')
    if (verdict.kind !== 'score') throw new Error('inatteignable')
    expect(verdict.score).toBe(100)
    expect(verdict.measured).toBe(4)
  })

  it('NOMME ce qui n’a pas pu être évalué, plutôt que de l’afficher à zéro', () => {
    const axes = computeAxes(
      espace({
        lastActivityAt: null,
        featuresUsed: null,
        featuresAvailable: null,
        creditsAllowance: null,
        seats: null,
        runs: 0,
      }),
      AUJOURD_HUI,
    )
    for (const axe of axes) {
      expect(axe.ratio).toBeNull()
      expect(axe.detail).toBeNull()
      expect(axe.unmeasured).not.toBeNull()
      // Une raison plus courte que ça n'est pas une raison, c'est un tiret.
      expect((axe.unmeasured ?? '').length).toBeGreaterThan(15)
    }
    expect(axes.map(axe => axe.unmeasured)).toEqual([
      'aucun geste enregistré pour cet espace',
      'aucun geste instrumenté pour cet espace',
      'aucune allocation de crédits connue',
      'sièges payés inconnus (aucun abonnement lisible)',
      'aucune analyse sur la fenêtre — pas de dénominateur',
    ])
  })

  it('une allocation à zéro n’est pas un rapport — l’axe sort, il ne vaut pas 1', () => {
    const [, , credits] = computeAxes(espace({ creditsUsed: 0, creditsAllowance: 0 }), AUJOURD_HUI)
    expect(credits?.ratio).toBeNull()
  })
})

describe('sous trois axes mesurés, il n’y a pas de score', () => {
  it('deux axes mesurés ne donnent PAS un score', () => {
    const verdict = computeClientHealth(
      espace({
        featuresUsed: null,
        featuresAvailable: null,
        creditsAllowance: null,
        seats: null,
      }),
      AUJOURD_HUI,
    )
    expect(verdict.kind).toBe('not_enough_axes')
    expect(verdict.measured).toBe(2)
    // Et il rend quand même ses cinq axes : c'est ce qui permet de dire POURQUOI.
    expect(verdict.axes).toHaveLength(5)
  })

  it('trois axes mesurés en donnent un', () => {
    const verdict = computeClientHealth(
      espace({ featuresUsed: null, featuresAvailable: null, seats: null }),
      AUJOURD_HUI,
    )
    expect(verdict.kind).toBe('score')
    expect(verdict.measured).toBe(3)
  })

  it('aucun axe mesurable ne donne pas « 0 », il ne donne pas de score', () => {
    const verdict = computeClientHealth(
      {
        createdAt: ilYA(200),
        lastActivityAt: null,
        featuresUsed: null,
        featuresAvailable: null,
        creditsUsed: null,
        creditsAllowance: null,
        activeMembers: null,
        seats: null,
        incidents: null,
        runs: null,
      },
      AUJOURD_HUI,
    )
    expect(verdict.kind).toBe('not_enough_axes')
    expect(verdict.measured).toBe(0)
  })
})

describe('un espace de moins de quatorze jours affiche « trop récent »', () => {
  it('treize jours : pas de score, même avec les cinq axes mesurés', () => {
    const verdict = computeClientHealth(espace({ createdAt: ilYA(13) }), AUJOURD_HUI)
    expect(verdict.kind).toBe('too_recent')
    if (verdict.kind !== 'too_recent') throw new Error('inatteignable')
    expect(verdict.ageDays).toBe(13)
    // Les cinq axes SONT mesurés : ce n'est pas un manque de données, c'est un
    // refus de noter une jeunesse.
    expect(verdict.measured).toBe(5)
  })

  it('un espace créé hier n’a pas de score', () => {
    expect(computeClientHealth(espace({ createdAt: ilYA(1) }), AUJOURD_HUI).kind).toBe('too_recent')
  })

  it('quatorze jours pile : le score revient', () => {
    expect(computeClientHealth(espace({ createdAt: ilYA(14) }), AUJOURD_HUI).kind).toBe('score')
  })

  it('« trop récent » passe AVANT « pas assez d’axes »', () => {
    const verdict = computeClientHealth(
      espace({ createdAt: ilYA(2), featuresUsed: null, featuresAvailable: null, creditsAllowance: null, seats: null }),
      AUJOURD_HUI,
    )
    expect(verdict.kind).toBe('too_recent')
  })
})

describe('l’alerte de churn', () => {
  it('un score sous 25 lève le drapeau', () => {
    const verdict = computeClientHealth(
      espace({
        lastActivityAt: ilYA(ACTIVITY_STALE_DAYS + 5),
        featuresUsed: null,
        featuresAvailable: null,
        creditsUsed: 0,
        creditsAllowance: 100,
        seats: null,
        incidents: 9,
        runs: 10,
      }),
      AUJOURD_HUI,
    )
    expect(verdict.kind).toBe('score')
    if (verdict.kind !== 'score') throw new Error('inatteignable')
    // 30×0 + 20×0 + 10×0,1 = 1, sur 60 de poids mesuré → 2.
    expect(verdict.score).toBe(2)
    expect(verdict.churnRisk).toBe(true)
  })

  it('vingt-cinq pile n’est PAS une alerte — le seuil est « sous 25 »', () => {
    // 30×0 + 20×0,75 + 10×0 = 15 sur 60 → 25.
    const verdict = computeClientHealth(
      espace({
        lastActivityAt: ilYA(ACTIVITY_STALE_DAYS),
        featuresUsed: null,
        featuresAvailable: null,
        creditsUsed: 75,
        creditsAllowance: 100,
        seats: null,
        incidents: 10,
        runs: 10,
      }),
      AUJOURD_HUI,
    )
    expect(verdict.kind).toBe('score')
    if (verdict.kind !== 'score') throw new Error('inatteignable')
    expect(verdict.score).toBe(25)
    expect(verdict.churnRisk).toBe(false)
  })
})

describe('l’axe activité', () => {
  const activite = (jours: number | null): ReturnType<typeof computeAxes>[number] => {
    const [axe] = computeAxes(espace({ lastActivityAt: jours === null ? null : ilYA(jours) }), AUJOURD_HUI)
    if (!axe) throw new Error('inatteignable')
    return axe
  }

  it('est plein jusqu’à trois jours, nul à trente, linéaire entre les deux', () => {
    expect(activite(0).ratio).toBe(1)
    expect(activite(3).ratio).toBe(1)
    expect(activite(16).ratio).toBeCloseTo(14 / 27, 5)
    expect(activite(ACTIVITY_STALE_DAYS).ratio).toBe(0)
    expect(activite(90).ratio).toBe(0)
  })

  it('dit ce qu’il a lu', () => {
    expect(activite(0).detail).toBe('dernier geste aujourd’hui')
    expect(activite(12).detail).toBe('dernier geste il y a 12 j')
  })

  it('« aucune trace » n’est pas « trente jours sans rien faire »', () => {
    // Les deux donneraient 0 si on les confondait ; l'un est mesuré, l'autre non.
    expect(activite(ACTIVITY_STALE_DAYS).ratio).toBe(0)
    expect(activite(null).ratio).toBeNull()
  })
})

describe('les bornes, là où un rapport peut sortir de [0,1]', () => {
  it('un dépassement de quota ne donne pas plus de 100 % sur son axe', () => {
    const [, , credits] = computeAxes(espace({ creditsUsed: 150, creditsAllowance: 100 }), AUJOURD_HUI)
    expect(credits?.ratio).toBe(1)
  })

  it('plus d’incidents que d’analyses ne rend pas un axe négatif', () => {
    const axes = computeAxes(espace({ incidents: 30, runs: 10 }), AUJOURD_HUI)
    expect(axes.at(-1)?.ratio).toBe(0)
  })

  it('plus de membres actifs que de sièges ne dépasse pas 1', () => {
    const [, , , sieges] = computeAxes(espace({ activeMembers: 9, seats: 4 }), AUJOURD_HUI)
    expect(sieges?.ratio).toBe(1)
  })
})

describe('l’horloge est un PARAMÈTRE', () => {
  it('le même espace, lu un mois plus tard, perd son activité', () => {
    const input = espace()
    const maintenant = computeClientHealth(input, AUJOURD_HUI)
    const plusTard = computeClientHealth(input, new Date(AUJOURD_HUI.getTime() + 60 * 86_400_000))
    expect(maintenant.kind).toBe('score')
    expect(plusTard.kind).toBe('score')
    if (maintenant.kind !== 'score' || plusTard.kind !== 'score') throw new Error('inatteignable')
    expect(plusTard.score).toBeLessThan(maintenant.score)
  })
})
