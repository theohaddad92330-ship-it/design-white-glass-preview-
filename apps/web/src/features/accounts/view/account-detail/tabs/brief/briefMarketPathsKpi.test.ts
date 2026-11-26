import { describe, expect, it } from 'vitest'
import { plainMarketPathsKpi } from './briefMarketPathsKpi'

const kpi = (label: string, caption?: string) => ({ label, value: 65, ...(caption === undefined ? {} : { caption }) })
const WORDS = {
  label: 'PARCOURS DE CONSULTANTS OBSERVÉS',
  caption: 'Consultants passés par ce compte, lus dans le marché',
}

describe('#4322.1 — la tuile de parcours dit ce qu’elle mesure', () => {
  it('« CHEMINS DE MARCHÉ OBSERVÉS » devient des parcours de consultants passés par le compte', () => {
    const [out] = plainMarketPathsKpi(
      [kpi('CHEMINS DE MARCHÉ OBSERVÉS', 'Profils liés au compte identifiés sur le marché')],
      WORDS,
    )
    expect(out?.label).toBe(WORDS.label)
    expect(out?.caption).toBe(WORDS.caption)
    expect(out?.value).toBe(65)
  })

  it('sait dire NON : une autre tuile reste telle quelle', () => {
    const tiles = [kpi('SITES'), kpi('CHEMIN D’ACCÈS RECOMMANDÉ'), kpi('PRIX MÉDIAN')]
    expect(plainMarketPathsKpi(tiles, WORDS)).toEqual(tiles)
  })
})
