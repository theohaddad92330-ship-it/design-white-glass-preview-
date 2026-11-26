import { describe, expect, it } from 'vitest'
import { getPlans, type PlanCatalog } from '@/lib/plans'

/** Un catalogue où les trois paliers portent la MÊME grille — l'état dans lequel
 *  la production s'est retrouvée après le seed « tout ouvert » d'origine. */
const FLAT_CATALOG: PlanCatalog = {
  starter: {
    label: 'Starter-Solo',
    price: 11900,
    accounts_limit: 35,
    enrichment_credits: 0,
    seats: 1,
    extra_seat_price: 2900,
    features: ['exports', 'chat_ai', 'crm_sync'],
  },
  team: {
    label: 'Team',
    price: 25900,
    accounts_limit: 150,
    enrichment_credits: 0,
    seats: 3,
    extra_seat_price: 5900,
    features: ['exports', 'chat_ai', 'crm_sync'],
  },
  growth: {
    label: 'Growth',
    price: 59900,
    accounts_limit: 420,
    enrichment_credits: 0,
    seats: 8,
    extra_seat_price: 9900,
    features: ['exports', 'chat_ai', 'crm_sync'],
  },
}

describe('cartes de facturation — ce que chaque palier ajoute', () => {
  it('ne promet pas « Tout Team, plus : » quand il n’y a rien après', () => {
    // C'est exactement ce qu'affichait la production : une promesse suivie du
    // vide, qui se lit comme un écran cassé.
    const [, team, growth] = getPlans(FLAT_CATALOG)
    for (const plan of [team!, growth!]) {
      expect(plan.features.some(line => line.includes('Tout '))).toBe(false)
    }
  })

  it('liste les ajouts du palier quand il y en a', () => {
    const catalog: PlanCatalog = {
      ...FLAT_CATALOG,
      starter: { ...FLAT_CATALOG.starter!, features: ['exports'] },
      team: { ...FLAT_CATALOG.team!, features: ['exports', 'chat_ai'] },
    }
    const [, team] = getPlans(catalog)
    const lines = team!.features.join(' | ')
    expect(lines).toContain('Starter-Solo')
    expect(lines).toContain('Laura')
    // Ce qui est hérité n'est pas réénuméré : la carte vend la MARCHE.
    expect(team!.features.filter(line => line.includes('Exports'))).toEqual([])
  })

  it('ne répète pas les exports sur Starter-Solo (socle vs grille)', () => {
    const [starter] = getPlans({ ...FLAT_CATALOG, starter: { ...FLAT_CATALOG.starter!, features: ['exports'] } })
    const exportLines = starter!.features.filter(line => line.toLowerCase().includes('export'))
    expect(exportLines).toHaveLength(1)
  })
})
