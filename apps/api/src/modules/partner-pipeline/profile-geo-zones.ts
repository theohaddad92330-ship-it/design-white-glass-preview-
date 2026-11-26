/**
 * #1798 — LES ZONES DU PROFIL, TRADUITES EN DÉPARTEMENTS DU RÉFÉRENTIEL ESN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT CETTE TABLE, ET POURQUOI ELLE N'INVENTE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * `esn_profiles.geo_zones` (voir `packages/contracts/src/schemas/onboarding.ts`,
 * clé `geo_zones`) est une liste de LIBELLÉS choisis à l'onboarding, de la forme
 * « Lyon & Auvergne-Rhône-Alpes ». Le référentiel ESN (`esn_directory`) range
 * chaque entrée par `headquartersDepartment`, un code INSEE à deux chiffres.
 *
 * Le pont ne devine pas une région entière : il lit la VILLE que le libellé
 * nomme déjà (celle que l'utilisateur a choisie en cliquant la zone) et prend
 * son département. C'est une lecture, pas une estimation — la ville était déjà
 * dans le texte que l'utilisateur a validé.
 *
 * ⚠️ Trois zones n'ont AUCUNE ville-ancre : « Full remote », « National »,
 * « International ». Elles sont ABSENTES de cette table, délibérément — leur
 * poser un département inventerait un territoire que personne n'a choisi.
 * `departmentsFromGeoZones` les ignore proprement plutôt que de deviner, et
 * l'appelant (`PartnerPipelineService.profileMatches`) NOMME ce cas plutôt que
 * de rendre une liste vide muette.
 *
 * ⚠️ COUPLAGE CONNU : les clés de cette table sont les LIBELLÉS AFFICHÉS de
 * `PROFILE_ANSWER_OPTIONS.geo_zones` (`onboarding.ts`), pas un code stable. Un
 * changement de copie côté onboarding ne casse aucun type (`geo_zones` est
 * `string[]` côté contrat) mais rend cette table silencieusement aveugle à la
 * zone renommée — elle retombe alors sur "aucun département", jamais sur un
 * mauvais département. `profile-geo-zones.spec.ts` fixe les neuf libellés
 * actuels pour qu'un renommage AILLEURS se voie ICI, dans un test qui casse au
 * lieu d'une régression silencieuse en production.
 */
export const GEO_ZONE_DEPARTMENT: Readonly<Record<string, string>> = {
  'Paris & Île-de-France': '75',
  'Lyon & Auvergne-Rhône-Alpes': '69',
  'Lille & Hauts-de-France': '59',
  'Nantes & Pays de la Loire': '44',
  'Bordeaux & Nouvelle-Aquitaine': '33',
  'Toulouse & Occitanie': '31',
  'Marseille & PACA': '13',
  'Strasbourg & Grand Est': '67',
  'Rennes & Bretagne': '35',
}

/**
 * Les départements que ce profil désigne, sans doublon et dans un ordre
 * déterministe (celui des zones telles que déclarées). Une zone sans
 * correspondance (remote, national, international, ou un libellé que cette
 * table ne connaît plus) ne produit AUCUNE entrée — jamais un département
 * choisi au hasard pour "faire quelque chose".
 */
export function departmentsFromGeoZones(geoZones: readonly string[]): string[] {
  const departments = new Set<string>()
  for (const zone of geoZones) {
    const department = GEO_ZONE_DEPARTMENT[zone]
    if (department) departments.add(department)
  }
  return [...departments]
}
