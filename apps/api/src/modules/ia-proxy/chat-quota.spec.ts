import { SHIPPED_PLAN_CODES, SHIPPED_PLAN_GRID } from '@bellum/contracts'
import {
  CHAT_FALLBACK_DAILY_LIMIT,
  chatTitleDailyCap,
  PRECISION_HOP_DIVISOR,
  QUOTA_WINDOW_MS,
  chatDailyLimitOfPlan,
  countableMessages,
  isChatQuotaExempt,
  effectiveChatDailyLimit,
  isChatQuotaLow,
  precisionHopCeiling,
  quotaReopensAt,
} from './chat-quota'

// décision Louis 13/09 batch 13 — plafond selon le plan
describe('plafond du copilote — selon le plan', () => {
  describe('chatDailyLimitOfPlan — la valeur lue dans la grille des plans', () => {
    it('lit un corpus non vide', () => {
      expect(SHIPPED_PLAN_CODES.length).toBeGreaterThanOrEqual(6)
    })

    it.each(SHIPPED_PLAN_CODES)('%s : la valeur de la grille, aucune autre', code => {
      expect(chatDailyLimitOfPlan(code)).toBe(SHIPPED_PLAN_GRID[code].chatDailyMessageLimit)
    })

    it.each([null, undefined, '', 'platinum', 'constructor', '__proto__', 'toString'])(
      'plan inconnu ou illisible (%p) : aucune valeur de plan',
      plan => {
        expect(chatDailyLimitOfPlan(plan)).toBeNull()
      },
    )
  })

  describe('effectiveChatDailyLimit — le minimum du plan et du plafond opérateur', () => {
    it('le plafond du plan quand il est sous le plafond opérateur', () => {
      expect(effectiveChatDailyLimit({ operatorLimit: 50, planLimit: 20 })).toEqual({ limit: 20, source: 'plan' })
    })

    it('deux plans, deux plafonds', () => {
      expect(effectiveChatDailyLimit({ operatorLimit: 500, planLimit: 30 })).toEqual({ limit: 30, source: 'plan' })
      expect(effectiveChatDailyLimit({ operatorLimit: 500, planLimit: 120 })).toEqual({ limit: 120, source: 'plan' })
    })

    it('le plafond opérateur borne un plan plus généreux : c’est un plafond de SÉCURITÉ', () => {
      expect(effectiveChatDailyLimit({ operatorLimit: 50, planLimit: 200 })).toEqual({ limit: 50, source: 'operator' })
    })

    // ⚠️ #4016 L7 — décision Louis 11/10/2026 : LE PLAN FAIT FOI. Ce test
    // disait l'inverse (« Growth à 100 reste borné par le défaut opérateur 50 »).
    // Le défaut a disparu : sans plafond opérateur POSÉ, le plan s'applique tel quel.
    it('Growth à 100 : sans plafond opérateur posé, c’est le plan qui s’applique', () => {
      const growth = SHIPPED_PLAN_GRID.growth.chatDailyMessageLimit
      expect(growth).toBe(100)
      expect(effectiveChatDailyLimit({ operatorLimit: null, planLimit: growth })).toEqual({
        limit: 100,
        source: 'plan',
      })
      // Un plafond opérateur POSÉ plus bas reste un plafond de sécurité.
      expect(effectiveChatDailyLimit({ operatorLimit: 50, planLimit: growth })).toEqual({
        limit: 50,
        source: 'operator',
      })
    })

    it('à égalité, c’est le plafond du plan qui s’applique', () => {
      expect(effectiveChatDailyLimit({ operatorLimit: 50, planLimit: 50 })).toEqual({ limit: 50, source: 'plan' })
    })

    it.each([null, 0, -3, Number.NaN, Number.POSITIVE_INFINITY, 12.5])(
      'plan sans valeur lisible (%p) : le plafond opérateur — jamais 0, jamais l’illimité',
      planLimit => {
        expect(effectiveChatDailyLimit({ operatorLimit: 50, planLimit })).toEqual({ limit: 50, source: 'operator' })
      },
    )

    it.each([0, -1])('plafond opérateur à %p : la borne entière est désactivée, comme avant', operatorLimit => {
      expect(effectiveChatDailyLimit({ operatorLimit, planLimit: 20 })).toBeNull()
    })
  })

  // #4016 L7 — décision Louis 11/10/2026 : le plan fait foi, le plafond
  // opérateur est OPTIONNEL. La garde du lot : l'absence de plafond opérateur
  // n'ouvre JAMAIS l'illimité.
  describe('sans plafond opérateur posé — le plan fait foi', () => {
    it.each([null, undefined, Number.NaN])('opérateur %p : le plafond du plan, source plan', operatorLimit => {
      expect(effectiveChatDailyLimit({ operatorLimit, planLimit: 300 })).toEqual({ limit: 300, source: 'plan' })
    })

    it.each(SHIPPED_PLAN_CODES)('%s : la valeur de la grille, jamais plus', code => {
      const planLimit = chatDailyLimitOfPlan(code)
      expect(effectiveChatDailyLimit({ operatorLimit: null, planLimit })).toEqual({
        limit: SHIPPED_PLAN_GRID[code].chatDailyMessageLimit,
        source: 'plan',
      })
    })

    it.each([null, 0, -3, 12.5])(
      'plan illisible (%p) ET aucun opérateur : le plus BAS de la grille — jamais 0, jamais l’illimité',
      planLimit => {
        const lowest = Math.min(...SHIPPED_PLAN_CODES.map(code => SHIPPED_PLAN_GRID[code].chatDailyMessageLimit))
        expect(CHAT_FALLBACK_DAILY_LIMIT).toBe(lowest)
        expect(effectiveChatDailyLimit({ operatorLimit: null, planLimit })).toEqual({
          limit: lowest,
          source: 'operator',
        })
      },
    )
  })

  describe('chatTitleDailyCap — la borne des titres rédigés par Laura', () => {
    it('le plafond opérateur quand il est posé', () => {
      expect(chatTitleDailyCap(80)).toBe(80)
    })

    it('0 : aucune borne, comme le chat', () => {
      expect(chatTitleDailyCap(0)).toBeNull()
    })

    it.each([null, undefined, Number.NaN])(
      'opérateur %p : le plus HAUT plafond de la grille — jamais l’illimité',
      operatorLimit => {
        const highest = Math.max(...SHIPPED_PLAN_CODES.map(code => SHIPPED_PLAN_GRID[code].chatDailyMessageLimit))
        expect(chatTitleDailyCap(operatorLimit)).toBe(highest)
      },
    )
  })
})

/**
 * Ce que le plafond quotidien COMPTE — et le seul risque de ce lot, qui est
 * l'exonération qui déborde, jamais l'inverse.
 */
describe('plafond du copilote — ce qui compte', () => {
  it('un message ordinaire compte : sans aucun saut, le comptage est le brut', () => {
    expect(countableMessages({ total: 37, exempt: 0, limit: 50 })).toBe(37)
  })

  it('une réponse à une question de Laura ne compte pas', () => {
    expect(countableMessages({ total: 40, exempt: 3, limit: 50 })).toBe(37)
  })

  it("l'exonération est PLAFONNÉE : au-delà, tout recompte", () => {
    // Louis a mesuré « une demande sur trois ». Au-delà de cette part, ce n'est
    // plus Laura qui provoque l'aller-retour.
    const limit = 50
    const ceiling = precisionHopCeiling(limit)
    expect(ceiling).toBe(Math.ceil(limit / PRECISION_HOP_DIVISOR))
    expect(countableMessages({ total: 100, exempt: 100, limit })).toBe(100 - ceiling)
  })

  it('ne rend jamais un nombre négatif : un comptage ne descend pas sous zéro', () => {
    expect(countableMessages({ total: 2, exempt: 5, limit: 50 })).toBe(0)
  })

  it("un comptage IMPOSSIBLE n'est pas « zéro message consommé »", () => {
    // « Non mesuré » n'est jamais « 0 » : rendre 0 ici rouvrirait le plafond en
    // grand le jour où la base ne répond pas.
    expect(() => countableMessages({ total: Number.NaN, exempt: 0, limit: 50 })).toThrow()
    expect(() => countableMessages({ total: 10, exempt: Number.NaN, limit: 50 })).toThrow()
  })

  it("un plafond sans borne (0) n'exonère rien non plus — il ne compare pas", () => {
    // Le zéro-désactive vit dans l'appelant ; ici, la dérivation reste totale.
    expect(precisionHopCeiling(0)).toBe(0)
    expect(countableMessages({ total: 10, exempt: 10, limit: 0 })).toBe(10)
  })
})

/**
 * #1957.8 — QUAND le plafond se rouvre.
 *
 * La fenêtre est GLISSANTE : le plafond se rouvre à l'instant où assez de
 * demandes sortent des 24 h pour repasser SOUS la borne. Ce n'est pas toujours
 * « la plus ancienne + 24 h » : au-delà du plafond il en faut plusieurs, et une
 * réponse exonérée qui sort ne libère rien tant que les sauts restaient sous
 * leur propre plafond.
 */
describe('#1957.8 — quand le plafond se rouvre', () => {
  const H = 3600_000
  const base = new Date('2026-09-13T12:00:00.000Z').getTime()
  const at = (hoursAgo: number) => new Date(base - hoursAgo * H)
  const plain = (...hoursAgo: number[]) => hoursAgo.map(hours => ({ at: at(hours), exempt: false }))

  it('au plafond pile : quand la plus ANCIENNE demande sort de la fenêtre', () => {
    expect(quotaReopensAt({ stamps: plain(20, 10, 5), limit: 3 })).toEqual(new Date(at(20).getTime() + QUOTA_WINDOW_MS))
  })

  it("l'ordre de lecture ne change rien — le calcul trie", () => {
    expect(quotaReopensAt({ stamps: plain(5, 20, 10), limit: 3 })).toEqual(new Date(at(20).getTime() + QUOTA_WINDOW_MS))
  })

  it('au-delà du plafond (4 pour 3), il faut que DEUX demandes sortent', () => {
    expect(quotaReopensAt({ stamps: plain(20, 15, 10, 5), limit: 3 })).toEqual(
      new Date(at(15).getTime() + QUOTA_WINDOW_MS),
    )
  })

  it('une réponse exonérée qui sort ne rouvre rien tant que le saut restait sous son plafond', () => {
    // Plafond 3 → 1 saut exonéré au plus. 4 lignes dont 1 exonérée = 3 comptées.
    // La sortie de l'exonérée retire 1 ligne ET 1 exonération : toujours 3.
    const stamps = [{ at: at(20), exempt: true }, ...plain(15, 10, 5)]
    expect(quotaReopensAt({ stamps, limit: 3 })).toEqual(new Date(at(15).getTime() + QUOTA_WINDOW_MS))
  })

  it('pas au plafond : aucune heure à annoncer', () => {
    expect(quotaReopensAt({ stamps: plain(20, 10), limit: 3 })).toBeNull()
  })

  it('un plafond sans borne : aucune heure', () => {
    expect(quotaReopensAt({ stamps: plain(20, 10, 5), limit: 0 })).toBeNull()
  })

  it("un horodatage illisible : aucune heure — on ne devine pas l'instant", () => {
    const stamps = [{ at: new Date(Number.NaN), exempt: false }, ...plain(10, 5)]
    expect(quotaReopensAt({ stamps, limit: 3 })).toBeNull()
  })
})

/**
 * #1957.5 — « il te reste peu de demandes ». La même règle que l'annonce
 * « bientôt à court » des crédits (D5, Louis 28/08 : « livrer l'annonce AVANT
 * le mur ») : 80 % consommés, borne INCLUSIVE.
 */
describe('#1957.5 — il reste peu de demandes', () => {
  it('à 80 % consommés pile, l’annonce est due', () => {
    expect(isChatQuotaLow(10, 50)).toBe(true)
  })

  it('juste avant le seuil, rien', () => {
    expect(isChatQuotaLow(11, 50)).toBe(false)
  })

  it('à zéro restant, c’est peu aussi', () => {
    expect(isChatQuotaLow(0, 50)).toBe(true)
  })

  it('un plafond sans borne ne déclenche rien — « non mesuré » n’est pas « épuisé »', () => {
    expect(isChatQuotaLow(0, 0)).toBe(false)
  })
})

describe('isChatQuotaExempt — exemption nominative de l’opérateur (Louis 29/09/2026)', () => {
  it('exempte un id listé, espaces tolérés', () => {
    expect(isChatQuotaExempt('u-2', 'u-1, u-2 ,u-3')).toBe(true)
  })

  it('SAIT DIRE NON — un id absent de la liste reste borné', () => {
    expect(isChatQuotaExempt('u-9', 'u-1,u-2')).toBe(false)
  })

  it('absent, vide ou illisible = personne n’est exempté (jamais l’inverse)', () => {
    expect(isChatQuotaExempt('u-1', '')).toBe(false)
    expect(isChatQuotaExempt('u-1', undefined)).toBe(false)
    expect(isChatQuotaExempt('u-1', 42)).toBe(false)
    expect(isChatQuotaExempt('', ',,')).toBe(false)
  })

  it('n’accepte jamais un préfixe — égalité stricte de l’id', () => {
    expect(isChatQuotaExempt('u-1', 'u-10')).toBe(false)
  })
})
