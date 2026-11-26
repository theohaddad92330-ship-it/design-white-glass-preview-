import { DEMO_RECETTE_X77_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * Lot X77 (03/10) — le cas « entités repérées par l'analyse, non déclarées » (#3473) doit
 * être recettable en démo : un compte dont `raw_analysis.entities_exhaustive` nomme des
 * entités, sans aucun contact pour les déclarer (`account_entities` se dérive des contacts).
 *
 * Décision Louis 04/10/2026 — le compte fictif (une commune) qui le portait a quitté la
 * salle : le cas est RECALCULÉ sur les vrais dossiers, jamais relu d'une constante.
 */
const normalize = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const entitiesSpottedNotDeclared = DEMO_DOSSIERS.filter(dossier => {
  const spotted = dossier.account.raw_analysis['entities_exhaustive']
  if (!Array.isArray(spotted) || spotted.length < 2) return false
  const declared = new Set(dossier.contacts.map(contact => normalize(contact.entity ?? '')))
  return spotted.every(
    entity =>
      typeof entity === 'object' &&
      entity !== null &&
      !declared.has(normalize(String((entity as { name?: unknown }).name ?? ''))),
  )
})

describe('couverture démo — restes de la recette Y20-Y22 (lot X77)', () => {
  it('#3473 — au moins un VRAI dossier porte des entités repérées et aucun contact pour les déclarer', () => {
    expect(entitiesSpottedNotDeclared.map(dossier => dossier.account.company_name).length).toBeGreaterThanOrEqual(1)
    for (const dossier of entitiesSpottedNotDeclared) expect(dossier.account.company_name).not.toMatch(/exemple/i)
  })

  it('classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_RECETTE_X77_COVERAGE.state).toBe('seede')
    expect(DEMO_RECETTE_X77_COVERAGE.reason.length).toBeGreaterThan(150)
  })
})
