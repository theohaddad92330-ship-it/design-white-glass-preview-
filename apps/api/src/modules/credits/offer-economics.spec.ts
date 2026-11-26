import {
  OFFER_MARGIN_EXCLUDED_COST_FAMILIES,
  computeOfferEconomics,
  type OfferCatalogEntry,
  type OfferSubscriptionRow,
} from './offer-economics'

/**
 * #1656 — « le catalogue avec, pour chaque offre, ce qu'elle RAPPORTE ».
 *
 * Le test qui tient tout le lot est le premier : **une offre à 0 client rend
 * `null` partout**, jamais 0. Une marge de « 0 % » ou un taux de dépassement de
 * « 0 % » sur une offre que personne n'a prise n'est pas prudent, c'est FAUX.
 *
 * Tous les cas passent `today` en paramètre : un test qui lirait l'horloge
 * passerait à Paris et échouerait en CI (UTC).
 */

/** Le 15 du mois, à midi UTC — un cycle ouvert le 1er est donc EN COURS. */
const TODAY = new Date('2026-09-15T12:00:00.000Z')

/** Un cycle ouvert le 1er septembre : il se referme le 1er octobre. */
const CYCLE_EN_COURS = '2026-09-01T00:00:00.000Z'

/** Un cycle ouvert le 1er juillet : il s'est refermé le 1er août, avant TODAY. */
const CYCLE_TERMINE = '2026-07-01T00:00:00.000Z'

const CATALOGUE: OfferCatalogEntry[] = [
  { key: 'growth', label: 'Growth', priceCents: 19_900, seatPriceCents: 4_900, creditsPerCycle: 250, sortOrder: 3 },
  { key: 'team', label: 'Team', priceCents: 25_900, seatPriceCents: 5_900, creditsPerCycle: 500, sortOrder: 2 },
]

function client(over: Partial<OfferSubscriptionRow> = {}): OfferSubscriptionRow {
  return {
    plan: 'growth',
    billingMode: 'stripe',
    extraSeats: 0,
    creditsUsed: 10,
    capacity: 250,
    periodStart: CYCLE_EN_COURS,
    ...over,
  }
}

function offre(rows: OfferSubscriptionRow[], key = 'growth') {
  const found = computeOfferEconomics({ catalog: CATALOGUE, subscriptions: rows, today: TODAY }).find(
    row => row.key === key,
  )
  if (!found) throw new Error(`offre ${key} absente du résultat`)
  return found
}

describe('computeOfferEconomics — l’économie réelle d’une offre (#1656)', () => {
  describe('une offre à 0 client', () => {
    // ⚠️ LE test de l'issue. Il tient toutes les colonnes dérivées d'un coup.
    const vide = offre([client({ plan: 'team' })])

    it('n’a AUCUNE colonne dérivée — `null` partout, jamais 0', () => {
      expect(vide.customers).toBe(0)
      expect(vide.mrrCents).toBeNull()
      expect(vide.medianCreditsUsed).toBeNull()
      expect(vide.overrunRate).toBeNull()
      expect(vide.margin.rate).toBeNull()
    })

    it('nomme pourquoi chaque colonne est absente — un « — » muet ne s’explique pas', () => {
      expect(vide.medianUnavailable).toBe('no_customers')
      expect(vide.overrunUnavailable).toBe('no_customers')
      expect(vide.margin.blockedReason).toBe('no_customers')
    })

    it('rend quand même le catalogue — prix et crédits ne sont pas des dérivées', () => {
      expect(vide.priceCents).toBe(19_900)
      expect(vide.creditsPerCycle).toBe(250)
    })
  })

  describe('les clients et le MRR', () => {
    it('compte les clients de l’offre, tous modes de facturation confondus', () => {
      const res = offre([client(), client({ billingMode: 'manual' }), client({ plan: 'team' })])
      expect(res.customers).toBe(2)
      expect(res.manualCustomers).toBe(1)
    })

    it('lit le prix du CATALOGUE — jamais une grille recopiée', () => {
      // Le même corpus, un tarif changé : le MRR suit. C'est la propriété que
      // `business-metrics/module-tokens.ts` protège déjà côté MRR global.
      const catalogue = CATALOGUE.map(p => (p.key === 'growth' ? { ...p, priceCents: 29_900 } : p))
      const res = computeOfferEconomics({ catalog: catalogue, subscriptions: [client()], today: TODAY }).find(
        r => r.key === 'growth',
      )
      expect(res?.mrrCents).toBe(29_900)
    })

    it('ajoute les sièges supplémentaires au tarif du siège de CETTE offre', () => {
      expect(offre([client({ extraSeats: 2 })]).mrrCents).toBe(19_900 + 2 * 4_900)
    })

    it('n’inclut PAS un client sur facture dans le MRR — un engagement facturé n’est pas du récurrent', () => {
      // Même règle que `recurringLines` (#1645) : `billing_mode = manual` ne
      // fait jamais de MRR. Il RESTE un client de l'offre, et le MRR mesuré
      // vaut alors 0 — mesuré, pas absent : l'offre a bien des clients.
      const res = offre([client({ billingMode: 'manual' })])
      expect(res.customers).toBe(1)
      expect(res.mrrCents).toBe(0)
    })
  })

  describe('la consommation médiane', () => {
    it('refuse de désigner quelqu’un — sous 3 clients, « trop peu », pas un chiffre', () => {
      const res = offre([client({ creditsUsed: 40 }), client({ creditsUsed: 200 })])
      expect(res.medianCreditsUsed).toBeNull()
      expect(res.medianUnavailable).toBe('too_few_customers')
    })

    it('rend la valeur du milieu à 3 clients', () => {
      const res = offre([client({ creditsUsed: 10 }), client({ creditsUsed: 200 }), client({ creditsUsed: 40 })])
      expect(res.medianCreditsUsed).toBe(40)
      expect(res.medianUnavailable).toBeNull()
    })

    it('moyenne les deux du milieu à 4 clients', () => {
      const res = offre([
        client({ creditsUsed: 10 }),
        client({ creditsUsed: 20 }),
        client({ creditsUsed: 40 }),
        client({ creditsUsed: 200 }),
      ])
      expect(res.medianCreditsUsed).toBe(30)
    })
  })

  describe('le taux de dépassement', () => {
    it('mesure la part des clients qui ont ATTEINT leur plafond', () => {
      const res = offre([
        client({ creditsUsed: 250, capacity: 250 }),
        client({ creditsUsed: 260, capacity: 250 }),
        client({ creditsUsed: 12, capacity: 250, periodStart: CYCLE_TERMINE }),
        client({ creditsUsed: 3, capacity: 250, periodStart: CYCLE_TERMINE }),
      ])
      expect(res.overrunObserved).toBe(2)
      expect(res.overrunEligible).toBe(4)
      expect(res.overrunRate).toBe(0.5)
    })

    it('est un PLANCHER tant qu’un cycle n’est pas fini — quelqu’un peut encore atteindre son plafond', () => {
      const res = offre([client({ creditsUsed: 250 }), client({ creditsUsed: 12 })])
      expect(res.overrunRate).toBe(0.5)
      expect(res.overrunIsFloor).toBe(true)
    })

    it('n’est plus un plancher quand tous les cycles sont refermés', () => {
      const res = offre([
        client({ creditsUsed: 250, periodStart: CYCLE_TERMINE }),
        client({ creditsUsed: 12, periodStart: CYCLE_TERMINE }),
      ])
      expect(res.overrunIsFloor).toBe(false)
    })

    it('un cycle de date inconnue ne se déclare pas refermé', () => {
      // « On ne sait pas » n'est pas « c'est fini ». Une ligne héritée sans
      // `period_start` laisse donc le plancher armé.
      const res = offre([client({ creditsUsed: 250, periodStart: null }), client({ creditsUsed: 12 })])
      expect(res.overrunIsFloor).toBe(true)
    })

    it('une offre sans plafond n’a pas un taux de 100 % — elle n’a pas de taux', () => {
      // `trial` est à zéro crédit depuis le 02/09/2026 : `used >= capacity` y
      // est vrai pour tout le monde, et rendrait « 100 % de dépassement » sur
      // une offre où il n'y a rien à dépasser.
      const res = offre([client({ capacity: 0, creditsUsed: 0 }), client({ capacity: 0, creditsUsed: 0 })])
      expect(res.overrunRate).toBeNull()
      expect(res.overrunUnavailable).toBe('no_cap')
    })

    it('sort du dénominateur les seules lignes sans plafond, pas les autres', () => {
      const res = offre([
        client({ capacity: 0, creditsUsed: 0 }),
        client({ capacity: 250, creditsUsed: 250 }),
        client({ capacity: 250, creditsUsed: 3 }),
      ])
      expect(res.customers).toBe(3)
      expect(res.overrunEligible).toBe(2)
      expect(res.overrunRate).toBe(0.5)
    })

    it('l’horloge est un PARAMÈTRE — le même corpus, deux dates, deux verdicts', () => {
      const rows = [client({ creditsUsed: 12 })]
      const enCours = computeOfferEconomics({ catalog: CATALOGUE, subscriptions: rows, today: TODAY })
      const plusTard = computeOfferEconomics({
        catalog: CATALOGUE,
        subscriptions: rows,
        today: new Date('2026-10-15T12:00:00.000Z'),
      })
      expect(enCours.find(r => r.key === 'growth')?.overrunIsFloor).toBe(true)
      expect(plusTard.find(r => r.key === 'growth')?.overrunIsFloor).toBe(false)
    })
  })

  describe('la marge', () => {
    it('n’est JAMAIS un nombre — le dépôt refuse de convertir une devise', () => {
      const res = offre([client(), client(), client()])
      expect(res.margin.measurable).toBe(false)
      expect(res.margin.rate).toBeNull()
      expect(res.margin.blockedReason).toBe('currency_mismatch')
    })

    it('nomme les postes de coût qu’aucune table du dépôt ne porte', () => {
      expect(OFFER_MARGIN_EXCLUDED_COST_FAMILIES.length).toBeGreaterThan(0)
      expect(offre([client()]).margin.excludedCostFamilies).toBe(OFFER_MARGIN_EXCLUDED_COST_FAMILIES)
    })
  })

  describe('la forme du résultat', () => {
    it('rend UNE ligne par offre du catalogue, dans l’ordre du catalogue', () => {
      const res = computeOfferEconomics({ catalog: CATALOGUE, subscriptions: [], today: TODAY })
      expect(res.map(r => r.key)).toEqual(['team', 'growth'])
    })

    it('ignore une ligne d’abonnement dont le plan n’est pas au catalogue', () => {
      // Un plan retiré du catalogue laisse des lignes derrière lui. Les
      // rattacher à une offre voisine inventerait des clients.
      const res = computeOfferEconomics({
        catalog: CATALOGUE,
        subscriptions: [client({ plan: 'plan-disparu' })],
        today: TODAY,
      })
      expect(res.every(r => r.customers === 0)).toBe(true)
    })
  })
})
