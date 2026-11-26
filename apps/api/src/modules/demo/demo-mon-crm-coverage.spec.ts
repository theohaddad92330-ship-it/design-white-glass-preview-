import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_PORTFOLIO_COUNTERS } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4526.7 — « ET EN DÉMONSTRATION, LA PUCE MON CRM MONTRE QUOI ? »
 *
 * Elle se tait à zéro (GA-18/19) : sans compte d'origine CRM, la salle ne la montrerait jamais. Cette garde
 * relit le SEMIS, et sait dire NON : une salle où tous les comptes sont « CRM » ne prouve pas que le filtre
 * discrimine.
 */
describe('couverture démo — Mon CRM', () => {
  const crm = DEMO_DOSSIERS.filter(dossier => dossier.account.origin === 'crm')

  it('lit un corpus non vide', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThan(2)
  })

  it('sème des comptes d’origine CRM — la puce s’affiche avec un compteur > 0', () => {
    expect(crm.length).toBeGreaterThanOrEqual(2)
  })

  it('en laisse d’autres hors CRM — le filtre discrimine', () => {
    expect(crm.length).toBeLessThan(DEMO_DOSSIERS.length)
  })

  it('classe le compteur `crm` « seedé » et nomme sa source', () => {
    expect(DEMO_PORTFOLIO_COUNTERS['crm']?.state).toBe('seede')
    expect(DEMO_PORTFOLIO_COUNTERS['crm']?.reason).toMatch(/CRM_LINKED_ACCOUNT_PREDICATE/)
  })
})

/**
 * #4597.1 — « ET EN DÉMONSTRATION, LA PUCE IMPORTÉS MONTRE QUOI ? » Elle se tait à zéro (GA-18/19) : sans compte
 * d'origine `import`, la salle ne la montrerait jamais — et un prospect découvrirait en réunion qu'un import n'a
 * aucune vue. Cette garde relit le SEMIS ; elle sait dire NON (un semis où tout est « importé » ne discrimine pas)
 * et ne laisse pas la puce « Mon CRM » avaler les imports (#4597.2).
 */
describe('couverture démo — Importés (#4597.1)', () => {
  const imported = DEMO_DOSSIERS.filter(dossier => dossier.account.origin === 'import')

  it('sème au moins un compte d’origine import — la puce s’affiche avec un compteur > 0', () => {
    expect(imported.length).toBeGreaterThanOrEqual(1)
  })

  it('en laisse d’autres hors import — le filtre discrimine', () => {
    expect(imported.length).toBeLessThan(DEMO_DOSSIERS.length)
  })

  it('un compte importé n’est PAS un compte CRM (la puce « Mon CRM » ne compte plus que le CRM)', () => {
    for (const dossier of imported) expect(dossier.account.origin).not.toBe('crm')
  })

  it('classe le compteur `imported` « seedé » et nomme sa source', () => {
    expect(DEMO_PORTFOLIO_COUNTERS['imported']?.state).toBe('seede')
    expect(DEMO_PORTFOLIO_COUNTERS['imported']?.reason).toMatch(/IMPORTED_ACCOUNT_PREDICATE/)
  })
})

/**
 * #4597.3 — « voir les N contacts / comptes » depuis Imports & sources : en démonstration, l'historique propose deux
 * imports ; sans fiche marquée de leur identifiant le lien resterait absent et le prospect ne verrait pas le geste.
 * Garde de SOURCE (le semis écrit en SQL) : elle sait dire NON si le marquage disparaît.
 */
describe('couverture démo — un import précis (#4597.3)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const history = seed.slice(seed.indexOf('private async seedImportHistory'))

  it('marque les contacts importés de la salle de l’identifiant du premier import (type contact)', () => {
    expect(history).toMatch(/UPDATE contacts SET import_job_id = \$1/)
    expect(history).toMatch(/source = 'import'/)
  })

  it('marque les comptes d’origine import de l’identifiant de l’import de comptes', () => {
    expect(history).toMatch(/UPDATE accounts SET import_job_id = \$1/)
    expect(history).toMatch(/origin = 'import'/)
  })

  it('reste borné à l’espace de démonstration (aucun UPDATE sans workspace_id)', () => {
    const updates = history.match(/UPDATE (contacts|accounts) SET import_job_id[^`]*/g) ?? []
    expect(updates.length).toBeGreaterThanOrEqual(2)
    for (const update of updates) expect(update).toMatch(/workspace_id = \$2/)
  })
})
