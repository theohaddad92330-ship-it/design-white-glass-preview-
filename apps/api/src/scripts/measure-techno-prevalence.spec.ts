import { TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS } from '@bellum/contracts'
import { formatReport, toFrequencyMap, type StackFrequencyRow } from './measure-techno-prevalence'

/** Un corpus synthétique dont la distribution est CONNUE. */
function frequencyOf(...groups: { companies: number; count: number }[]): Map<string, number> {
  const frequency = new Map<string, number>()
  let index = 0
  for (const group of groups) {
    for (let i = 0; i < group.count; i += 1) frequency.set(`techno-${(index += 1)}`, group.companies)
  }
  return frequency
}

function spread(): Map<string, number> {
  const frequency = new Map<string, number>()
  for (let i = 1; i <= TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS * 3; i += 1) frequency.set(`techno-${i}`, i)
  return frequency
}

describe('toFrequencyMap — la projection LUE depuis les piles observées', () => {
  it('convertit le `count` (string Postgres) en nombre, et plie la casse', () => {
    const rows: StackFrequencyRow[] = [{ techno: ' Spark ', companies: '42' }]
    expect(toFrequencyMap(rows)).toEqual({ frequency: new Map([['spark', 42]]), unreadable: 0 })
  })

  it('ÉCARTE une ligne illisible plutôt que de la compter pour zéro, et le DIT', () => {
    const rows: StackFrequencyRow[] = [
      { techno: 'java', companies: 'n/a' },
      { techno: '', companies: '7' },
      { techno: 'aws', companies: '0' },
      { techno: 'kafka', companies: '3' },
    ]
    const read = toFrequencyMap(rows)
    expect(read.frequency).toEqual(new Map([['kafka', 3]]))
    expect(read.unreadable).toBe(3)
  })

  it('ADDITIONNE deux graphies qui se plient sur le même libellé', () => {
    const rows: StackFrequencyRow[] = [
      { techno: 'Spark', companies: '10' },
      { techno: 'spark ', companies: '5' },
    ]
    expect(toFrequencyMap(rows).frequency.get('spark')).toBe(15)
  })
})

describe('formatReport — ce que rend le script contre une base réelle', () => {
  it('un corpus VIDE se dit, il ne rend pas une échelle', () => {
    const lines = formatReport(new Map(), 0)
    expect(lines.join('\n')).toContain('Aucune technologie mesurable')
  })

  it('nomme le REFUS et sa raison quand le corpus ne permet pas trois paliers', () => {
    const lines = formatReport(frequencyOf({ companies: 1, count: 60 }, { companies: 2, count: 30 }), 0).join('\n')
    expect(lines).toContain('ÉCHELLE REFUSÉE')
    expect(lines).toContain('majorityTier')
    expect(lines).toContain('MUET')
  })

  it('rend l’échelle CALCULÉE et une répartition qui S’ADDITIONNE', () => {
    const lines = formatReport(spread(), 0)
    const joined = lines.join('\n')
    expect(joined).toContain('Échelle CALCULÉE')
    expect(joined).toContain('rare 30')
    expect(joined).toContain('specialisee 30')
    expect(joined).toContain('courante 30')
    expect(joined).toContain(`(total ${TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS * 3})`)
    expect(joined).not.toContain('INCOHÉRENT')
  })

  it('affiche le nombre de lignes écartées — un rejet silencieux n’est pas une mesure', () => {
    expect(formatReport(spread(), 4).join('\n')).toContain('lignes illisibles écartées 4')
  })
})
