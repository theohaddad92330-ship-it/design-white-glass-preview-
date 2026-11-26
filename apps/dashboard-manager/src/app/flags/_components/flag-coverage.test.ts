import { describe, expect, it } from 'vitest'
import { dateActivationDuFlag, espacesActifsDuFlag } from './flag-coverage'

/**
 * #1667.1 — les deux colonnes demandées par l'issue (« espaces où le flag est
 * actif », « date d'activation ») ne s'INVENTENT pas : `fetchAdminFlags`
 * n'évalue qu'UN contexte (userId/workspaceId) à la fois — structurellement
 * incapable de lister tous les espaces — et le SDK Reflag ne porte aucune date
 * d'activation, ni sur une définition de flag ni sur son évaluation (vérifié
 * dans `@reflag/node-sdk@1.7.0` : `FlagDefinition`/`FlagState` n'ont aucun
 * champ de date). Ces deux fonctions rendent donc « non mesuré » AVEC sa
 * raison — jamais une valeur devinée, jamais un tableau vide qui se lirait
 * « inactif partout ».
 */
describe('espacesActifsDuFlag / dateActivationDuFlag — non mesuré, avec sa raison', () => {
  it('espacesActifsDuFlag n’est jamais mesuré et le dit', () => {
    const mesure = espacesActifsDuFlag()
    expect(mesure.mesure).toBe(false)
    expect(mesure.raison.length).toBeGreaterThan(20)
  })

  it('dateActivationDuFlag n’est jamais mesurée et le dit', () => {
    const mesure = dateActivationDuFlag()
    expect(mesure.mesure).toBe(false)
    expect(mesure.raison.length).toBeGreaterThan(20)
  })

  it('les deux raisons nomment la cause structurelle, pas une panne', () => {
    expect(espacesActifsDuFlag().raison.toLowerCase()).toMatch(/contexte|espace/)
    expect(dateActivationDuFlag().raison.toLowerCase()).toMatch(/date|sdk|reflag/)
  })
})
