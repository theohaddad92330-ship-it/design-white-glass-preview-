import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * Théo A today-jour — craft rule n°9 : « Ta journée » doit être PLEINE en démonstration.
 *
 * Les quatre tuiles et la colonne de droite lisent des données du VISITEUR :
 *  - « Missions à anticiper » — des missions qui finissent sous 30 jours (`ends_in_days`, relatif au semis) ;
 *  - « Les profils suivis » — des profils dont le visiteur est le référent commercial (`owned_by_visitor`) ET qui
 *    ont une disponibilité déclarée (`available_in_days`, jamais une date en dur).
 * Les affaires (pipe, « à faire avancer ») et les brouillons « à relire » sont posés par le semis des projets et des
 * brouillons de canal, au nom du visiteur (`owner_id` / `recorded_by`) — voir `demo-seed.service.ts`.
 *
 * Ce garde relit le jeu de données SOURCE : sans lui, un écran livré mais vide en démo se découvrirait en réunion,
 * pas en CI. Les liens de source des signaux sont vides à dessein : les libellés de démo sont ouvertement fictifs
 * (voir `demo-briefing.ts`).
 */
describe('Théo A today-jour — la salle de démonstration remplit « Ta journée »', () => {
  it('« Missions à anticiper » : au moins une mission finit dans les 30 jours', () => {
    const endsSoon = DEMO_DELIVERY_CLIENT.missions.filter(
      mission => typeof mission.ends_in_days === 'number' && mission.ends_in_days >= 0 && mission.ends_in_days <= 30,
    )
    expect(endsSoon.length).toBeGreaterThanOrEqual(1)
  })

  it('« Les profils suivis » : au moins deux profils du visiteur ont une disponibilité déclarée', () => {
    const followed = DEMO_CONSULTANTS.filter(
      consultant => consultant.owned_by_visitor === true && consultant.available_in_days != null,
    )
    expect(followed.length).toBeGreaterThanOrEqual(2)
  })

  it('sait dire NON : une mission sans date de fin ne compte pas comme « à anticiper »', () => {
    const undated = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.ends_in_days == null)
    expect(undated.length).toBeGreaterThan(0)
    const endsSoon = DEMO_DELIVERY_CLIENT.missions.filter(
      mission => typeof mission.ends_in_days === 'number' && mission.ends_in_days >= 0 && mission.ends_in_days <= 30,
    )
    expect(endsSoon.length).toBeLessThan(DEMO_DELIVERY_CLIENT.missions.length)
  })
})
