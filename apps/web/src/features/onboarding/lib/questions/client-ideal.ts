import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `client-ideal` du stage `target_market` — lot L17 (#2042).
 *
 * `cibles.ts` (`target_company_types`) mélangeait taille et type en une seule
 * liste ; cette sous-étape les sépare et ajoute les axes qui manquaient
 * (maturité, territoire, accessibilité, cycle tolérable, panier minimum,
 * contraintes de référencement, état actuel du portefeuille face au profil).
 * `target_company_types` n'est ni modifié ni retiré (GA-08).
 */
export const clientIdealStep: SubStep = {
  slug: 'client-ideal',
  questions: [
    {
      key: 'ideal_client_size',
      kind: 'multi',
      label: 'questions.idealClientSize.label',
      subtitle: 'questions.idealClientSize.subtitle',
      choices: choice('Moins de 50 salariés', '50 à 500 salariés', '500 à 5 000 salariés', 'Plus de 5 000 salariés'),
    },
    {
      key: 'ideal_client_structure',
      kind: 'multi',
      label: 'questions.idealClientStructure.label',
      subtitle: 'questions.idealClientStructure.subtitle',
      choices: choice(
        'Groupe coté / grand compte',
        'Filiale de groupe',
        'PME indépendante / familiale',
        'Startup / Scale-up',
        'Secteur public & Collectivités',
      ),
    },
    {
      key: 'ideal_client_maturity',
      kind: 'multi',
      label: 'questions.idealClientMaturity.label',
      subtitle: 'questions.idealClientMaturity.subtitle',
      choices: choice(
        'Client en démarrage / structuration',
        'Client en forte croissance',
        'Client établi, activité stable',
        'Client en transformation ou restructuration',
      ),
    },
    {
      key: 'ideal_client_territory',
      kind: 'multi',
      label: 'questions.idealClientTerritory.label',
      subtitle: 'questions.idealClientTerritory.subtitle',
      // #2088.28 — pourquoi on la pose : distincte de `geo_zones`, qui est la
      // zone de CHASSE du vendeur, pas celle du client.
      rationaleKey: 'questions.idealClientTerritory.rationale',
      choices: choice(
        'Clients basés en Île-de-France',
        'Clients basés en région',
        'Clients basés à l’international',
        'Peu importe la localisation du client',
      ),
    },
    {
      key: 'ideal_client_accessibility',
      kind: 'single',
      label: 'questions.idealClientAccessibility.label',
      choices: choice(
        'Accessible directement (réseau ou déjà en contact)',
        'Accessible via un intermédiaire (partenaire, recommandation)',
        'Hors réseau actuel, prospection à froid nécessaire',
      ),
    },
    {
      key: 'ideal_client_max_sales_cycle',
      kind: 'single',
      label: 'questions.idealClientMaxSalesCycle.label',
      subtitle: 'questions.idealClientMaxSalesCycle.subtitle',
      choices: choice("Moins d'1 mois", '1 à 3 mois', '3 à 6 mois', '6 à 12 mois', 'Plus de 12 mois'),
    },
    {
      key: 'ideal_client_min_deal_size',
      kind: 'single',
      label: 'questions.idealClientMinDealSize.label',
      choices: choice('Moins de 10 000 €', '10 000 à 50 000 €', '50 000 à 150 000 €', 'Plus de 150 000 €'),
      // #2548.2 (#2027.1) — le panier moyen visé est un chiffre : une réponse
      // devinée serait une donnée fictive, l'inconnue nommée (`allowUnknown`)
      // reste honnête tant que personne n'a encore fixé de seuil.
      allowUnknown: true,
    },
    {
      key: 'ideal_client_referencement_constraints',
      kind: 'multi',
      label: 'questions.idealClientReferencementConstraints.label',
      subtitle: 'questions.idealClientReferencementConstraints.subtitle',
      choices: choice(
        "Référencement fournisseur obligatoire (UGAP, centrale d'achat...)",
        'Accord-cadre ou marché existant requis',
        'Audit ou certification préalable exigé',
        'Aucune contrainte de référencement connue',
      ),
    },
    {
      key: 'ideal_client_current_state',
      kind: 'multi',
      label: 'questions.idealClientCurrentState.label',
      subtitle: 'questions.idealClientCurrentState.subtitle',
      choices: choice(
        'Correspond au profil théorique',
        'Accessible dès maintenant',
        'Déjà un client connu',
        'Particulièrement rentable',
      ),
    },
  ],
}
