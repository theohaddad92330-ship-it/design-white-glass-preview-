import { generatedPlanWeeks } from '@bellum/contracts'
import { DEMO_ANALYSED_ACCOUNTS } from './demo-dataset'

/**
 * #4416.3 (craft n°9) — la fiche contact lit les étapes du plan du COMPTE et les joint au contact par son NOM COMPLET
 * (`responsable` de l'étape = `full_name` du contact). Un plan qui nomme quelqu'un que le compte ne porte pas, ou qui
 * ne vise personne par son nom, laisse « Plan pour <prénom> » absent de toutes les fiches de la démo.
 *
 * Ce fichier échoue si aucune étape du plan de Thales ne vise un contact NOMMÉ de la démo, ou si l'une d'elles nomme
 * un contact absent des contacts semés.
 */
describe('démo — Thales : des étapes visent des contacts nommés que la fiche sait joindre (#4416.3)', () => {
  const thales = DEMO_ANALYSED_ACCOUNTS.find(account => account.company_name === 'Thales')
  const steps = generatedPlanWeeks(thales?.raw_analysis ?? {}).flatMap(week => week.items)
  const names = new Set((thales?.contacts ?? []).map(contact => contact.full_name))
  const aimedAt = (name: string) => steps.filter(step => step.responsable === name)

  it('le compte existe et son plan lu comme la fiche le lit porte des étapes', () => {
    expect(thales).toBeDefined()
    expect(steps.length).toBeGreaterThan(0)
  })

  it('chaque étape qui nomme une personne la nomme comme un contact semé (clé de jointure = nom complet)', () => {
    const named = steps.filter(step => step.responsable)
    expect(named.length).toBeGreaterThanOrEqual(2)
    expect(named.filter(step => !names.has(step.responsable ?? ''))).toEqual([])
  })

  it('deux étapes e-mail visent Till Rausch (CIO Thales Deutschland, e-mail pro porté)', () => {
    const till = thales?.contacts.find(contact => contact.full_name === 'Till Rausch')
    expect(till?.email).toBeTruthy()
    const aimed = aimedAt('Till Rausch')
    expect(aimed.length).toBeGreaterThanOrEqual(2)
    expect(aimed.every(step => step.outil === 'email')).toBe(true)
  })

  it('la table du plan et le blob d’analyse portent LES MÊMES étapes pour Till Rausch (un seul plan)', () => {
    const fromTable = (thales?.actionPlan?.weeks ?? []).flatMap(week => week.actions ?? [])
    expect(fromTable.filter(action => action.contact === 'Till Rausch')).toHaveLength(aimedAt('Till Rausch').length)
  })
})
