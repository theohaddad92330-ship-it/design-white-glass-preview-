import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT, DEMO_EXTERNAL_SOURCING_PARTNER_NAME } from './demo-dataset'

/**
 * #2972 — parité démo du partenaire. Le relevé escaladé affiche « Partenaire : … » quand son consultant est en
 * sous-traitance (`consultants.partner_account_id`) ; la salle n'avait aucun consultant de ce genre ni de mission
 * escaladée portée par lui : la ligne ne se voyait jamais.
 */
describe('démo — un consultant en sous-traitance, sa mission escaladée (#2972)', () => {
  const subcontractors = DEMO_CONSULTANTS.filter(c => c.engagement_kind_override === 'sous_traitance')
  const escalated = DEMO_DELIVERY_CLIENT.missions.filter(m => m.timesheet?.status === 'escalated')

  it('au moins un consultant en sous-traitance, rattaché à l’ESN partenaire déclarée (account_partners)', () => {
    expect(subcontractors.length).toBeGreaterThanOrEqual(1)
    for (const consultant of subcontractors) {
      expect(consultant.partner_account).toBe(DEMO_EXTERNAL_SOURCING_PARTNER_NAME)
      expect(consultant.contract_type).not.toBe('cdi')
    }
  })

  it('une mission ESCALADÉE (trois relances) est portée par ce consultant', () => {
    const names = new Set(subcontractors.map(c => c.full_name))
    const mine = escalated.filter(m => names.has(m.consultant))
    expect(mine.length).toBeGreaterThanOrEqual(1)
    for (const mission of mine) expect(mission.timesheet?.reminders_sent).toBeGreaterThanOrEqual(3)
  })

  it('sait dire NON : un salarié (CDI) n’a pas de partenaire, et aucun nom de consultant n’est doublé', () => {
    for (const consultant of DEMO_CONSULTANTS.filter(c => c.contract_type === 'cdi'))
      expect(consultant.partner_account).toBeUndefined()
    const names = DEMO_CONSULTANTS.map(c => c.full_name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('le semis rattache vraiment le consultant à son compte partenaire (partner_account_id)', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('await this.linkSubcontractorPartners(')
    expect(seed).toMatch(/UPDATE consultants SET partner_account_id = a\.id/)
  })
})
