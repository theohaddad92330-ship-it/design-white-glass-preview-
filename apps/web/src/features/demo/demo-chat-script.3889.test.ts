import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_CHAT_PROMPTS } from './demo-chat-script'

/**
 * #3889 (épopée #3977) — « quels projets a Sanofi dans nos documents ? » répond en salle (craft rule n°9).
 * La réponse est écrite à la main : ce test la tient au document RÉELLEMENT semé (`demo-dataset.ts`, côté API),
 * pour qu'elle ne cite jamais un fait que la salle n'a pas.
 */
const DATASET = readFileSync(join(__dirname, '../../../../api/src/modules/demo/demo-dataset.ts'), 'utf8')

describe('#3889 — p-document-projects : les projets des documents, rangés sur ce que le texte DIT', () => {
  const found = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-document-projects')
  const answer = found?.answer ?? ''

  it('existe dans la salle', () => {
    expect(found).toBeDefined()
    expect(found?.question).toContain('Sanofi')
  })

  it('cite le document semé par son titre exact', () => {
    expect(DATASET).toContain("'Notes d’avant-vente — projets Sanofi (démo)'")
    expect(answer).toContain('« Notes d’avant-vente — projets Sanofi (démo) »')
  })

  it('range en besoins ouverts, anciens besoins et missions — chaque passage existe dans le document semé', () => {
    for (const heading of ['Besoins ouverts', 'Anciens besoins', 'Missions']) expect(answer).toContain(heading)
    for (const passage of [
      'qualification des données de pharmacovigilance',
      'architecte données pour la plateforme analytique R&D',
      'cadrage en six semaines d’un tableau de suivi qualité',
      'refonte du portail fournisseurs',
    ]) {
      expect(DATASET).toContain(passage)
      expect(answer.toLowerCase()).toContain(passage.toLowerCase())
    }
  })

  it('sait dire NON : le besoin sans date ni statut est « non daté », jamais ouvert', () => {
    const open = answer.slice(answer.indexOf('**Besoins ouverts**'), answer.indexOf('**Anciens besoins**'))
    expect(open).not.toContain('portail fournisseurs')
    expect(answer).toMatch(/portail fournisseurs[^\n]*non daté/)
  })

  it('ne confond pas les documents avec les besoins enregistrés, et ne généralise pas une absence', () => {
    expect(answer).toMatch(/pas des besoins enregistrés/)
    expect(answer).toMatch(/une absence ici ne dit rien/)
    expect(answer).not.toMatch(/%/)
  })
})
