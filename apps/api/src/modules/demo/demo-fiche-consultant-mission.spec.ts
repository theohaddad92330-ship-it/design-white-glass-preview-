import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * #4346 — PARITÉ DÉMO DE LA FICHE CONSULTANT (craft rule n°9).
 *
 * L'en-tête de la fiche consultant ne montre « Voir la mission » QUE si le
 * consultant a une mission en cours ou à venir (on n'affiche pas ce qu'on n'a
 * pas). La table `mission_assignments` est déjà déclarée seedée : la garde par
 * table ne voit donc pas qu'un prospect qui ouvre une fiche de démonstration
 * pourrait n'y trouver AUCUN bouton « Voir la mission » — un écran qui se
 * découvre en réunion. Les offsets sont relatifs au jour du semis, donc ce
 * raisonnement vaut quel que soit le jour d'ouverture.
 */
describe('parité démo — la fiche consultant montre « Voir la mission »', () => {
  const current = DEMO_DELIVERY_CLIENT.missions.filter(
    mission =>
      mission.status === 'active' &&
      typeof mission.consultant === 'string' &&
      mission.consultant.length > 0 &&
      (mission.ends_in_days === null || mission.ends_in_days >= 0),
  )

  it('au moins un consultant démo a une mission en cours ou à venir', () => {
    expect(current.length).toBeGreaterThanOrEqual(1)
  })

  it('et il y en a plusieurs : la fiche d’un consultant en poste n’est pas un cas unique', () => {
    expect(new Set(current.map(mission => mission.consultant)).size).toBeGreaterThanOrEqual(2)
  })
})
