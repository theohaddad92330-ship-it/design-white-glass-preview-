/**
 * Ce que Laura a le droit de dire sur l'ÉTAT d'une fonctionnalité.
 *
 * Le rapport du 17/08 range « une date de sortie » et « une fonctionnalité »
 * parmi les choses qui ne s'inventent jamais, et le repo pose la même règle sous
 * un autre nom (« ce qu'on ne promet pas »). Promettre une intégration à un
 * prospect est la faute la plus chère du document : elle ne se découvre qu'au
 * moment où il essaie de s'en servir, c'est-à-dire après avoir payé.
 *
 * D'où une table ÉCRITE À LA MAIN plutôt qu'une liste dérivée du code : ce qui
 * existe dans le dépôt n'est pas ce qu'on assume d'annoncer publiquement, et
 * dériver l'un de l'autre finirait par annoncer un module à moitié branché parce
 * qu'un fichier porte son nom.
 *
 * **Une capacité absente de cette table n'est PAS « non disponible » : elle est
 * inconnue de Laura**, et la règle de vérité du prompt s'applique — elle dit
 * qu'elle préfère ne pas se tromper et transmet la question. La différence
 * compte : « ce n'est pas disponible » est une affirmation, et une affirmation
 * fausse sur un concurrent direct se paie.
 */

/** Les quatre états publics. Il n'y en a volontairement pas de cinquième :
 *  « en cours de développement » est une date de sortie déguisée. */
type PublicFeatureState =
  | 'available'
  /** Livré, ouvert aux bêta-testeurs, susceptible de bouger. */
  | 'beta'
  /** Le code existe, mais une ACTIVATION reste nécessaire — le compte ou les
   *  identifiants de l'outil du client, ou un réglage de notre côté. Dire
   *  « disponible » sans le préciser produit une déception à la première
   *  utilisation, c'est-à-dire après la signature. Le libellé de la capacité
   *  précise ce que l'activation demande, quand elle demande quelque chose. */
  | 'on_request'

type PublicFeature = {
  key: string
  /** Le libellé public, dans les mots d'un commercial d'ESN. */
  label: string
  state: PublicFeatureState
}

/**
 * Nommer la CAPACITÉ, pas l'éditeur — la règle d'arbitrage du 02/08, qui vaut
 * aussi ici : le site public n'a pas à publier la liste exacte des outils
 * connectés, et un éditeur cité devient une promesse de compatibilité.
 * L'exception du repo (l'écran Réglages › Intégrations) ne s'applique pas à un
 * chatbot commercial, qui ne connecte rien.
 *
 * ⚠️ D354 (30/08/2026) précise la portée de cette table, sans la contredire.
 * Les PAGES du site, elles, ont le droit de nommer l'outil du CLIENT — un
 * prospect demande « est-ce que ça marche avec le MIEN ? », et « votre CRM » ne
 * lui répond pas. Ce qui reste vrai ici : **Laura ne récite pas de liste de
 * marques**, elle récite des états. Et c'est cette table qui les porte pour les
 * DEUX bouches : GA-124 (`published-third-party-names.test.ts`) exige que chaque
 * intégration nommée sur une page pointe une clé d'ici. Sans ce lien, la page
 * écrivait « Oui : export vers HubSpot et Salesforce » pendant que Laura
 * répondait « disponible sur activation » — au même visiteur, dans la même
 * visite. Mesuré le 30/08/2026.
 */
export const PUBLIC_FEATURES: readonly PublicFeature[] = [
  { key: 'account_analysis', label: 'Analyse de compte (entités, décideurs, organigramme)', state: 'available' },
  { key: 'buy_signals', label: "Détection de projets et de signaux d'achat", state: 'available' },
  {
    key: 'contact_enrichment',
    label: 'Enrichissement de contacts (e-mail professionnel, téléphone)',
    state: 'available',
  },
  { key: 'messages', label: "Messages et angles d'accroche personnalisés", state: 'available' },
  { key: 'action_plan', label: "Plan d'action commercial et exports", state: 'available' },
  { key: 'copilot', label: 'Laura sur les comptes analysés', state: 'available' },
  {
    key: 'crm_sync',
    label: 'Connexion à votre CRM (export de contacts, notes, tâches) — avec le compte de votre outil',
    state: 'on_request',
  },
  {
    key: 'mailbox',
    label: 'Connexion à votre messagerie et à votre agenda — avec le compte de votre outil',
    state: 'on_request',
  },
  {
    key: 'ats',
    label: 'Connexion à votre ATS/ERP (lecture des missions et des consultants) — avec les identifiants de votre outil',
    state: 'on_request',
  },
  // Les canaux d'équipe ne demandent NI clé d'opérateur NI compte à autoriser :
  // le client colle une adresse de webhook dans Réglages › Intégrations et
  // envoie un message de test. C'est le seul connecteur dont l'état « disponible »
  // ne dépende de personne d'autre que lui.
  {
    key: 'notifications',
    label: "Notifications vers le canal de votre équipe ou un webhook (signaux d'achat, analyses terminées)",
    state: 'available',
  },
  // L'assistant IA passe par le serveur MCP, qui est ALLUMÉ PAR NOUS
  // (`MCP_PUBLIC_URL`) : sans lui, le registre d'outils rapporte `coming_soon`.
  // Ce n'est donc pas « disponible » tout court, et le client n'a pourtant aucun
  // identifiant à fournir — d'où l'état « sur activation », et le libellé
  // générique qui l'accompagne désormais.
  {
    key: 'ai_assistant',
    label: 'Connexion de votre assistant IA à vos comptes analysés (protocole MCP)',
    state: 'on_request',
  },
  { key: 'routines', label: 'Routines et automatisations programmées', state: 'beta' },
  { key: 'talent_pool', label: 'Vivier : matching consultant ↔ besoin, réécriture de CV', state: 'beta' },
  { key: 'manager_cockpit', label: 'Pilotage manager (équipe, crédits, actions)', state: 'beta' },
]

/**
 * ⚠️ « nécessite les identifiants de votre outil » vivait ICI, et devenait faux
 * dès qu'une capacité s'activait sans que le client fournisse quoi que ce soit
 * (le serveur MCP est allumé de NOTRE côté). La nuance a donc rejoint les trois
 * libellés où elle est vraie : un état dit ce qu'il est, il n'explique pas la
 * capacité à sa place.
 */
const STATE_LABEL: Record<PublicFeatureState, string> = {
  available: 'disponible',
  beta: 'en bêta',
  on_request: 'disponible sur activation',
}

/**
 * Les statuts en texte, prêts à être injectés dans le contexte du modèle.
 *
 * On rend les libellés TELS QUELS, sans les résumer : « en bêta » et
 * « sur activation » sont exactement les nuances qu'une reformulation efface, et
 * ce sont elles qui évitent la déception à la première utilisation.
 */
export function renderPublicFeatureStatus(features: readonly PublicFeature[] = PUBLIC_FEATURES): string | null {
  if (!features.length) return null
  return features.map(feature => `- ${feature.label} : ${STATE_LABEL[feature.state]}`).join('\n')
}
