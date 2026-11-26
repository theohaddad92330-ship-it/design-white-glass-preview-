import { TOOL_ACTION_KEYS } from '../view/cards/connector-benefits'

/**
 * CE QUE BELLUM SAIT FAIRE AVEC UN OUTIL, EN TROIS RANGS — #1444.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPROCHE, ET POURQUOI IL TOUCHE UNE DOCTRINE
 * ─────────────────────────────────────────────────────────────────────────────
 * *« L'utilisateur doit comprendre la différence entre "connecté" et "Bellum
 * peut réellement faire cette action". »* La carte listait ses capacités à plat :
 * lire un agenda et envoyer un e-mail au nom de quelqu'un s'y ressemblaient.
 *
 * Or la distinction que le retour propose — **Lire · Préparer · Agir après
 * validation** — n'est pas une trouvaille d'affichage : c'est une règle du
 * produit, écrite depuis longtemps et jamais montrée. Le copilote PRÉPARE, il
 * n'envoie jamais ; une écriture passe par une porte. Les trois rangs rendent
 * visible ce que le code fait déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ PASSE LA FRONTIÈRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Lire** — rien ne bouge chez toi ni chez l'outil. Y compris
 *    `import_contacts`, qui fait entrer de la donnée DANS Bellum : c'est notre
 *    base qui change, pas la sienne.
 *  · **Préparer** — le produit fabrique quelque chose que personne n'a encore
 *    envoyé : un brouillon, un enrichissement, une transcription. Le résultat
 *    reste chez nous.
 *  · **Agir après validation** — ça SORT : un e-mail part, une ligne s'écrit
 *    dans le CRM, un événement se pose dans un agenda. Toujours après un geste
 *    humain — c'est la doctrine, pas une option de réglage.
 *
 * ⚠️ La table est EXHAUSTIVE sur le vocabulaire du serveur, et un test le
 * vérifie. Une action sans rang serait silencieusement absente de l'écran :
 * l'utilisateur verrait « connecté » sans savoir que cet outil sait écrire —
 * exactement l'inverse de ce que cette issue demande.
 */
export const CAPABILITY_TIERS = ['read', 'prepare', 'act'] as const

export type CapabilityTier = (typeof CAPABILITY_TIERS)[number]

const TIER_OF: Record<string, CapabilityTier> = {
  // Lire — rien ne bouge chez l'outil.
  read_opportunities: 'read',
  search_contacts: 'read',
  import_contacts: 'read',
  search_web: 'read',
  scrape_page: 'read',
  lookup_company: 'read',
  search_files: 'read',
  read_file: 'read',
  read_pages: 'read',
  search_pages: 'read',
  read_emails: 'read',
  list_events: 'read',
  view_profile: 'read',
  read_data: 'read',
  read_calls: 'read',
  search_offers: 'read',
  read_consultants: 'read',
  read_missions: 'read',
  list_pending_signatures: 'read',
  list_unpaid_invoices: 'read',

  // Préparer — le produit fabrique, rien ne part.
  create_draft: 'prepare',
  enrich_contact: 'prepare',
  run_analysis: 'prepare',
  transcribe_recording: 'prepare',

  // Agir après validation — ça sort, et jamais sans un geste humain.
  export_contact: 'act',
  log_activity: 'act',
  log_to_crm: 'act',
  send_email: 'act',
  create_event: 'act',
  send_notification: 'act',
  send_event: 'act',
  send_message: 'act',
  send_to_signature: 'act',
  manage_billing: 'act',
}

/** Le rang d'une action, ou `null` si le vocabulaire du serveur en a gagné une. */
export function tierOf(action: string): CapabilityTier | null {
  return TIER_OF[action] ?? null
}

/**
 * Les actions d'un connecteur, rangées — et les rangs VIDES sont retirés.
 *
 * Un rang « Agir après validation » affiché sans une seule ligne dessous se lit
 * comme une capacité perdue, alors qu'il veut dire « cet outil ne sait que
 * lire ». C'est justement la distinction que l'issue demande de rendre nette.
 */
export function tieredActions(actions: readonly string[]): { tier: CapabilityTier; actions: string[] }[] {
  return CAPABILITY_TIERS.map(tier => ({ tier, actions: actions.filter(action => tierOf(action) === tier) })).filter(
    group => group.actions.length > 0,
  )
}

/** Le vocabulaire que la table doit couvrir — lu, jamais recopié. */
export const TIERED_VOCABULARY: readonly string[] = TOOL_ACTION_KEYS
