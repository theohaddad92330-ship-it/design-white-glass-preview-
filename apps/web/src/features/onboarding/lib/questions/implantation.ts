import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `implantation` du stage `company_info` — #2005.4 (DÉCISION
 * Louis 17/09, lot CP2).
 *
 * Où l'ESN est IMPLANTÉE (siège + bureaux), posée UNE FOIS par espace —
 * distincte de `geo_zones` (stage `target_market`, sous-étape `cibles`) qui
 * dit où elle PROSPECTE. AJOUTÉE EN FIN de `company_info.steps`
 * (`lib/questions/index.ts`) : l'ordre déjà posé ne bouge pas d'un cran.
 *
 * #2088.26 (mesure 20/09) — RÉFUTÉ puis construit : `company_locations`
 * n'avait AUCUN catalogue à proposer (`kind: 'tags'`, texte libre seul), alors
 * que `expertise_areas`/`target_sectors` (`domaines.ts`/`secteurs.ts`) en ont
 * un depuis le même jour. DÉCISION Louis 20/09 (QCM) : un vrai référentiel
 * géographique, sur la MÊME forme que ses voisins — `kind: 'multi-grouped'`,
 * des groupes, `allowOther: true`. Le texte libre NE DISPARAÎT PAS : une ESN
 * peut être implantée sur un territoire hors catalogue (ou simplement taper
 * une VILLE, comme le fait déjà le jeu de démo — « Paris (siège) », « Lyon » —
 * ce que ce catalogue ne devine ni ne remplace, cf. `demo-dataset.ts`). Les
 * 13 régions de France métropolitaine, mêmes libellés canoniques que
 * `siteGeo.ts` (`DEPT_TO_REGION`/`CITY_REGIONS`, carte des sites d'un compte)
 * — un second référentiel géographique qui orthographierait les régions
 * autrement divergerait dès le premier ajout (GA-26).
 *
 * Hors métropole : aucun département d'outre-mer n'apparaît nulle part
 * ailleurs dans le produit (`siteGeo.ts` n'en connaît aucun) — en inventer un
 * ici serait une donnée non vérifiée. `WorkspaceMarket` (CH/BE/LU/US/CA,
 * `packages/contracts/src/schemas/workspace.ts`) confirme que le produit sait
 * déjà grandir par PAYS : un groupe par pays s'ajoutera de la même façon que
 * ces 5 groupes français, sans redesign — jamais un référentiel qui ne
 * saurait pas grandir.
 */
export const implantationStep: SubStep = {
  slug: 'implantation',
  questions: [
    {
      key: 'company_locations',
      kind: 'multi-grouped',
      label: 'questions.companyLocations.label',
      subtitle: 'questions.companyLocations.subtitle',
      allowOther: true,
      groups: [
        {
          label: 'groups.companyLocations.ileDeFrance',
          choices: choice('Île-de-France'),
        },
        {
          label: 'groups.companyLocations.nordEst',
          choices: choice('Hauts-de-France', 'Grand Est', 'Bourgogne-Franche-Comté'),
        },
        {
          label: 'groups.companyLocations.sudEst',
          choices: choice('Auvergne-Rhône-Alpes', "Provence-Alpes-Côte d'Azur", 'Corse'),
        },
        {
          label: 'groups.companyLocations.sudOuest',
          choices: choice('Nouvelle-Aquitaine', 'Occitanie'),
        },
        {
          label: 'groups.companyLocations.ouestCentre',
          choices: choice('Bretagne', 'Pays de la Loire', 'Normandie', 'Centre-Val de Loire'),
        },
        {
          label: 'groups.companyLocations.outreMerInternational',
          choices: choice(
            'Guadeloupe',
            'Martinique',
            'Guyane',
            'La Réunion',
            'Mayotte',
            'Autres territoires ultramarins',
            'Belgique',
            'Allemagne',
            'Italie',
            'Pays-Bas',
            'Portugal',
            'Autres pays',
          ),
        },
      ],
    },
  ],
}
