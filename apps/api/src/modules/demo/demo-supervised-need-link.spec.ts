import { DEMO_RECETTE_X72_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_SUPERVISED_FORFAIT_NEED } from './demo-dataset'
import { demoMissionExtraction } from './demo-scripts'

/**
 * #3547 (recette Y20, « fiche besoin non rejouée ») — le semis pose le forfait
 * encadré par `UPDATE project_needs … WHERE title = $2 AND contract_kind =
 * 'forfait'` : si aucun besoin du jeu ne porte CE titre au forfait, l'UPDATE
 * touche zéro ligne SANS ERREUR et la fiche besoin reste muette. Cette garde lit
 * le jeu comme le semis le lit, et sait dire NON.
 */
describe('forfait encadré — le besoin visé par le semis existe (#3547)', () => {
  const needs = DEMO_DELIVERY_CLIENT.openNeeds as readonly { title: string; contract_kind: string }[]

  it('exactement un besoin du jeu porte le titre visé, et il est au forfait', () => {
    const matching = needs.filter(need => need.title === DEMO_SUPERVISED_FORFAIT_NEED.title)
    expect(matching).toHaveLength(1)
    expect(matching[0]?.contract_kind).toBe('forfait')
  })

  it('la fiche dit un rôle tenu et une équipe côté client : de quoi afficher « Équipe côté client »', () => {
    expect(DEMO_SUPERVISED_FORFAIT_NEED.supervision_role).toBeTruthy()
    expect(DEMO_SUPERVISED_FORFAIT_NEED.client_team_names.length).toBeGreaterThan(0)
  })

  it('l’extraction scriptée cite le forfait « réalisé par les équipes du client »', () => {
    // Plus de document d'exemple (décision Louis 12/10) : le prospect dépose le sien, et la
    // citation scriptée parle du même forfait que le besoin seedé.
    expect(demoMissionExtraction().fields.supervisedForfait.sourceExcerpt).toMatch(/équipes du client/)
  })

  it('le lot X72 est classé SEEDÉ, avec sa raison écrite', () => {
    expect(DEMO_RECETTE_X72_COVERAGE.state).toBe('seede')
    expect(DEMO_RECETTE_X72_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
