import { describe, expect, it } from 'vitest'
import {
  FOCUS_MAX_ACCOUNTS,
  FOCUS_STALE_DAYS,
  SPRINT_EVENTS,
  SPRINT_LANES,
  SPRINT_LANE_LEVELS,
  SPRINT_LEVELS,
  SPRINT_RULES,
  canEnterFocus,
  focusCapacityFor,
  laneOverlap,
  noGoMessageRefusal,
  shouldSwitch,
  splitBoardByLane,
  sprintDecisionProblems,
  sprintEntryProblems,
  sprintExitProblems,
  sprintLanePartitionProblems,
} from './sprint.js'

describe('le board d’effort (tome 5 §28-31)', () => {
  it('a six niveaux, dont la sortie — watch et partner_route AJOUTÉS EN FIN (GA-08, BEL-SC-228)', () => {
    expect(SPRINT_LEVELS).toEqual(['focus', 'extension', 'volume', 'no_go', 'watch', 'partner_route'])
  })

  it('interdit le plan de compte au niveau Volume — c’est écrit dans le document', () => {
    expect(SPRINT_RULES.volume.planRequired).toBe(false)
    expect(SPRINT_RULES.volume.forbidden.join(' ')).toContain('Pas de plan de compte')
  })

  it('exige un plan et deux relances au niveau Focus', () => {
    expect(SPRINT_RULES.focus.planRequired).toBe(true)
    expect(SPRINT_RULES.focus.relances).toEqual([3, 7])
  })
})

describe('le plafond dur du Focus (D80)', () => {
  it('accepte le huitième compte', () => {
    expect(canEnterFocus(7).allowed).toBe(true)
  })

  it('REFUSE le neuvième, et dit combien il y en a', () => {
    const verdict = canEnterFocus(FOCUS_MAX_ACCOUNTS)
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('8/8')
  })
})

describe('les sept règles de bascule (§29)', () => {
  it('fait monter automatiquement sur une réponse positive en Volume', () => {
    expect(shouldSwitch('volume', 'positive_reply')).toMatchObject({ to: 'extension', automatic: true })
  })

  it('fait monter automatiquement en Focus sur un rendez-vous', () => {
    expect(shouldSwitch('extension', 'meeting_booked')).toMatchObject({ to: 'focus', automatic: true })
  })

  it('ne DESCEND jamais un compte tout seul', () => {
    // Baisser l'effort à la place du commercial, c'est décider d'abandonner.
    expect(shouldSwitch('focus', 'thirty_days_idle')).toMatchObject({ to: 'extension', automatic: false })
    expect(shouldSwitch('extension', 'two_relances_no_reply')).toMatchObject({ to: 'no_go', automatic: false })
  })

  it('propose de rouvrir un compte écarté sur un signal fort, sans le faire', () => {
    expect(shouldSwitch('no_go', 'strong_signal')).toMatchObject({ to: 'volume', automatic: false })
  })

  it('ne bascule rien quand l’évènement ne s’applique pas à ce niveau', () => {
    expect(shouldSwitch('focus', 'positive_reply')).toBeNull()
    expect(shouldSwitch('volume', 'thirty_days_idle')).toBeNull()
  })
})

describe('became_client — huitième évènement, ajouté en FIN d’énumération (GA-08)', () => {
  it('a neuf évènements, dans le même ordre qu’avant plus deux derniers (#3257.8)', () => {
    expect(SPRINT_EVENTS).toEqual([
      'positive_reply',
      'meeting_booked',
      'two_relances_no_reply',
      'thirty_days_idle',
      'asks_for_plan',
      'strong_signal',
      'became_client',
      'wake_condition_met',
      'partner_access_found',
    ])
  })

  it('ne bascule encore rien : la règle métier reste à écrire, l’évènement est seulement recevable', () => {
    for (const level of SPRINT_LEVELS) {
      expect(shouldSwitch(level, 'became_client')).toBeNull()
    }
  })
})

describe('la sortie exige son motif', () => {
  it('refuse un no-go sans motif', () => {
    expect(sprintExitProblems('no_go', '  ')).toEqual(['Sortir un compte demande son motif.'])
  })

  it('accepte un no-go motivé', () => {
    expect(sprintExitProblems('no_go', 'Pas de budget avant 2027')).toEqual([])
  })

  it('n’exige rien pour les autres niveaux', () => {
    expect(sprintExitProblems('focus', null)).toEqual([])
  })
})

/**
 * `planRequired` (N15-B) — déclaré cinq fois dans `SPRINT_RULES`, lu par
 * aucun appelant nulle part dans le dépôt (grep à zéro sur les cinq
 * apparitions ci-dessus, hors ce fichier de test). `sprintEntryProblems` est
 * l'appelant qu'il n'avait jamais eu : un board qui exige un plan et dont le
 * compte n'en a pas refuse l'entrée en Focus, ET dit ce qui manque — un refus
 * muet se lit comme un bug, pas comme une règle.
 */
describe('l’entrée en Focus exige un plan de compte quand la règle le demande', () => {
  it('REFUSE Focus sans plan, et dit ce qui manque', () => {
    expect(sprintEntryProblems('focus', false)).toEqual([
      'Ce compte n’a pas de plan de compte — écris-en un avant d’entrer en Focus.',
    ])
  })

  it('accepte Focus avec un plan', () => {
    expect(sprintEntryProblems('focus', true)).toEqual([])
  })

  it('n’exige rien pour les niveaux où `planRequired` est faux, même sans plan', () => {
    expect(sprintEntryProblems('extension', false)).toEqual([])
    expect(sprintEntryProblems('volume', false)).toEqual([])
    expect(sprintEntryProblems('no_go', false)).toEqual([])
  })
})

/**
 * P6 — les deux FILES du board (arbitrage / exécution), et leur règle de
 * non-chevauchement.
 *
 * Le dépôt n'a pas de rôle « qui arbitre » / « qui exécute » (voir
 * `workspace.ts` : neuf rôles, aucun ne porte cette distinction — `sales`,
 * `sales_ops`, `member`, `admin`, `owner` peuvent tous écrire sur ce board).
 * La coupure est donc une VUE, pas une permission — voir le docstring de
 * `SPRINT_LANE_LEVELS` pour le raisonnement complet.
 */
describe('les deux files du board (P6) — arbitrage vs exécution', () => {
  it('a exactement deux files', () => {
    expect(SPRINT_LANES).toEqual(['arbitrage', 'execution'])
  })

  it('range Focus, Sortis, Veille et Route partenaire en arbitrage — aucun n’est une cadence de contact', () => {
    expect(SPRINT_LANE_LEVELS.arbitrage).toEqual(['focus', 'no_go', 'watch', 'partner_route'])
  })

  it('range Extension et Volume en exécution — la cadence sans porte d’entrée/sortie', () => {
    expect(SPRINT_LANE_LEVELS.execution).toEqual(['extension', 'volume'])
  })

  it('la partition réelle couvre les six niveaux, chacun dans UNE SEULE file', () => {
    expect(sprintLanePartitionProblems()).toEqual([])
  })

  it('sait dire NON : un niveau présent dans les deux files est signalé', () => {
    const broken = {
      arbitrage: ['focus', 'no_go', 'volume', 'watch', 'partner_route'],
      execution: ['extension', 'volume'],
    } as const
    expect(sprintLanePartitionProblems(broken)).toEqual(['volume est dans plusieurs files : arbitrage, execution.'])
  })

  it('sait dire NON : un niveau absent des deux files est signalé', () => {
    const broken = { arbitrage: ['focus', 'watch', 'partner_route'], execution: ['extension', 'volume'] } as const
    expect(sprintLanePartitionProblems(broken)).toEqual(["no_go n'est dans aucune file."])
  })
})

describe('un compte ne se trouve jamais dans les deux files — sur un board construit', () => {
  const board = {
    focus: [{ id: 'a-focus' }],
    extension: [{ id: 'a-extension' }],
    volume: [{ id: 'a-volume' }],
    no_go: [{ id: 'a-no-go' }],
    watch: [{ id: 'a-watch' }],
    partner_route: [{ id: 'a-partner-route' }],
  }

  it('la partition RÉELLE ne chevauche jamais', () => {
    const files = splitBoardByLane(board)
    expect(files.arbitrage.sort()).toEqual(['a-focus', 'a-no-go', 'a-partner-route', 'a-watch'])
    expect(files.execution.sort()).toEqual(['a-extension', 'a-volume'])
    expect(laneOverlap(files)).toEqual([])
  })

  it('sait dire NON : une correspondance niveau→file cassée fait apparaître un compte dans les deux files', () => {
    // 'volume' rangé dans les DEUX files, volontairement — c'est le bug qu'on
    // construit pour prouver que la garde le voit.
    const broken = { arbitrage: ['focus', 'no_go', 'volume'], execution: ['extension', 'volume'] } as const
    const files = splitBoardByLane(board, broken)
    expect(laneOverlap(files)).toEqual(['a-volume'])
  })
})

/**
 * BEL-SC-228 — « Veille » : un compte compatible, sans énergie active, qu'un
 * signal peut réveiller. Ni `no_go` (on n'a pas dit non), ni `extension`/`volume`
 * (aucun contact n'est engagé cette semaine) : c'est le manque nommé par le
 * ticket #3257 — avant ce lot, un compte « pas prioritaire maintenant » sortait
 * simplement du board (`sprint = NULL`), invisible, sans condition de réveil
 * nommée nulle part.
 */
describe('« Veille » (watch, BEL-SC-228) — aucune énergie active, une condition de réveil', () => {
  it('n’exige ni plafond ni plan, et interdit toute relance active', () => {
    expect(SPRINT_RULES.watch.maxAccounts).toBeNull()
    expect(SPRINT_RULES.watch.planRequired).toBe(false)
    expect(SPRINT_RULES.watch.relances).toEqual([])
  })

  it('exige une condition de réveil pour ENTRER en veille — sans elle, personne ne sait quand y revenir', () => {
    expect(sprintDecisionProblems('watch', { promotionCondition: null })).toEqual([
      'Passer un compte en veille demande sa condition de réveil — ce qui doit se produire pour y revenir.',
    ])
    expect(sprintDecisionProblems('watch', { promotionCondition: '  ' })).toHaveLength(1)
    expect(sprintDecisionProblems('watch', { promotionCondition: 'Un signal RH ou une levée de fonds' })).toEqual([])
  })

  it('n’exige rien pour les autres niveaux', () => {
    expect(sprintDecisionProblems('focus', { promotionCondition: null })).toEqual([])
    expect(sprintDecisionProblems('no_go', { promotionCondition: null })).toEqual([])
  })
})

/**
 * BEL-SC-228 — « Route partenaire » : la voie d'entrée passe par une ESN
 * partenaire ou un rang 2, pas par un effort direct sur le compte. Distinct de
 * `accountAccessLevel` (`partner.ts`) qui CONSTATE l'accès : ce niveau est la
 * DÉCISION d'y consacrer l'effort commercial en conséquence — un compte peut
 * être accessible directement et quand même se travailler via un partenaire
 * pour une raison stratégique.
 */
describe('« Route partenaire » (partner_route, BEL-SC-228)', () => {
  it('n’exige ni plafond ni plan — l’effort direct sur le compte n’est justement pas la voie', () => {
    expect(SPRINT_RULES.partner_route.maxAccounts).toBeNull()
    expect(SPRINT_RULES.partner_route.planRequired).toBe(false)
  })
})

describe('la capacité du sprint Focus N’EST PAS un « trois Focus pour tous » (BEL-SC-228)', () => {
  it('retombe sur le plafond historique quand la taille d’équipe est inconnue — aucune régression', () => {
    expect(focusCapacityFor(null)).toBe(FOCUS_MAX_ACCOUNTS)
    expect(focusCapacityFor(undefined)).toBe(FOCUS_MAX_ACCOUNTS)
    expect(focusCapacityFor(0)).toBe(FOCUS_MAX_ACCOUNTS)
    expect(focusCapacityFor(1)).toBe(FOCUS_MAX_ACCOUNTS)
  })

  it('grandit avec le nombre de commerciaux de l’espace — jamais hardcodé pour tous', () => {
    expect(focusCapacityFor(3)).toBe(FOCUS_MAX_ACCOUNTS * 3)
  })

  it('le plafond du board accepte le plafond calculé, pas seulement le défaut', () => {
    expect(canEnterFocus(20, focusCapacityFor(3)).allowed).toBe(true)
    expect(canEnterFocus(24, focusCapacityFor(3)).allowed).toBe(false)
  })
})

describe('FOCUS_STALE_DAYS (#3262.25)', () => {
  it('nomme le même délai que l’évènement thirty_days_idle', () => {
    expect(FOCUS_STALE_DAYS).toBe(30)
    expect(SPRINT_EVENTS).toContain('thirty_days_idle')
  })
})

describe('#3257.8 — les mouvements nommés vers et depuis watch / partner_route', () => {
  it('réveille un compte en veille quand sa condition de réveil est remplie — proposé, nommé', () => {
    const move = shouldSwitch('watch', 'wake_condition_met')
    expect(move).toMatchObject({ to: 'extension', automatic: false })
    expect(move?.reason).toMatch(/condition de réveil/)
  })

  it('réveille aussi un compte en veille sur un signal fort', () => {
    expect(shouldSwitch('watch', 'strong_signal')).toMatchObject({ to: 'extension', automatic: false })
  })

  it('propose la route partenaire depuis chaque niveau d’effort actif, jamais toute seule', () => {
    for (const level of ['focus', 'extension', 'volume', 'watch'] as const) {
      expect(shouldSwitch(level, 'partner_access_found')).toMatchObject({ to: 'partner_route', automatic: false })
    }
  })

  it('ne propose pas la route partenaire à un compte déjà dessus, ni à un compte écarté', () => {
    expect(shouldSwitch('partner_route', 'partner_access_found')).toBeNull()
    expect(shouldSwitch('no_go', 'partner_access_found')).toBeNull()
  })

  it('ne réveille pas ce qui n’est pas en veille', () => {
    for (const level of SPRINT_LEVELS.filter(l => l !== 'watch')) {
      expect(shouldSwitch(level, 'wake_condition_met')).toBeNull()
    }
  })

  it('chaque bascule nouvelle porte un nom (une raison lisible), jamais silencieuse', () => {
    for (const level of SPRINT_LEVELS) {
      for (const event of ['wake_condition_met', 'partner_access_found'] as const) {
        const move = shouldSwitch(level, event)
        if (move) expect(move.reason.length).toBeGreaterThan(10)
      }
    }
  })
})

describe('noGoMessageRefusal (#3405.3)', () => {
  it('refuse sur no_go et cite le motif quand il existe', () => {
    expect(noGoMessageRefusal('no_go', 'budget gelé')).toBe(
      'Ce compte est en NO-GO (budget gelé) : pas de relance sans nouveau motif.',
    )
    expect(noGoMessageRefusal('no_go', null)).toBe('Ce compte est en NO-GO : pas de relance sans nouveau motif.')
  })

  it('ne refuse aucun autre niveau, ni une absence de niveau — sait dire NON', () => {
    for (const sprint of ['focus', 'extension', 'volume', 'watch', 'partner_route', null, undefined]) {
      expect(noGoMessageRefusal(sprint, 'motif')).toBeNull()
    }
  })
})
