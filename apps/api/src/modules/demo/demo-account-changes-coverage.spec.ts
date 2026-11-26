import { composeAccountChanges, weighAccountFacts } from '@bellum/contracts'
import { currentSignalFacts } from '../account-facts/account-facts.sources'
import { DEMO_ACCOUNT_CHANGES_COVERAGE } from './demo-coverage'
import { DEMO_CRM_DEALS, DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4180 (EX-10) — « et en démonstration, un compte suivi montre-t-il ce qui a changé depuis sa dernière
 * vérification ? » (craft rule n°9).
 *
 * Aucune table neuve : la lecture (`AccountChangesService`) relit des données DÉJÀ semées. Ce fichier rejoue
 * sa comparaison sur le VRAI compte vitrine (Société Générale, seul dossier réanalysé : `previous_analysis_at`)
 * avec les MÊMES fonctions que la production (`currentSignalFacts` → `composeAccountChanges`).
 */
describe('#4180 — ce qui a changé sur le compte vitrine, en démonstration', () => {
  const now = new Date('2026-10-14T08:00:00.000Z')
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_CRM_DEALS.account)?.account
  const lastCheckedAt = dossier?.previous_analysis_at ? new Date(dossier.previous_analysis_at).toISOString() : null
  const facts = weighAccountFacts(currentSignalFacts(dossier?.recent_signals), now)
  const changes = composeAccountChanges({
    account: { id: 'demo', name: dossier?.company_name ?? '' },
    lastCheckedAt,
    facts,
    newManagers: [],
    entityChanges: [],
    knownContacts: 0,
  })

  it('est classé seedé, avec sa raison — et nomme ce qui reste vide à dessein', () => {
    expect(DEMO_ACCOUNT_CHANGES_COVERAGE.state).toBe('seede')
    expect(DEMO_ACCOUNT_CHANGES_COVERAGE.reason).toContain('#4180')
    expect(DEMO_ACCOUNT_CHANGES_COVERAGE.reason).toContain('nouveaux responsables')
  })

  it('LIT le vrai compte vitrine et sa date de dernière vérification — sinon tout serait vrai par vacuité', () => {
    expect(dossier).toBeDefined()
    expect(lastCheckedAt).not.toBeNull()
    expect(facts.length).toBeGreaterThan(0)
  })

  it('montre des changements DATÉS du fait, tous postérieurs à la dernière vérification', () => {
    expect(changes.status).toBe('changes')
    expect(changes.items.length).toBeGreaterThan(0)
    for (const item of changes.items) {
      expect(item.date > (lastCheckedAt ?? '').slice(0, 10)).toBe(true)
    }
  })

  it('une offre de recrutement du compte reste une offre RH, jamais un besoin confirmé', () => {
    for (const item of changes.items.filter(i => i.kind === 'hiring_offer')) expect(item.confirmedNeed).toBe(false)
  })
})
