import {
  connectedClientTools,
  toolFamiliesOf,
  type ConnectedTool,
  type InternalCapabilityDescriptor,
  type ToolFamily,
} from '@bellum/contracts'

/**
 * Digest des CAPACITÉS connectées — la version que le copilote a le droit de lire.
 *
 * Le registre d'outils est nominatif par construction : il doit l'être, c'est
 * lui qui pilote l'écran Réglages › Intégrations où l'utilisateur autorise
 * lui-même chaque accès. Mais le résumé injecté dans le prompt partait tel quel
 * (« - Dropcontact (connecté) : enrich_contact — coût : 1 crédit par
 * enrichissement réussi »), si bien que le copilote citait spontanément les
 * fournisseurs de Bellum à un commercial — parfois en clientèle.
 *
 * L'addendum final (p12, backlog P0 n°1) tranche : on nomme la capacité, pas le
 * produit. Ce module fait la conversion, et il la fait par AGRÉGATION : deux CRM
 * connectés ne produisent pas deux lignes mais un seul « votre CRM », parce que
 * du point de vue du commercial il n'y a qu'une capacité « CRM ».
 *
 * Ce qui reste dit : la capacité, ce qu'elle permet de lire/écrire, son état, et
 * le coût en CRÉDITS — la monnaie de Bellum, que l'utilisateur paie et doit donc
 * connaître avant de valider une action. Ce qui disparaît : nos fournisseurs, les
 * quotas, les rate limits, les politiques de rétention (back-office DM).
 *
 * #1912.11 — décision Louis 13/09/2026, batch 11 : la règle « on nomme la
 * capacité, pas le produit » est refaite sur l'axe D354. L'outil que l'ESPACE a
 * branché se nomme après sa capacité (« votre messagerie — Gmail »), pour que
 * Laura puisse dire « brouillon déposé dans Gmail » ; NOTRE fournisseur ne sort
 * jamais, même « connecté » par une clé serveur. La distinction n'est pas faite
 * ici : elle vit dans `connectedClientTools` (`@bellum/contracts`), la même que
 * celle de l'écran.
 */

/**
 * Libellé de capacité par famille — du point de vue du commercial, jamais du
 * fournisseur.
 *
 * #1955.23 — LE PRODUIT TUTOIE, PARTOUT (« Écris ton message… », « Ton
 * portefeuille compte 27 comptes analysés »). Mesuré en production
 * (0ccc8961a) : ces libellés vouvoyaient (« vos canaux d'équipe », « votre
 * ATS »), seul endroit du produit à le faire — ils ressortent tels quels dans
 * la section « limites » de l'export d'un fil (`notConnectedCapabilityLabels`,
 * `chat-thread-export.service.ts`) et dans le digest injecté au prompt de
 * Laura (`renderCapabilityDigest`, ci-dessous) : les DEUX suivent, puisque
 * c'est la même table (GA-26). Le tutoiement de Laura est FIXE — décision de
 * Louis du 15/09/2026 (#1928.1, `reply-preferences.ts:20-22`).
 *
 * ⚠️ Ce que ce lot ne change pas : la capacité nommée (« les réseaux
 * professionnels », jamais LinkedIn), qui reste la doctrine D354 — on nomme ce
 * que l'espace a BRANCHÉ, jamais ce qui NOUS sert.
 */
const CAPABILITY_LABELS: Record<ToolFamily, string> = {
  crm: 'ton CRM',
  email: 'ta messagerie',
  calendar: 'ton agenda',
  linkedin: 'les réseaux professionnels',
  prospection: 'la recherche de coordonnées',
  documents: 'tes documents',
  communication: "tes canaux d'équipe",
  jobs: "les sources d'offres d'emploi",
  data: 'les sources publiques et le web',
  finance: 'ta facturation',
  mcp: 'ton assistant IA externe',
  ats: 'ton ATS',
  telephony: 'ton outil d’appel',
  admin_docs: 'tes signatures et tes factures',
  // #2261.30 — distincte de `jobs` : un appel d'offres n'est pas une offre d'emploi.
  tenders: "les appels d'offres publics",
}

/**
 * Verbe métier par action outillée. Une action absente de cette table n'est PAS
 * rendue : un jeton machine inconnu (« run_analysis_v2 ») vaut mieux tu qu'affiché
 * tel quel dans une phrase française.
 */
const ACTION_LABELS: Record<string, string> = {
  create_draft: 'préparer un brouillon',
  create_event: 'créer un événement',
  enrich_contact: 'retrouver des coordonnées',
  export_contact: 'créer ou mettre à jour une fiche',
  import_contacts: 'importer des contacts',
  list_events: "lire l'agenda",
  log_activity: 'écrire une note',
  lookup_company: 'vérifier une entreprise',
  read_data: 'lire les données',
  read_emails: 'lire les échanges',
  read_file: 'lire un document',
  read_pages: 'lire une page',
  run_analysis: 'lancer une analyse',
  scrape_page: 'lire une page',
  search_contacts: 'rechercher des contacts',
  search_files: 'chercher dans les documents',
  search_offers: 'chercher des offres',
  search_pages: 'chercher dans les pages',
  search_tenders: "chercher des appels d'offres",
  search_web: 'chercher sur le web',
  send_email: 'envoyer un email après validation',
  send_event: 'envoyer une invitation',
  send_message: 'envoyer un message',
  send_notification: 'notifier',
  view_profile: 'consulter un profil',
  manage_billing: "gérer l'abonnement",
  read_missions: 'lire les missions en cours',
  read_consultants: 'lire les consultants disponibles',
  read_opportunities: 'lire les besoins ouverts',
  read_calls: "lire le journal d'appels",
  log_to_crm: 'verser un appel dans le CRM',
  list_pending_signatures: 'lister ce qui attend une signature',
  send_to_signature: 'envoyer à signature après validation',
  list_unpaid_invoices: 'lister les factures impayées',
}

/** Ce que coûte une capacité, en crédits Bellum. Rien d'autre ne sort. */
const COST_INCLUDED = 'inclus dans ton offre'

/**
 * Le coût d'un outil réduit à ce qui concerne l'utilisateur : un débit en
 * crédits, ou rien. On repart du `cost_model` déclaré mais on ne le recopie pas
 * — il porte parfois une parenthèse fournisseur (« provider par défaut »). Seule
 * la partie « N crédit(s) par … » est conservée.
 */
export function creditCostOf(tool: ConnectedTool): string {
  const raw = tool.cost_model?.fr ?? ''
  const match = /(\d+\s+crédits?\s+par\s+[^(.;]+)/i.exec(raw)
  return match ? match[1].trim() : COST_INCLUDED
}

/** Une capacité agrégée, prête à être rendue en une ligne. */
type Capability = {
  family: ToolFamily
  label: string
  /**
   * #1912.11 — décision Louis 13/09/2026, batch 11 : les outils que l'ESPACE a
   * branchés pour cette capacité, sous leur nom (« votre messagerie — Gmail »).
   * Lus par `connectedClientTools`, la seule dérivation : nos fournisseurs n'y
   * figurent jamais, même « connectés » par une clé serveur.
   */
  tools: string[]
  /** `true` dès qu'au moins un outil de la famille est vraiment connecté. */
  connected: boolean
  /** `true` quand une connexion existe mais demande une reconnexion. */
  needsAttention: boolean
  actions: string[]
  cost: string
}

/**
 * Regroupe les outils VIVANTS (connectés, ou connectés-mais-à-reconnecter) par
 * capacité. L'ordre de sortie suit celui de {@link CAPABILITY_LABELS} pour que
 * deux réponses successives ne présentent pas les mêmes capacités dans un ordre
 * différent (un prompt instable casse le cache et la relecture).
 */
export function aggregateCapabilities(tools: readonly ConnectedTool[]): Capability[] {
  const byFamily = new Map<ToolFamily, Capability>()
  const branched = connectedClientTools(tools)
  // #3973 — un outil compte dans CHACUNE des familles qu'il sert (`toolFamiliesOf`) :
  // Microsoft 365 seul, c'est aussi « ton agenda — Outlook (connecté) ».
  const toolsOf = (family: ToolFamily) =>
    branched.filter(tool => toolFamiliesOf(tool).includes(family)).map(tool => tool.name)
  for (const tool of tools) {
    if (tool.status !== 'connected' && tool.status !== 'action_required') continue
    const actions = tool.allowed_actions.map(a => ACTION_LABELS[a]).filter((a): a is string => Boolean(a))
    for (const family of toolFamiliesOf(tool)) {
      const existing = byFamily.get(family)
      if (!existing) {
        byFamily.set(family, {
          family,
          label: CAPABILITY_LABELS[family],
          tools: toolsOf(family),
          connected: tool.status === 'connected',
          needsAttention: tool.status === 'action_required',
          actions: [...new Set(actions)],
          cost: creditCostOf(tool),
        })
        continue
      }
      existing.connected ||= tool.status === 'connected'
      existing.needsAttention ||= tool.status === 'action_required'
      existing.actions = [...new Set([...existing.actions, ...actions])]
      // Un coût en crédits l'emporte sur « inclus » : mieux vaut annoncer le débit
      // le plus élevé de la capacité que laisser croire qu'elle est gratuite.
      if (existing.cost === COST_INCLUDED) existing.cost = creditCostOf(tool)
    }
  }
  const order = Object.keys(CAPABILITY_LABELS) as ToolFamily[]
  return order.filter(f => byFamily.has(f)).map(f => byFamily.get(f) as Capability)
}

/**
 * #1955.23 — le COMPLÉMENT d'`aggregateCapabilities` : les familles où Laura
 * n'a aucun outil `connected` ni `action_required`, donc rien à consulter.
 *
 * Sert la section « limites » d'un export de fil (#1955.7) : nommer ce que
 * Laura n'a pas pu consulter est une donnée MESURÉE (le registre de l'espace),
 * jamais une liste devinée. `CAPABILITY_LABELS` reste l'unique endroit qui
 * nomme les 15 familles (GA-26) — cette fonction en lit le complément, elle ne
 * les recopie pas.
 */
export function notConnectedCapabilityLabels(tools: readonly ConnectedTool[]): string[] {
  const connectedFamilies = new Set(aggregateCapabilities(tools).map(capability => capability.family))
  const order = Object.keys(CAPABILITY_LABELS) as ToolFamily[]
  return order.filter(family => !connectedFamilies.has(family)).map(family => CAPABILITY_LABELS[family])
}

/**
 * #2261.21-32 — libellé métier des capacités INTERNES, jumeau de
 * `CAPABILITY_LABELS` pour les neuf familles natives du produit (jamais un
 * fournisseur : ce sont des moteurs internes, pas des outils tiers).
 *
 * `invoicing` (#2261.31) : le FACTORING de l'ESN sur ses propres missions —
 * ne pas confondre avec `finance` (l'abonnement Bellum) ni `admin_docs`
 * (l'outil compta que le CLIENT connecte), qui restent des familles TIERS.
 */
const INTERNAL_CAPABILITY_LABELS: Record<InternalCapabilityDescriptor['key'], string> = {
  accounts: 'tes comptes suivis',
  contacts: 'tes contacts',
  needs: 'tes besoins ouverts',
  talent_pool: 'le vivier de consultants',
  missions: 'tes missions',
  market_memory: 'les observations du marché',
  dataforge: 'DataForge',
  invoicing: 'ton factoring',
  routines: 'les routines',
}

/**
 * Rendu FR du digest des capacités INTERNES — jumeau de
 * {@link renderCapabilityDigest}, mais sans fournisseur, sans coût et sans état
 * de connexion à négocier : une capacité interne est disponible, ou coupée avec
 * sa raison NOMMÉE (jamais un booléen nu).
 */
export function renderInternalCapabilityDigest(
  descriptors: readonly InternalCapabilityDescriptor[],
  maxLines: number,
): string | null {
  if (descriptors.length === 0) return null
  const lines = descriptors.slice(0, maxLines).map(descriptor => {
    const label = INTERNAL_CAPABILITY_LABELS[descriptor.key]
    if (descriptor.available) return `- ${label} (disponible)`
    return `- ${label} (indisponible) : ${descriptor.unavailable_reason?.fr ?? ''}`
  })
  return lines.join('\n')
}

/**
 * Rendu FR du digest, une ligne par capacité, borné par l'appelant.
 * `null` quand rien n'est connecté (le bloc de prompt n'est alors pas rendu).
 */
export function renderCapabilityDigest(tools: readonly ConnectedTool[], maxLines: number): string | null {
  const capabilities = aggregateCapabilities(tools)
  if (capabilities.length === 0) return null
  const lines = capabilities.slice(0, maxLines).map(capability => {
    // « connecté » l'emporte : une capacité portée par deux outils dont un seul
    // est cassé reste utilisable, on le signale sans la déclarer indisponible.
    const state = capability.connected
      ? capability.needsAttention
        ? 'connecté, une connexion à renouveler'
        : 'connecté'
      : 'reconnexion requise'
    const actions = capability.actions.length > 0 ? capability.actions.join(', ') : 'lecture seule'
    // #1912.11 — décision 13/09 batch 11 : l'outil BRANCHÉ se nomme après sa
    // capacité ; sans outil du client, la ligne reste celle d'avant, au byte près.
    const named =
      capability.tools.length > 0 ? `${capability.label} — ${capability.tools.join(', ')}` : capability.label
    return `- ${named} (${state}) : ${actions} — coût : ${capability.cost}`
  })
  return lines.join('\n')
}
