import { departmentsFromGeoZones, GEO_ZONE_DEPARTMENT } from './profile-geo-zones'

/**
 * #1798 — LES ZONES DU PROFIL, TRADUITES EN DÉPARTEMENTS.
 *
 * `esn_profiles.geo_zones` (`packages/contracts/src/schemas/onboarding.ts`) est
 * une liste de LIBELLÉS libres choisis à l'onboarding — « Lyon & Auvergne-Rhône-
 * Alpes », pas un code département. Le référentiel ESN (`esn_directory`), lui,
 * range chaque entrée par `headquartersDepartment` — un code à deux chiffres.
 * Cette table fait le pont, sur l'ANCRE déjà présente dans le libellé (la ville
 * nommée) : ce n'est pas une région entière devinée, c'est la ville que
 * l'utilisateur a lui-même choisie qui donne son département.
 *
 * Trois zones du même profil n'ont AUCUNE ville-ancre — « Full remote »,
 * « National », « International » — et c'est un fait, pas un oubli : y poser un
 * département inventerait un territoire que personne n'a choisi.
 */
describe('#1798 — departmentsFromGeoZones', () => {
  it('lit quelque chose — la table n’est pas vide', () => {
    expect(Object.keys(GEO_ZONE_DEPARTMENT).length).toBeGreaterThanOrEqual(9)
  })

  it('traduit une zone connue en son département-ancre', () => {
    expect(departmentsFromGeoZones(['Paris & Île-de-France'])).toEqual(['75'])
    expect(departmentsFromGeoZones(['Lyon & Auvergne-Rhône-Alpes'])).toEqual(['69'])
  })

  it('agrège plusieurs zones, sans doublon', () => {
    const result = departmentsFromGeoZones(['Paris & Île-de-France', 'Marseille & PACA', 'Paris & Île-de-France'])
    expect(result.sort()).toEqual(['13', '75'])
  })

  it('SAIT DIRE NON — les trois zones sans ville-ancre ne rendent aucun département', () => {
    expect(departmentsFromGeoZones(['Full remote (pas de contrainte géo)'])).toEqual([])
    expect(departmentsFromGeoZones(['National (toute la France)'])).toEqual([])
    expect(departmentsFromGeoZones(['International'])).toEqual([])
  })

  it('une liste vide ne rend rien — ce n’est pas une erreur, personne n’a répondu', () => {
    expect(departmentsFromGeoZones([])).toEqual([])
  })

  it('une zone inconnue (libellé changé, faute de frappe) est ignorée, jamais devinée', () => {
    expect(departmentsFromGeoZones(['Une zone qui n’existe pas'])).toEqual([])
  })
})
