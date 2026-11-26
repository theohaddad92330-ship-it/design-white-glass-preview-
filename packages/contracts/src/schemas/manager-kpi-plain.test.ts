import { describe, expect, it } from 'vitest'
import { MANAGER_KPIS } from './manager-kpi.js'
import { KPI_PLAIN_FORMULAS, KPI_SOURCE_WORDS } from './manager-kpi-plain.js'

// Ce que l'écran ne doit jamais montrer : SQL, appels de fonction, identifiants
// en snake_case, colonnes `table.colonne`.
const TECHNICAL = /\b[a-z]+_[a-z_]+\b|\b[a-z]+\.[a-z_]+\b|\b(COUNT|SUM|MAX|median|WHERE|GROUP BY|NULL)\b|\w\(/

describe('formule et source en langage métier (#3529)', () => {
  it('chaque indicateur a une formule et une source sans identifiant technique, en FR et EN', () => {
    const offenders: string[] = []
    for (const kpi of MANAGER_KPIS) {
      const texts = [kpi.formulaPlain.fr, kpi.formulaPlain.en, kpi.sourcePlain?.fr ?? '', kpi.sourcePlain?.en ?? '']
      texts.forEach(text => {
        if (TECHNICAL.test(text)) offenders.push(`${kpi.key}: ${text}`)
      })
      expect(kpi.formulaPlain.fr.length).toBeGreaterThan(10)
      expect(kpi.formulaPlain.en.length).toBeGreaterThan(10)
    }
    expect(offenders).toEqual([])
  })

  // #3529 (recette 02/10) — la formule et la source étaient en phrase, mais la définition, le seuil, la décision et
  // la RAISON d'un indicateur à venir citaient encore `revenue_produced` / `pipeline_amount` / `account_id`.
  it('tout ce que le dictionnaire affiche d’un indicateur est sans identifiant technique', () => {
    const offenders: string[] = []
    for (const kpi of MANAGER_KPIS) {
      const texts = [kpi.definition, kpi.threshold, kpi.decision, kpi.unmeasurableReason ?? '']
      texts.forEach(text => {
        if (TECHNICAL.test(text) || text.includes('`')) offenders.push(`${kpi.key}: ${text}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('une source brute ⇒ une source lisible ; sans source brute, aucune source inventée', () => {
    for (const kpi of MANAGER_KPIS) {
      if (kpi.source) expect(kpi.sourcePlain?.fr).toBeTruthy()
      else expect(kpi.sourcePlain).toBeNull()
    }
  })

  it('la garde sait dire NON : elle attrape du SQL et un nom de table', () => {
    expect(TECHNICAL.test('COUNT(accounts) dont priority_gate')).toBe(true)
    expect(TECHNICAL.test('accounts, decision_gate_crossings')).toBe(true)
    expect(TECHNICAL.test('Comptes passés en priorisé pendant la période.')).toBe(false)
  })

  it('aucune entrée orpheline dans les deux dictionnaires', () => {
    const keys = new Set(MANAGER_KPIS.map(kpi => kpi.key))
    expect(Object.keys(KPI_PLAIN_FORMULAS).filter(key => !keys.has(key))).toEqual([])
    const used = new Set(MANAGER_KPIS.flatMap(kpi => (kpi.source ?? '').split(',').map(s => s.trim())))
    expect(Object.keys(KPI_SOURCE_WORDS).filter(word => !used.has(word))).toEqual([])
  })
})
