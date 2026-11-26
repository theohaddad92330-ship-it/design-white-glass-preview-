import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_CONTACT_LIST_HREF_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4610.5 (craft rule n°9) — le lien « nom du contact → sa fiche » est SEEDÉ : la réponse scriptée de la salle porte
 * une carte `contact_list` dont les noms sont des jetons de lien. La garde relit le script ET le semis : si une
 * personne citée n'a plus de fiche semée, le lien mènerait nulle part et le test échoue.
 */
const SCRIPT = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'demo', 'demo-chat-script.ts')
const script = readFileSync(SCRIPT, 'utf8')

describe('#4610.5 — le lien vers la fiche d’un contact en démonstration', () => {
  it('est classé seedé, avec une raison écrite', () => {
    expect(DEMO_CONTACT_LIST_HREF_COVERAGE.state).toBe('seede')
    expect(DEMO_CONTACT_LIST_HREF_COVERAGE.reason.length).toBeGreaterThan(40)
  })

  it('le script de salle porte une carte contact_list dont chaque nom est un jeton de fiche', () => {
    expect(script).toMatch(/type:\s*'contact_list'/)
    const names = [...script.matchAll(/href:\s*contactHref\('([^']+)'\)/g)].map(match => match[1])
    expect(names.length).toBeGreaterThanOrEqual(2)
  })

  it('chaque personne citée a une fiche SEMÉE (sinon le lien ne mènerait nulle part)', () => {
    const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
    const seeded = new Set((sncf?.contacts ?? []).map(contact => contact.full_name))
    const names = [...script.matchAll(/href:\s*contactHref\('([^']+)'\)/g)].map(match => match[1])
    expect(names.length).toBeGreaterThan(0)
    expect(names.filter(name => !seeded.has(name))).toEqual([])
  })
})
