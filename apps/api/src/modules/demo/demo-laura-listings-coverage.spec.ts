import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_LAURA_LISTINGS_COVERAGE } from './demo-coverage'

/**
 * #4065 (lot LISTINGS, 12/10) — « liste-moi… » est démontrable (craft rule n°9). Laura reste scriptée
 * en salle (décision Louis 12/10) : la garde LIT le script réel (`demo-chat-script.ts`, côté web).
 */
const SCRIPT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts')

function block(): string {
  const after = readFileSync(SCRIPT, 'utf8').split("id: 'p-listing-agenda'")[1] ?? ''
  return after.split(/\n {2}\{\n/)[0] ?? ''
}

describe('#4065 — le listing croisé de Laura en démonstration', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_LAURA_LISTINGS_COVERAGE.state).toBe('seede')
    expect(DEMO_LAURA_LISTINGS_COVERAGE.reason).toContain('#4065')
  })

  it('LIT une vraie amorce — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(block().length).toBeGreaterThan(100)
  })

  it('rend une carte `file_export` dont la source, la période et le total lu sont nommés', () => {
    const text = block()
    expect(text).toContain("type: 'file_export'")
    expect(text).toMatch(/du 12 juillet au 12 octobre/)
    expect(text).toMatch(/\d+ rendez-vous/)
  })

  it('ne montre que des personnes fictives « (démo) » et nomme la société non vérifiée', () => {
    const text = block()
    const people = [...text.matchAll(/'([^']+) \(démo\)'/g)]
    expect(people.length).toBeGreaterThanOrEqual(2)
    expect(text).toMatch(/pas pu être vérifiée/)
  })

  it('sait dire NON : aucun corps de message dans la réponse scriptée', () => {
    expect(block()).not.toMatch(/snippet|corps du message :/i)
  })
})

// #4065.8 / #4065.9 (V10-B) — la liste CRM (affaires + interlocuteur) et ATS (entretiens) est démontrable.
describe('#4065.8 / #4065.9 — les listings CRM et ATS en démonstration', () => {
  const crmAts = (): string => {
    const after = readFileSync(SCRIPT, 'utf8').split("id: 'p-listing-crm-ats'")[1] ?? ''
    return after.split(/\n {2}\{\n/)[0] ?? ''
  }

  it('LIT une vraie amorce, avec les affaires perdues ET leur interlocuteur', () => {
    const text = crmAts()
    expect(text.length).toBeGreaterThan(100)
    expect(text).toContain("'Interlocuteur'")
    expect(text).toMatch(/Perdue/)
  })

  it('ne montre que des personnes fictives, et ne nomme aucun éditeur', () => {
    const text = crmAts()
    expect([...text.matchAll(/'([^']+) \(démo\)'/g)].length).toBeGreaterThanOrEqual(4)
    expect(text).not.toMatch(/salesforce|hubspot|pipedrive|odoo|attio|zoho|boond/i)
  })
})
