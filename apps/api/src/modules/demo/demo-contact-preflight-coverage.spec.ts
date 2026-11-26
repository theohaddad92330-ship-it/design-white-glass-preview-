import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANALYSIS_SCOPE_MODE_LABELS, compileContactPreflight, detectFieldConflict } from '@bellum/contracts'
import { DEMO_CONTACT_SCOPE_DIFFERENCE, DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_CONTACT_PREFLIGHT_COVERAGE } from './demo-coverage'

/**
 * #3219 (#190.2 côté CONTACT) — LE CONTRÔLE AVANT ACTION, OBSERVABLE EN DÉMONSTRATION
 * (craft rule n°9). Cette garde SAIT DIRE NON : elle relit le siège RÉELLEMENT semé,
 * rejoue le MÊME détecteur (`detectFieldConflict`) et le MÊME compilateur que l'API sur
 * les deux relevés, et exige que le semis les ÉCRIVE — retirer l'un des trois la fait rougir.
 */
describe('couverture démo — contrôle avant action d’un contact (#3219)', () => {
  const scoped = DEMO_CONTACT_SCOPE_DIFFERENCE
  const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
  const seat = sncf?.contacts.find(contact => contact.full_name === scoped.contact)

  it('vise un siège ANONYME réellement semé, et le second relevé porte la valeur que la fiche affiche', () => {
    expect(seat).toBeDefined()
    expect(seat?.title).toBe(scoped.second.value)
    expect(seat?.email ?? null).toBeNull()
  })

  it('les deux portées sont DÉCLARÉES dans le vocabulaire fermé des analyses, et diffèrent', () => {
    const labels: string[] = Object.values(ANALYSIS_SCOPE_MODE_LABELS)
    expect(labels).toContain(scoped.first.scope)
    expect(labels).toContain(scoped.second.scope)
    expect(scoped.first.scope).not.toBe(scoped.second.scope)
    expect(scoped.first.daysAgo).toBeGreaterThan(scoped.second.daysAgo)
  })

  it('rejoué par le MÊME détecteur et le MÊME compilateur : un écart de portée, aucune valeur choisie', () => {
    const day = 86_400_000
    const now = Date.parse('2026-10-11T12:00:00.000Z')
    const conflict = detectFieldConflict({
      field: scoped.field,
      incomingValue: scoped.second.value,
      incomingSource: 'pipeline',
      incomingAt: new Date(now - scoped.second.daysAgo * day).toISOString(),
      currentValue: scoped.first.value,
      currentSource: 'pipeline',
      currentObservedAt: new Date(now - scoped.first.daysAgo * day).toISOString(),
      incomingScope: scoped.second.scope,
      currentScope: scoped.first.scope,
    })
    expect(conflict?.resolvedBy).toBe('scope_difference')
    const preflight = compileContactPreflight({
      contactId: 'demo',
      action: null,
      conflicts: conflict ? [conflict] : [],
      accountScope: { state: 'evaluated', exclusion: null, entity: seat?.entity ?? null },
      employer: null,
      title: null,
    })
    expect(preflight.items.map(item => item.kind)).toEqual(['scope_difference'])
  })

  it('le semis ÉCRIT les deux relevés au journal, sur le contact, avec leur portée', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_CONTACT_SCOPE_DIFFERENCE')
    expect(seed).toMatch(/INSERT INTO record_field_audit[\s\S]{0,200}scope, created_at\)[\s\S]{0,80}'contact'/)
  })

  it('est classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_CONTACT_PREFLIGHT_COVERAGE.state).toBe('seede')
    expect(DEMO_CONTACT_PREFLIGHT_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
