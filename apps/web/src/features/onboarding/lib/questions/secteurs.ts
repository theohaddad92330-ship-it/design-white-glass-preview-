import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `secteurs` du stage `target_market`.
 *
 * #2041.2 — `target_sectors` fusionnait « secteurs de référence » (où l'ESN a
 * une preuve réelle) et « secteurs souhaités » (une ambition) dans le MÊME
 * tableau. `reference_sectors` sépare le sous-ensemble PROUVÉ, sans toucher à
 * `target_sectors` qui continue de porter tous les secteurs visés.
 *
 * #2041.1 — CINQ NIVEAUX PAR SECTEUR, et une RELANCE au-delà de deux.
 *
 * Les cinq niveaux ne sont pas un cinquième widget : ce sont les quatre clés
 * déjà collectées, LUES ENSEMBLE, plus `priority_sectors` ajoutée ici. La
 * dérivation vit à un seul endroit (`answers-secteurs-niveaux.ts`,
 * `sectorEngagementLevels`) — `priority` · `reference` · `target` · `dormant`
 * (prouvé mais plus visé) · `no_go`. Un `kind` de `Question` à cinq états par
 * item aurait demandé de changer le TYPE de valeur d'une réponse (aujourd'hui
 * `string | string[]`), donc le magasin, la validation, la relecture et la
 * barre de progression : une seconde clé plate dit la même chose sans rien
 * casser, et c'est ce que le dépôt fait déjà pour `reference_sectors`.
 *
 * ⚠️ **Aucun `max` sur cette question, et c'est délibéré.** Un plafond
 * désactiverait « Continuer » — l'issue demande une RELANCE, pas une porte
 * fermée : `too_many_priority_sectors` (`onboarding-contradictions.ts`) nomme
 * la tension sur la page de relecture, l'utilisateur tranche. Le seuil est
 * `PRIORITY_SECTORS_NUDGE_THRESHOLD`, et il ne se recopie pas ici.
 */
export const secteursStep: SubStep = {
  slug: 'secteurs',
  questions: [
    {
      key: 'target_sectors',
      kind: 'multi-grouped',
      label: 'questions.targetSectors.label',
      subtitle: 'questions.targetSectors.subtitle',
      allowOther: true,
      // #2031.5 / #2045.5 — décision Louis 18/09 : « PROPOSER sans remplir ».
      // Affiche les secteurs BRUTS du CRM branché (aide à la saisie), jamais
      // une case cochée à sa place — aucune correspondance n'existe vers ce
      // catalogue fermé (voir `CrmVocabularyField`).
      crmVocabularyField: 'industries',
      // #2024.5 — LA question du retour : « pas vingt prioritaires ». L'ordre de
      // la sélection portait déjà la priorité ; il se LIT désormais
      // (« Priorité 1 »), et au-delà de DEUX la relance dit ce qui est vrai —
      // au-delà, « prioritaire » ne trie plus rien. Elle ne bloque pas et ne
      // retire rien : le produit ne sait pas lequel des vingt compte vraiment,
      // seule la personne le sait.
      priority: { nudgeAbove: 2 },
      groups: [
        {
          label: 'groups.targetSectors.financeAssurance',
          choices: choice(
            'Banque de détail & Banque privée',
            "Banque d'investissement & Marchés",
            'Assurance & Mutuelles',
            'Fintech & Services financiers',
          ),
        },
        {
          label: 'groups.targetSectors.industrieEnergie',
          choices: choice(
            'Industrie manufacturière & Automobile',
            'Aéronautique & Défense',
            'Énergie & Utilities (EDF, Engie...)',
            'BTP & Construction',
            'Chimie & Pharmaceutique',
          ),
        },
        {
          label: 'groups.targetSectors.servicesCommerce',
          choices: choice(
            'Retail & Grande distribution',
            'E-commerce & Marketplaces',
            'Luxe & Cosmétiques',
            'Hôtellerie, Tourisme & Loisirs',
          ),
        },
        {
          label: 'groups.targetSectors.transportLogistique',
          choices: choice(
            'Transport ferroviaire & Aérien',
            'Transport routier & Maritime',
            'Supply Chain & Logistique',
          ),
        },
        {
          label: 'groups.targetSectors.autres',
          choices: choice(
            'Telecom & Médias',
            'Santé & Medtech',
            'Secteur public & Collectivités',
            'Éducation & Recherche',
            'Tech & Startups / Scale-ups',
            'Immobilier & PropTech',
          ),
        },
        {
          label: 'groups.targetSectors.rechercheOuverte',
          choices: choice('Tous secteurs — sans préférence'),
        },
        {
          label: 'groups.targetSectors.complementaires',
          choices: choice(
            'Agroalimentaire & Agriculture',
            'Industrie de process & Matériaux',
            'Pharmacie & Biotechnologies',
            'Équipements médicaux & Dispositifs de santé',
            'Organismes de formation',
            'Associations & Économie sociale',
            'Services professionnels & Conseil',
            'ESN & Cabinets partenaires',
            'Sécurité & Sûreté',
            'Sport, Culture & Événementiel',
            'Secteur non encore défini',
          ),
        },
      ],
    },
    // #2041.1 — le NIVEAU le plus fort, parmi les secteurs déjà visés. Même
    // catalogue, à plat, pour la raison de `reference_sectors` juste en
    // dessous : c'est un sous-ensemble affiné, pas un second vocabulaire.
    {
      key: 'priority_sectors',
      kind: 'multi',
      label: 'questions.prioritySectors.label',
      subtitle: 'questions.prioritySectors.subtitle',
      optional: true,
      choices: choice(
        'Banque de détail & Banque privée',
        "Banque d'investissement & Marchés",
        'Assurance & Mutuelles',
        'Fintech & Services financiers',
        'Industrie manufacturière & Automobile',
        'Aéronautique & Défense',
        'Énergie & Utilities (EDF, Engie...)',
        'BTP & Construction',
        'Chimie & Pharmaceutique',
        'Retail & Grande distribution',
        'E-commerce & Marketplaces',
        'Luxe & Cosmétiques',
        'Hôtellerie, Tourisme & Loisirs',
        'Transport ferroviaire & Aérien',
        'Transport routier & Maritime',
        'Supply Chain & Logistique',
        'Telecom & Médias',
        'Santé & Medtech',
        'Secteur public & Collectivités',
        'Éducation & Recherche',
        'Tech & Startups / Scale-ups',
        'Immobilier & PropTech',
        'Tous secteurs — sans préférence',
        'Agroalimentaire & Agriculture',
        'Industrie de process & Matériaux',
        'Pharmacie & Biotechnologies',
        'Équipements médicaux & Dispositifs de santé',
        'Organismes de formation',
        'Associations & Économie sociale',
        'Services professionnels & Conseil',
        'ESN & Cabinets partenaires',
        'Sécurité & Sûreté',
        'Sport, Culture & Événementiel',
        'Secteur non encore défini',
      ),
    },
    // #2041.2 — même catalogue, à plat : ce qui change n'est pas le
    // vocabulaire des secteurs mais le SOUS-ENSEMBLE coché.
    {
      key: 'reference_sectors',
      kind: 'multi',
      label: 'questions.referenceSectors.label',
      subtitle: 'questions.referenceSectors.subtitle',
      // #2024.3 — L'EXEMPLE QUI A SERVI À TRANCHER (décision Louis 16/09/2026).
      // Les secteurs de référence sont, par construction, un SOUS-ENSEMBLE des
      // secteurs cibles : la réponse précédente de la personne est la seule
      // source honnête pour les mettre en tête, et l'écran la nomme
      // (« d'après vos secteurs cibles »). Aucune valeur n'est cochée à sa
      // place — on ordonne, elle choisit.
      recommendedFrom: { fromKey: 'target_sectors', sourceLabelKey: 'recommendation.fromTargetSectors' },
      choices: choice(
        'Banque de détail & Banque privée',
        "Banque d'investissement & Marchés",
        'Assurance & Mutuelles',
        'Fintech & Services financiers',
        'Industrie manufacturière & Automobile',
        'Aéronautique & Défense',
        'Énergie & Utilities (EDF, Engie...)',
        'BTP & Construction',
        'Chimie & Pharmaceutique',
        'Retail & Grande distribution',
        'E-commerce & Marketplaces',
        'Luxe & Cosmétiques',
        'Hôtellerie, Tourisme & Loisirs',
        'Transport ferroviaire & Aérien',
        'Transport routier & Maritime',
        'Supply Chain & Logistique',
        'Telecom & Médias',
        'Santé & Medtech',
        'Secteur public & Collectivités',
        'Éducation & Recherche',
        'Tech & Startups / Scale-ups',
        'Immobilier & PropTech',
        'Tous secteurs — sans préférence',
        'Agroalimentaire & Agriculture',
        'Industrie de process & Matériaux',
        'Pharmacie & Biotechnologies',
        'Équipements médicaux & Dispositifs de santé',
        'Organismes de formation',
        'Associations & Économie sociale',
        'Services professionnels & Conseil',
        'ESN & Cabinets partenaires',
        'Sécurité & Sûreté',
        'Sport, Culture & Événementiel',
        'Secteur non encore défini',
      ),
    },
  ],
}
