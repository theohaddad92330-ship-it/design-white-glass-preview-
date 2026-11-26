/**
 * LE REGISTRE DES GOLDEN JOURNEYS DU LOT X41 (02/10/2026) — seconde moitié de
 * l'épopée #2958 : les parcours 21 à 28, 30 à 32 et 34 à 36 de #2208, et les
 * scénarios #2154.16 à #2154.29 qui n'avaient pas encore leur spec.
 *
 * Un parcours est « couvert » quand un fichier de test nommé l'exerce de bout
 * en bout ; `golden-journeys-x41.test.ts` relit chaque fichier (il existe, il
 * porte le numéro du parcours dans son en-tête) — jamais une case cochée à la
 * main. Même forme et même contrat que le registre du lot X40
 * (`golden-journeys.ts`, parcours 1 à 20) : les deux listes se concatènent à
 * l'intégration, sans collision de numéro (X40 = 1-20, X41 = 21-36).
 *
 * ⚠️ Ce que « couvert » veut dire, et ne veut pas dire : une spec Playwright de
 * `e2e/tests/web/` simule l'API (aucune donnée réelle) et prouve le CLIENT —
 * l'écran, le geste, ce qui part vers le serveur. Elle ne prouve pas le contrat
 * serveur, ni la recette sur données réelles (qui reste humaine).
 *
 * Les parcours 25 (« préparer le renouvellement ») et 26 (« repositionner le
 * consultant ») sont RETIRÉS (#3656, 06/10/2026) : l'écran qu'ils jouaient,
 * `/missions/renouvellements`, est supprimé à la demande de Louis. Leur numéro
 * ne se réattribue pas.
 *
 * Le parcours 29 (« créer une séquence depuis une cible », lot E02, 04/10) :
 * la porte existe désormais — la carte d'une liste de « Mes cibles » porte
 * « Créer une séquence depuis la liste », qui lit l'audience `target_list`
 * (#2380.2) et monte `CreateSequenceDialog`. Tranché sans Louis : la source
 * existait déjà côté contrat et API, seule la porte écran manquait.
 */

export const GOLDEN_JOURNEYS_X41_TOTAL = 13

type GoldenJourneyX41 = {
  number: number
  title: string
  /** Le point `#2958.<k>` qui porte ce parcours (`k = numéro + 31`). */
  issue: string
  /** Chemin depuis la racine du dépôt. */
  file: string
}

const WEB = 'e2e/tests/web'

function journey(number: number, title: string, file: string): GoldenJourneyX41 {
  return { number, title, issue: `#2958.${number + 31}`, file: `${file.includes('/') ? file : `${WEB}/${file}`}` }
}

export const GOLDEN_JOURNEYS_X41: readonly GoldenJourneyX41[] = [
  journey(21, 'Gérer le démarrage', 'golden-journey-21-gerer-demarrage.spec.ts'),
  journey(22, 'Collecter le CRA', 'golden-journey-22-collecter-cra.spec.ts'),
  journey(23, 'Préparer la facture', 'golden-journey-23-preparer-facture.spec.ts'),
  journey(24, 'Suivre l’encaissement', 'golden-journey-24-suivre-encaissement.spec.ts'),
  journey(27, 'Produire un REX', 'golden-journey-27-produire-rex.spec.ts'),
  journey(28, 'Détecter un besoin adjacent', 'golden-journey-28-besoin-adjacent.spec.ts'),
  journey(29, 'Créer une séquence depuis une cible', 'golden-journey-29-sequence-depuis-cible.spec.ts'),
  journey(30, 'Valider les messages', 'golden-journey-30-valider-messages.spec.ts'),
  journey(31, 'Exécuter via un connecteur', 'golden-journey-31-executer-connecteur.spec.ts'),
  journey(32, 'Traiter une erreur', 'golden-journey-32-traiter-erreur.spec.ts'),
  journey(34, 'Corriger une donnée', 'golden-journey-34-corriger-donnee.spec.ts'),
  journey(35, 'Utiliser le produit sans connecteur', 'golden-journey-35-sans-connecteur.spec.ts'),
  journey(36, 'Utiliser le produit sur mobile', 'e2e/tests/web-mobile/golden-journey-36-mobile.spec.ts'),
]

type Scenario2154 = {
  /** Le point `#2154.<k>` du scénario. */
  point: string
  title: string
  file: string
}

/**
 * Les scénarios E2E de #2154 (numérotation du registre : `.16` = « création
 * d'un besoin manuel » … `.29` = « source ou connecteur en erreur »). Certains
 * scénarios sont JOUÉS par un parcours doré (même fichier, même preuve) :
 * `.25` mobile = parcours 36, `.29` connecteur en erreur = parcours 32, `.26`
 * mode démo = parcours 37 (lot précédent).
 */
export const SCENARIOS_2154_X41: readonly Scenario2154[] = [
  { point: '#2154.16', title: 'Création d’un besoin manuel', file: `${WEB}/scenario-2154-16-besoin-manuel.spec.ts` },
  { point: '#2154.17', title: 'Matching depuis un besoin', file: `${WEB}/scenario-2154-17-matching.spec.ts` },
  {
    point: '#2154.18',
    title: 'Passage opportunité signée vers mission',
    file: `${WEB}/scenario-2154-18-opportunite-vers-mission.spec.ts`,
  },
  {
    point: '#2154.19',
    title: 'Création et validation d’une séquence',
    file: `${WEB}/scenario-2154-19-sequence.spec.ts`,
  },
  {
    point: '#2154.20',
    title: 'Manager ouvrant Pilotage',
    file: `${WEB}/scenario-2154-21-membre-sans-permission-manager.spec.ts`,
  },
  {
    point: '#2154.21',
    title: 'Membre sans permission manager',
    file: `${WEB}/scenario-2154-21-membre-sans-permission-manager.spec.ts`,
  },
  { point: '#2154.22', title: 'Ancien favori partagé', file: `${WEB}/scenario-2154-22-24-anciennes-urls.spec.ts` },
  { point: '#2154.23', title: 'Ancienne URL Veille', file: `${WEB}/scenario-2154-22-24-anciennes-urls.spec.ts` },
  {
    point: '#2154.24',
    title: 'Ancienne URL Écritures à valider',
    file: `${WEB}/scenario-2154-22-24-anciennes-urls.spec.ts`,
  },
  { point: '#2154.25', title: 'Mobile', file: 'e2e/tests/web-mobile/golden-journey-36-mobile.spec.ts' },
  { point: '#2154.27', title: 'Workspace multi-BU', file: `${WEB}/scenario-2154-27-multi-bu.spec.ts` },
  {
    point: '#2154.28',
    title: 'Deux utilisateurs simultanés',
    file: `${WEB}/scenario-2154-28-deux-utilisateurs.spec.ts`,
  },
  {
    point: '#2154.29',
    title: 'Source ou connecteur en erreur',
    file: `${WEB}/golden-journey-32-traiter-erreur.spec.ts`,
  },
]

/** Les numéros couverts par ce lot, sans doublon, dans l'ordre de la liste de #2208. */
export function coveredGoldenJourneyX41Numbers(): number[] {
  return [...new Set(GOLDEN_JOURNEYS_X41.map(entry => entry.number))].sort((a, b) => a - b)
}
