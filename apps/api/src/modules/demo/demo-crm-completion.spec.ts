import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyContactCrmOrigin } from '@bellum/contracts'
import { DEMO_CRM_COMPLETION_COVERAGE } from './demo-coverage'
import { DEMO_CRM_COMPLETION, DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4459.4 (craft rule n°9) — « Venu de ton CRM » analysé, en démonstration : la salle marque tout son
 * portefeuille comme importé d'un fichier (#4051). Sans exception, chaque contact y serait « Déjà dans ton
 * CRM » et « Compléter le compte » n'aurait jamais rien à proposer. Cette suite relit le JEU et la SOURCE du
 * semis : elle ne croit pas `demo-coverage.ts` sur parole.
 */
describe('DEMO_CRM_COMPLETION (#4459.4)', () => {
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_CRM_COMPLETION.companyName)
  const names = (dossier?.contacts ?? []).map(contact => contact.full_name)

  it('vise un dossier RÉEL de la salle, analysé jusqu’au bout (pas `analyzing`)', () => {
    expect(dossier).toBeDefined()
    expect(dossier?.account.analysis_status ?? 'completed').toBe('completed')
  })

  it('SAIT DIRE NON puis OUI : des contacts apportés ET au moins un contact d’origine', () => {
    expect(DEMO_CRM_COMPLETION.broughtContacts.length).toBeGreaterThan(0)
    for (const brought of DEMO_CRM_COMPLETION.broughtContacts) expect(names).toContain(brought)
    const origin = names.filter(name => !(DEMO_CRM_COMPLETION.broughtContacts as readonly string[]).includes(name))
    expect(origin.length).toBeGreaterThan(0)
  })

  it('un contact de la salle sans trace d’import se lit « Apporté par Bellum » (source `demo`)', () => {
    expect(classifyContactCrmOrigin({ source: 'demo', importedFromCrm: false })).toBe('bellum')
    expect(classifyContactCrmOrigin({ source: 'demo', importedFromCrm: true })).toBe('crm')
  })

  it('le semis des traces d’import EXCLUT les contacts apportés de ce dossier', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const body = source.slice(source.indexOf('private async seedImportMarks'))
    expect(body).toMatch(/DEMO_CRM_COMPLETION/)
    expect(body.slice(0, 2000)).toMatch(/full_name\s*<>\s*ALL|NOT\s*\(c\.account_id/)
  })

  // #4459.4 — la recette a mesuré 143 « Déjà dans ton CRM » pour 2 « Apporté par Bellum » alors que le texte
  // promettait « 1 dans ton CRM » : la part « CRM » est TOUT le reste du dossier, jamais un nombre figé.
  it('sait dire NON : aucun texte ne fige la part « dans ton CRM » à un nombre que le semis ne produit pas', () => {
    const origin = names.filter(name => !(DEMO_CRM_COMPLETION.broughtContacts as readonly string[]).includes(name))
    const claimed = [...DEMO_CRM_COMPLETION_COVERAGE.reason.matchAll(/(\d+) dans ton CRM/g)].map(m => Number(m[1]))
    for (const n of claimed) expect(n).toBe(origin.length)
    const dataset = readFileSync(join(__dirname, 'demo-dataset.ts'), 'utf8')
    const doc = dataset.slice(dataset.lastIndexOf('/**', dataset.indexOf('export const DEMO_CRM_COMPLETION =')))
    expect(doc.slice(0, doc.indexOf('export const'))).not.toMatch(/«\s*1 dans ton CRM/)
  })

  it('classé « seedé » dans demo-coverage.ts, avec sa raison', () => {
    expect(DEMO_CRM_COMPLETION_COVERAGE.state).toBe('seede')
    expect(DEMO_CRM_COMPLETION_COVERAGE.reason).toMatch(/#4459/)
  })
})
