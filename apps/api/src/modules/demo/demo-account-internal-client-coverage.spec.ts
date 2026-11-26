import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INTERNAL_CLIENT_MODES } from '@bellum/contracts'
import { DEMO_ACCOUNT_INTERNAL_CLIENT_COVERAGE, DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #219.6 (#3231, lot X50) — parité démo (craft rule 9) : la déclaration
 * « client interne » est SEMÉE sur le client d'exemple fictif, et l'INSERT de
 * `seedDeliveryClient` l'écrit vraiment (une valeur posée dans le jeu de
 * données mais jamais insérée serait un écran vide en salle).
 */
describe('démo — client interne déclaré', () => {
  it('le client d’exemple porte une valeur du vocabulaire', () => {
    expect(INTERNAL_CLIENT_MODES).toContain(DEMO_DELIVERY_CLIENT.account.declared_internal_client_mode)
  })

  it('le semis écrit la colonne sur le compte porteur', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    // Décision Louis 04/10/2026 — UPDATE du VRAI compte porteur (aucun compte créé).
    expect(source).toContain('declared_internal_client_mode = $6')
    expect(source).toContain('client.account.declared_internal_client_mode')
  })

  it('est classée « semée », avec sa raison écrite', () => {
    expect(DEMO_ACCOUNT_INTERNAL_CLIENT_COVERAGE.state).toBe('seede')
    expect(DEMO_ACCOUNT_INTERNAL_CLIENT_COVERAGE.reason.length).toBeGreaterThan(100)
  })

  // #219.6 (J05) — les quatre rôles nommés : posés dans le jeu ET insérés.
  it.each([
    'declared_internal_sponsor',
    'declared_internal_users',
    'declared_legal_entity',
    'declared_end_client',
  ] as const)('le rôle %s est nommé en clair dans le jeu et écrit par le semis', column => {
    const value = DEMO_DELIVERY_CLIENT.account[column]
    expect(value.trim().length).toBeGreaterThan(2)
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain(`${column} = $`)
    expect(source).toContain(`client.account.${column}`)
  })
})

// #3278.2 (lot M11) — trois critères de route déclarés : posés dans le jeu ET insérés.
describe('démo — critères de route déclarés', () => {
  it.each([
    'declared_route_scope',
    'declared_route_objectives',
    'declared_route_timing',
    // #3278.1 (décision Louis 11/10/2026) — le fait de la route « événement ou communauté ».
    'declared_route_event',
    // #3278.2b (Louis 15/10) — budget et disponibilité déclarés.
    'declared_route_budget',
    'declared_route_availability',
  ] as const)('le critère %s est posé dans le jeu et écrit par le semis', column => {
    expect(DEMO_DELIVERY_CLIENT.account[column].trim().length).toBeGreaterThan(2)
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain(`${column} = $`)
    expect(source).toContain(`client.account.${column}`)
  })

  it('est classée « semée », avec sa raison écrite', () => {
    expect(DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE.state).toBe('seede')
    expect(DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE.reason).toContain('non évalué')
  })

  // #3278.1 — « inbound / contenu » reste vide À DESSEIN (il passerait devant l'événement) : la raison est écrite.
  it('nomme le fait « inbound / contenu » vide à dessein, avec sa raison', () => {
    expect(DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE.reason).toContain('declared_route_inbound')
    expect(DEMO_ACCOUNT_ROUTE_CRITERIA_COVERAGE.reason).toContain('vide À DESSEIN')
  })
})
