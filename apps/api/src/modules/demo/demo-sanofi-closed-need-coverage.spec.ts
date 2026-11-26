import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEMO_SANOFI_CLOSED_NEED_COVERAGE } from './demo-coverage'
import { DEMO_CV_IMPORT_CONSULTANTS, DEMO_DOSSIERS } from './demo-dataset'
import { closedNeedProjectStatus } from './demo-seed.service'

/**
 * #3895 (arbitrage Louis 11/10) — « et en démonstration, Sanofi a-t-il un historique ? » (craft rule n°9).
 * Aucune table neuve : ce fichier lit le VRAI jeu de données, pas un commentaire qui l'affirme.
 */
describe('#3895 — l’historique Sanofi en démonstration', () => {
  const sanofi = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Sanofi')

  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_SANOFI_CLOSED_NEED_COVERAGE.state).toBe('seede')
    expect(DEMO_SANOFI_CLOSED_NEED_COVERAGE.reason).toContain('#3895')
  })

  it('LIT un vrai dossier Sanofi — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(sanofi).toBeDefined()
  })

  it('Sanofi porte un besoin FERMÉ (statut final), avec son motif et sa date', () => {
    const closed = sanofi?.closedNeeds ?? []
    expect(closed.length).toBeGreaterThan(0)
    for (const need of closed) {
      expect(['won', 'lost', 'cancelled']).toContain(need.status)
      expect(need.status_reason.trim().length).toBeGreaterThan(0)
      expect(need.closed_days_ago).toBeGreaterThan(0)
    }
  })

  // #4755 (lot 761) — Société Générale porte DÉSORMAIS deux besoins fermés (l'Historique du tableau des signaux,
  // craft rule 9 : `DEMO_SIGNAL_LINES_COVERAGE`). L'exception est NOMMÉE ici ; la garde dit toujours NON à tout
  // autre dossier.
  const CLOSED_NEEDS_OWNERS = ['Sanofi', 'Société Générale']
  it('sait dire NON : aucun autre dossier de la salle ne porte un historique inventé', () => {
    const others = DEMO_DOSSIERS.filter(dossier => !CLOSED_NEEDS_OWNERS.includes(dossier.account.company_name))
    expect(others.length).toBeGreaterThan(0)
    expect(others.some(dossier => (dossier.closedNeeds ?? []).length > 0)).toBe(false)
  })

  it('un CV de la salle nomme Sanofi comme client, et la preuve est une ligne de son CV', () => {
    const persona = DEMO_CV_IMPORT_CONSULTANTS.find(item =>
      (item.experiences ?? []).some(experience => experience.entreprise === 'Sanofi'),
    )
    expect(persona).toBeDefined()
    const experience = persona?.experiences?.find(item => item.entreprise === 'Sanofi')
    const latest = persona?.documents[persona.documents.length - 1]
    expect(latest?.text).toContain(experience?.preuve ?? '\u0000')
  })
})

/**
 * 11/10 nuit — la salle démo est restée HORS SERVICE en prod : le semis écrivait `stage = 'abandoned'`
 * pour un besoin annulé, valeur refusée par `opportunities_stage_check` (« Demo pool: background re-seed
 * failed », pool épuisé). Les specs du semis mockent la base : seule la contrainte SQL RÉELLE, lue dans
 * sa migration, dit la vérité.
 */
describe('#3895 — l’étape semée d’un besoin fermé respecte la contrainte SQL', () => {
  const migration = readFileSync(join(__dirname, '../../migrations/1789344812907-ProjectPivot.ts'), 'utf8')
  const allowed = (constraint: string): string[] => {
    const block = migration.slice(migration.indexOf(`ADD CONSTRAINT ${constraint}`))
    const list = /IN \(([^)]*)\)/.exec(block)?.[1] ?? ''
    return [...list.matchAll(/'([a-z_]+)'/g)].map(match => match[1] ?? '')
  }

  it('LIT les deux contraintes (sinon le test passerait par vacuité)', () => {
    expect(allowed('opportunities_stage_check')).toContain('won')
    expect(allowed('opportunities_outcome_check')).toContain('abandoned')
  })

  it.each(['won', 'lost', 'cancelled'] as const)('statut %s → étape et issue autorisées', status => {
    const { stage, outcome } = closedNeedProjectStatus(status)
    expect(allowed('opportunities_stage_check')).toContain(stage)
    expect(allowed('opportunities_outcome_check')).toContain(outcome)
  })

  it('sait dire NON : « abandoned » n’est PAS une étape', () => {
    expect(allowed('opportunities_stage_check')).not.toContain('abandoned')
  })
})
