import { describe, expect, it } from 'vitest'
import type { MarketBrief } from '../schemas/market-brief.js'
import { marketBriefSchema } from '../schemas/market-brief.js'
import lille from './lille.fixture.json' with { type: 'json' }
import { checkMarketBrief } from './controls.js'
import type { MarketBriefViolationCode } from './controls.js'

const base = (): MarketBrief => marketBriefSchema.parse(structuredClone(lille))
const codes = (brief: MarketBrief): MarketBriefViolationCode[] => checkMarketBrief(brief).map(v => v.code)
/** Un brief construit en code avant tout parse : le contrôle doit tenir sans le schéma. */
const unparsed = (value: unknown): MarketBrief => value as MarketBrief

describe('checkMarketBrief — le marché de Lille', () => {
  it('est VERT : aucune violation', () => {
    expect(checkMarketBrief(base())).toEqual([])
  })

  it('ne reproche PAS les personnes en clair, ni leur e-mail (D5)', () => {
    const brief = base()
    brief.people[0] = { ...brief.people[0]!, mobile: '06 12 34 56 78', phone: '03 20 00 00 00' }
    expect(checkMarketBrief(brief)).toEqual([])
  })
})

describe('SCOPE_MIXED', () => {
  it('un canton dans une zone france est rouge', () => {
    const brief = base()
    brief.zone.cantons = ['VD']
    expect(codes(brief)).toContain('SCOPE_MIXED')
  })

  it('un département dans une zone suisse est rouge', () => {
    const brief = base()
    brief.zone.scope = 'suisse'
    brief.zone.cantons = ['VD']
    expect(codes(brief)).toContain('SCOPE_MIXED')
  })

  it('un code canton rangé parmi les départements est rouge, même sans canton déclaré', () => {
    const brief = base()
    brief.zone.departments = ['59', 'VD']
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'SCOPE_MIXED', path: 'zone.departments[1]' }),
    )
  })

  it('tient sur un brief non parsé', () => {
    expect(codes(unparsed({ zone: { scope: 'france', departments: ['59'], cantons: ['GE'] } }))).toContain(
      'SCOPE_MIXED',
    )
  })
})

describe('CURRENCY_SCOPE', () => {
  it('du CHF sur une zone france est rouge', () => {
    const brief = base()
    brief.price_grid!.currency = 'CHF'
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'CURRENCY_SCOPE', path: 'price_grid.currency' }),
    )
  })

  it('de l’EUR sur une zone france est vert', () => {
    expect(codes(base())).not.toContain('CURRENCY_SCOPE')
  })

  it('de l’EUR sur une zone suisse est rouge : une zone suisse se chiffre en CHF', () => {
    const brief = base()
    brief.zone = { ...brief.zone, scope: 'suisse', departments: [], cantons: ['VD'] }
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'CURRENCY_SCOPE', path: 'price_grid.currency' }),
    )
  })

  it('du CHF sur une zone suisse est vert', () => {
    const brief = base()
    brief.zone = { ...brief.zone, scope: 'suisse', departments: [], cantons: ['VD'] }
    brief.price_grid!.currency = 'CHF'
    expect(codes(brief)).not.toContain('CURRENCY_SCOPE')
  })
})

describe('PRICE_CELL_UNDERSAMPLED — n < 3 ⇒ la cellule est ABSENTE, jamais 0', () => {
  it('une cellule à n=2 PRÉSENTE est rouge', () => {
    const brief = base()
    brief.price_grid!.rows[2]!.junior = { amount: 578, n: 2 }
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'PRICE_CELL_UNDERSAMPLED', path: 'price_grid.rows[2].junior' }),
    )
  })

  it('une cellule à n=0 affichée comme 0 est rouge', () => {
    const brief = base()
    brief.price_grid!.rows[1]!.junior = { amount: 0, n: 0 }
    expect(codes(brief)).toContain('PRICE_CELL_UNDERSAMPLED')
  })

  it('une cellule à n=3 est verte, une cellule absente aussi', () => {
    const brief = base()
    brief.price_grid!.rows[1]!.junior = { amount: 455, n: 3 }
    expect(codes(brief)).not.toContain('PRICE_CELL_UNDERSAMPLED')
  })
})

describe('PRICE_GRID_CONCENTRATED_UNSAID', () => {
  it('un client à plus de 50 % de l’échantillon, sans garde-fou qui le nomme, est rouge', () => {
    const brief = base()
    brief.guardrails = [{ point: 'Prix', detail: 'Besoins 2021-2024 uniquement.' }]
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'PRICE_GRID_CONCENTRATED_UNSAID', path: 'price_grid.top_client' }),
    )
  })

  it('le même client, nommé par un garde-fou, est vert', () => {
    expect(codes(base())).not.toContain('PRICE_GRID_CONCENTRATED_UNSAID')
  })

  it('un client à 50 % pile n’est pas « concentré » (strictement plus de la moitié)', () => {
    const brief = base()
    brief.price_grid!.top_client = { name: 'ADEO', n: 115.5 }
    brief.guardrails = [{ point: 'Prix', detail: 'Besoins 2021-2024.' }]
    expect(codes(brief)).not.toContain('PRICE_GRID_CONCENTRATED_UNSAID')
  })

  it('un client minoritaire n’exige rien', () => {
    const brief = base()
    brief.price_grid!.top_client = { name: 'ADEO', n: 40 }
    brief.guardrails = [{ point: 'Prix', detail: 'Besoins 2021-2024.' }]
    expect(codes(brief)).not.toContain('PRICE_GRID_CONCENTRATED_UNSAID')
  })
})

describe('COVERAGE_AS_MARKET (GA-259) — un taux de couverture mesure ce qu’on SAIT', () => {
  it('« le marché externalise 59 % » est rouge', () => {
    const brief = base()
    brief.what_i_know[1] = { ...brief.what_i_know[1]!, meaning: 'Le marché lillois externalise 59 % de ses besoins.' }
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'COVERAGE_AS_MARKET', path: 'what_i_know[1].meaning' }),
    )
  })

  it('« 41 % n’externalisent pas » (la négation aussi) est rouge', () => {
    const brief = base()
    brief.kpis[0] = { label: 'Comptes', value: '41 % n’externalisent pas' }
    expect(codes(brief)).toContain('COVERAGE_AS_MARKET')
  })

  it('le vocabulaire sous-traitance / outsourcing est attrapé aussi', () => {
    const brief = base()
    brief.kpis[0] = { label: 'Sous-traitance', value: '59 %' }
    expect(codes(brief)).toContain('COVERAGE_AS_MARKET')
    brief.kpis[0] = { label: 'Outsourcing rate', value: '59%' }
    expect(codes(brief)).toContain('COVERAGE_AS_MARKET')
  })

  it('la formulation POSITIVE de couverture est verte', () => {
    expect(codes(base())).not.toContain('COVERAGE_AS_MARKET')
  })

  it('le mot sans pourcentage n’est pas attrapé', () => {
    const brief = base()
    brief.what_i_know[0] = { ...brief.what_i_know[0]!, meaning: 'Les ESN externalisent des profils de développement.' }
    expect(codes(brief)).not.toContain('COVERAGE_AS_MARKET')
  })

  it('un garde-fou a le droit de NOMMER l’interdit', () => {
    const brief = base()
    brief.guardrails.push({ point: 'Couverture', detail: 'Ne jamais lire 59 % comme « le marché externalise 59 % ».' })
    expect(codes(brief)).not.toContain('COVERAGE_AS_MARKET')
  })
})

describe('PROBABILITY_WORDING — aucune probabilité (doctrine c26)', () => {
  it('une « chance de closing » est rouge', () => {
    const brief = base()
    brief.what_i_know[0] = { ...brief.what_i_know[0]!, meaning: 'Chance de closing élevée sur ADEO.' }
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'PROBABILITY_WORDING', path: 'what_i_know[0].meaning' }),
    )
  })

  it('« probabilité », « taux de réussite estimé », « win probability » sont rouges', () => {
    for (const label of [
      'Probabilité de signature',
      'Taux de réussite estimé',
      'Win probability',
      'Prévisionnel pondéré',
    ]) {
      const brief = base()
      brief.kpis[0] = { label, value: 1 }
      expect(codes(brief), label).toContain('PROBABILITY_WORDING')
    }
  })

  it('lit aussi les textes des tableaux de clients et de règles', () => {
    const brief = base()
    brief.rules![0] = { ...brief.rules![0]!, meaning: 'Forte probabilité de signer.' }
    expect(checkMarketBrief(brief)).toContainEqual(
      expect.objectContaining({ code: 'PROBABILITY_WORDING', path: 'rules[0].meaning' }),
    )
  })

  it('un brief sans ce vocabulaire est vert', () => {
    expect(codes(base())).not.toContain('PROBABILITY_WORDING')
  })
})
