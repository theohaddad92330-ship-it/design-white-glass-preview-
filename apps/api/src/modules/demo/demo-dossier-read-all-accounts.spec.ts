import { DOSSIER_SCORE_AXES, parseAccountAnalysis } from '@bellum/contracts'
import { DEMO_ANALYSED_ACCOUNTS, DEMO_DOSSIERS, DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'

/**
 * Louis 14/10/2026 (« go pour tout ») — en démo, AUCUN compte n'affiche « antérieure à la lecture en sept axes » ni
 * « antérieure à la grille de fiabilité » : chaque compte porte `evaluation.dossier_read` (sept axes nommés) ET
 * `data_confidence`. Un axe sans source reste « inconnu » et NOMMÉ — jamais inventé, jamais un zéro.
 */
type Raw = Record<string, unknown>
const all: { name: string; raw: Raw }[] = [
  ...DEMO_DOSSIERS.map(dossier => ({
    name: dossier.account.company_name,
    raw: (dossier.account.raw_analysis ?? {}) as Raw,
  })),
  ...DEMO_EXTENSION_ACCOUNTS.map(account => ({ name: account.company_name, raw: (account.raw_analysis ?? {}) as Raw })),
  ...DEMO_ANALYSED_ACCOUNTS.map(account => ({ name: account.company_name, raw: (account.raw_analysis ?? {}) as Raw })),
]

const readOf = (raw: Raw) => {
  const analysis = parseAccountAnalysis(raw)
  return analysis.evaluation?.dossier_read ?? analysis.plan?.evaluation?.dossier_read ?? null
}

describe('démo — chaque compte porte la lecture en sept axes et la fiabilité du dossier', () => {
  it('la salle compte plus de dix comptes', () => {
    expect(all.length).toBeGreaterThan(10)
  })

  it('aucun compte sans dossier_read à sept axes écrits (pas seulement complétés à la lecture)', () => {
    const missing = all
      .filter(({ raw }) => {
        const keys = new Set((readOf(raw)?.axes ?? []).map(axis => axis.key))
        return DOSSIER_SCORE_AXES.some(key => !keys.has(key))
      })
      .map(({ name }) => name)
    expect(missing).toEqual([])
  })

  it('aucun compte sans data_confidence numérique', () => {
    const missing = all
      .filter(({ raw }) => typeof parseAccountAnalysis(raw).data_confidence !== 'number')
      .map(({ name }) => name)
    expect(missing).toEqual([])
  })

  it('un axe inconnu n’a jamais de valeur (jamais un zéro déguisé) et dit pourquoi', () => {
    for (const { name, raw } of all) {
      for (const axis of readOf(raw)?.axes ?? []) {
        if (axis.state !== 'unknown') continue
        expect({ name, key: axis.key, value: axis.value ?? null }).toEqual({ name, key: axis.key, value: null })
        expect({ name, key: axis.key, impact: typeof axis.impact }).toEqual({ name, key: axis.key, impact: 'string' })
      }
    }
  })
})
