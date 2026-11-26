import type { SubStep } from './types'
import { choice } from './types'

/** Sous-étape `cibles` du stage `target_market`. */
export const ciblesStep: SubStep = {
  slug: 'cibles',
  questions: [
    {
      key: 'target_company_types',
      kind: 'multi',
      label: 'questions.targetCompanyTypes.label',
      // #2024.9 — les sélections longues portent toutes une explication courte.
      subtitle: 'questions.targetCompanyTypes.subtitle',
      choices: choice(
        'CAC40 / SBF120 (grands comptes)',
        'ETI (500-5 000 salariés)',
        'PME (50-500 salariés)',
        'Startups & Scale-ups',
        'Secteur public & Collectivités',
        'Toutes tailles — selon la pertinence',
        'TPE / petites structures',
        'PME de moins de 50 salariés',
        'Associations / organismes sans but lucratif',
      ),
    },
    {
      key: 'geo_zones',
      kind: 'multi',
      label: 'questions.geoZones.label',
      // #2024.9 — les sélections longues portent toutes une explication courte.
      subtitle: 'questions.geoZones.subtitle',
      // #2088.28 — pourquoi on la pose : la zone choisie ne restreint rien
      // silencieusement, elle sert à PRIORISER.
      rationaleKey: 'questions.geoZones.rationale',
      // #2031.5 / #2045.5 — décision Louis 18/09 : « PROPOSER sans remplir ».
      // Affiche les pays BRUTS du CRM branché (aide à la saisie), jamais une
      // case cochée à sa place (voir `CrmVocabularyField`).
      crmVocabularyField: 'countries',
      // #2036.7 — même mécanisme que `target_sectors` (#2024.5, `secteurs.ts:52`) :
      // l'ordre de sélection porte déjà la priorité, il ne se lisait nulle
      // part. Seuil à 3 : au-delà, « zone prioritaire » ne trie plus rien
      // sur une liste de 12 choix (contre 2 pour les 20+ secteurs).
      priority: { nudgeAbove: 3 },
      choices: choice(
        'Paris & Île-de-France',
        'Lyon & Auvergne-Rhône-Alpes',
        'Lille & Hauts-de-France',
        'Nantes & Pays de la Loire',
        'Bordeaux & Nouvelle-Aquitaine',
        'Toulouse & Occitanie',
        'Marseille & PACA',
        'Strasbourg & Grand Est',
        'Rennes & Bretagne',
        'Full remote (pas de contrainte géo)',
        'National (toute la France)',
        'International',
        'Outre-mer',
        'Belgique',
        'Allemagne',
        'Italie',
        'Pays-Bas',
        'Portugal',
      ),
    },
    {
      // #2036.2 (#2847) — remote accepté et déplacements, un axe DISTINCT de
      // `geo_zones` juste au-dessus (celui-ci dit où l'ESN prospecte, celui-ci
      // dit dans quelles conditions elle intervient — jamais fusionnés,
      // même principe que `growth_target_zones`/#2036.10, garde GA-338).
      key: 'remote_and_travel_scope',
      kind: 'multi',
      label: 'questions.remoteAndTravelScope.label',
      subtitle: 'questions.remoteAndTravelScope.subtitle',
      choices: choice(
        'Remote accepté sans restriction',
        'Remote partiel (quelques jours sur site)',
        'Sur site uniquement',
        'Déplacements ponctuels chez le client acceptés',
        'Grands déplacements acceptés',
        'Aucun déplacement possible',
      ),
    },
    {
      // #2036.8 (#2847) — distinguer la capacité avérée de l'intention, sans
      // les fusionner (doctrine #2036 : « ne pas transformer une zone
      // souhaitée en capacité avérée »). V1 tranché sans Louis : une posture
      // déclarée au niveau du territoire pris dans son ensemble, pas encore
      // un croisement par zone (qui resterait un nouvel écran hiérarchique).
      key: 'zone_capability_status',
      kind: 'multi',
      label: 'questions.zoneCapabilityStatus.label',
      subtitle: 'questions.zoneCapabilityStatus.subtitle',
      choices: choice(
        'Je peux intervenir (capacité déjà avérée)',
        'J’ai déjà des relations sur ces zones',
        'Je souhaite développer ces zones (pas encore une capacité avérée)',
      ),
    },
  ],
}
