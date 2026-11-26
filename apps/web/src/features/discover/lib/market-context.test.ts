import { describe, expect, it } from 'vitest'
import { EMPTY_MARKET_MEMORY_COVERAGE, type MarketContextMatch, type MarketMemoryCoverage } from '@bellum/contracts'
import discoverEn from '@/i18n/locales/en/discover.json'
import discoverFr from '@/i18n/locales/fr/discover.json'
import { applyEsnOnlyFilter, MARKET_CONTEXT_PRESET_FATES, marketFitFor, sortByCompatibility } from './market-context'

function covered(overrides: Partial<MarketMemoryCoverage> = {}): MarketMemoryCoverage {
  return { ...EMPTY_MARKET_MEMORY_COVERAGE, covered: true, marketPaths: 5, ...overrides }
}

function match(companyName: string, coverage: MarketMemoryCoverage): MarketContextMatch {
  return { companyName, coverage }
}

describe('applyEsnOnlyFilter', () => {
  const withEsn = match('AVEC', covered({ esnObserved: [{ esnName: 'Capgemini', persons: 9, certainty: 'forte' }] }))
  const withoutEsn = match('SANS', covered({ esnObserved: [] }))

  it('laisse tout passer quand `esnOnly` est faux', () => {
    expect(applyEsnOnlyFilter([withEsn, withoutEsn], false)).toEqual([withEsn, withoutEsn])
  })

  it('ne garde que les comptes où un recours externe a été OBSERVÉ', () => {
    expect(applyEsnOnlyFilter([withEsn, withoutEsn], true)).toEqual([withEsn])
  })
})

describe('marketFitFor', () => {
  it('« Non mesuré » sans expertise déclarée — rien à comparer', () => {
    const fit = marketFitFor(covered({ observedStack: [{ techno: 'Java', persons: 10 }] }), [])
    expect(fit).toEqual({ label: 'unmeasured', matched: [] })
  })

  it('« Non mesuré » sans pile ni famille observée — même absence de base, côté compte', () => {
    const fit = marketFitFor(covered({ observedStack: [], roleFamilies: [] }), ['Java'])
    expect(fit).toEqual({ label: 'unmeasured', matched: [] })
  })

  it('« matched » dès qu’UNE expertise déclarée recoupe — jamais de gradation au-dessus (voir marketMemory:fit.noGrade)', () => {
    const fit = marketFitFor(
      covered({
        observedStack: [
          { techno: 'Java', persons: 10 },
          { techno: 'Cloud', persons: 4 },
        ],
      }),
      ['Java', 'Cloud', 'RH'],
    )
    expect(fit.label).toBe('matched')
    expect([...fit.matched].sort()).toEqual(['Cloud', 'Java'])
  })

  it('« matched » à partir d’UNE seule expertise recoupée aussi — même état, pas un palier en dessous', () => {
    const fit = marketFitFor(covered({ observedStack: [{ techno: 'Java', persons: 10 }] }), ['Java', 'RH'])
    expect(fit).toEqual({ label: 'matched', matched: ['Java'] })
  })

  it('un recoupement réellement NUL, avec de la donnée des deux côtés, se range en « Non mesuré » — on ne peut pas affirmer un fit', () => {
    const fit = marketFitFor(covered({ observedStack: [{ techno: 'SAP', persons: 10 }] }), ['RH'])
    expect(fit).toEqual({ label: 'unmeasured', matched: [] })
  })

  it('recoupe aussi les familles de rôles observées, pas seulement la pile technique', () => {
    const fit = marketFitFor(covered({ observedStack: [], roleFamilies: [{ family: 'Data', persons: 4 }] }), ['Data'])
    expect(fit).toEqual({ label: 'matched', matched: ['Data'] })
  })

  it('ne recoupe JAMAIS aucun critère protégé — seules technos et familles de rôles entrent dans la comparaison', () => {
    // Aucun champ de coverage ne porte d'âge, de genre, de photo : la fonction
    // ne LIT que `observedStack`/`roleFamilies`, ce test le fige.
    const fit = marketFitFor(covered({ observedStack: [{ techno: 'Java', persons: 1 }] }), ['Java'])
    expect(Object.keys(fit)).toEqual(['label', 'matched'])
  })
})

describe('sortByCompatibility', () => {
  it('classe les comptes MATCHED avant les NON MESURÉS, jamais par un score composite', () => {
    const matched = match('MATCHED', covered({ observedStack: [{ techno: 'Java', persons: 1 }] }))
    const unmeasured = match('UNMEASURED', covered({ observedStack: [] }))
    const sorted = sortByCompatibility([unmeasured, matched], ['Java'])
    expect(sorted.map(m => m.companyName)).toEqual(['MATCHED', 'UNMEASURED'])
  })

  it('départage à égalité par le nom — deux lectures rendent toujours le même ordre', () => {
    const b = match('B', covered({ observedStack: [] }))
    const a = match('A', covered({ observedStack: [] }))
    expect(sortByCompatibility([b, a], []).map(m => m.companyName)).toEqual(['A', 'B'])
  })
})

describe('#4632 — les quatre préréglages du panneau ont un sort ÉCRIT', () => {
  it('chaque préréglage retiré porte sa raison, et celui qui survit pointe le préréglage du rail', () => {
    const fates = MARKET_CONTEXT_PRESET_FATES
    expect(fates.map(fate => fate.id)).toEqual(['externalRecourse', 'largeAccounts', 'dataRoles', 'cloudEcosystem'])
    for (const fate of fates) expect(fate.why.length).toBeGreaterThan(40)
    expect(fates.find(fate => fate.id === 'externalRecourse')?.railPreset).toBe('externalRecourseObserved')
  })
})

describe('#4632 — le vocabulaire tenu SUIT les champs dans le rail, mot à mot, fr ET en', () => {
  const moved = (catalog: typeof discoverFr) => [
    catalog.rail.roleFamilyObservedLabel,
    catalog.rail.roleFamilyObservedHint,
    catalog.rail.ecosystemObservedLabel,
    catalog.rail.ecosystemObservedHint,
    catalog.rail.keywordsHint,
    catalog.rail.externalRecourseObservedLabel,
    catalog.rail.externalRecourseObservedHint,
    catalog.rail.externalRecourseObservedChip,
    catalog.framing.marketObservedBlock,
    catalog.framing.marketObservedHint,
  ]

  it('« observé », jamais « en place » ; « Écosystèmes liés à », jamais « ESN présente » ni « Clients de »', () => {
    expect(discoverFr.rail.ecosystemObservedLabel).toBe('Écosystèmes liés à')
    expect(discoverEn.rail.ecosystemObservedLabel).toBe('Ecosystems linked to')
    for (const text of moved(discoverFr)) expect(text).not.toMatch(/en place|ESN présente|Clients de/i)
    for (const text of moved(discoverEn)) expect(text).not.toMatch(/in place|ESN present|Clients of/i)
  })

  it('« Recours externe : Observé » seulement — aucun « Non observé » dans les deux catalogues', () => {
    const fr = [discoverFr.rail.externalRecourseObservedLabel, discoverFr.rail.externalRecourseObservedChip]
    const en = [discoverEn.rail.externalRecourseObservedLabel, discoverEn.rail.externalRecourseObservedChip]
    for (const text of fr) expect(text).not.toMatch(/Non observé/i)
    for (const text of en) expect(text).not.toMatch(/Not observed/i)
  })

  it('aucun score 0-100 et aucun fournisseur nommé — « données de marché », jamais la source', () => {
    for (const text of [...moved(discoverFr), ...moved(discoverEn)]) {
      expect(text).not.toMatch(/\/100|\b\d+ ?%/)
      expect(text).not.toMatch(/apollo|lusha|kaspr|pappers|linkedin|indeed|welcome to the jungle|brave|firecrawl/i)
    }
  })
})
