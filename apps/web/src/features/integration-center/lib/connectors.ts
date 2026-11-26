import type { ConnectedTool, CrmProvider, PlanFeatureKey, ToolStatus } from '@bellum/contracts'

/**
 * Le catalogue CÔTÉ ÉCRAN des outils qu'un utilisateur peut brancher lui-même.
 *
 * Il ne redouble pas le registre du serveur, il le REGROUPE. Le registre
 * raisonne en capacités (Gmail, Google Agenda et Google Drive sont trois
 * lignes) ; l'écran raisonne en gestes (« connecter Google Workspace » est un
 * seul bouton, et trois cartes qui ouvrent le même consentement se lisent comme
 * trois choses à faire).
 *
 * Deux règles portent l'honnêteté de l'écran :
 *
 * - **on ne montre que ce qui est branchable.** Un outil que CE serveur n'offre
 *   pas (application OAuth non déclarée) disparaît — un bouton « Connecter » qui
 *   répond 400 est pire qu'une absence. L'inventaire complet, lui, vit au
 *   back-office : c'est là qu'on voit qu'il manque une clé ;
 * - **la plomberie n'est pas une intégration.** Les sources de données du moteur
 *   (recherche web, registre d'entreprises, scraping, enrichissement) et la
 *   facturation tournent avec les clés de la plateforme. L'utilisateur ne les
 *   branche pas, ne peut pas les débrancher, et les lui montrer expose notre
 *   chaîne d'outillage sans lui donner un seul geste.
 */

/** Les sections de l'écran, dans leur ordre d'affichage. Ce n'est pas
 *  alphabétique : on ouvre sur ce qui porte la journée d'un commercial. */
export const CONNECTOR_FAMILY_ORDER = [
  'crm',
  'workspace',
  'communication',
  // #4427 — l'outil de séquences de l'ESN (Lemlist) : ni un canal d'équipe, ni un CRM.
  'outreach',
  'ats',
  'telephony',
  'admin_docs',
  'assistant',
] as const

type ConnectorFamily = (typeof CONNECTOR_FAMILY_ORDER)[number]

export type ConnectorId =
  | 'google'
  | 'microsoft'
  // #4185 — les CRM : ceux du contrat de l'adaptateur commun.
  | CrmProvider
  | 'notion'
  | 'slack'
  | 'discord'
  | 'teams'
  | 'googlechat'
  | 'mattermost'
  // #4406.4 — Beeper Desktop de l'utilisateur (accès distant + son tunnel).
  | 'beeper'
  | 'webhook'
  | 'lemlist'
  | 'ats'
  | 'telephony'
  | 'admin_docs'
  | 'mcp'

type ConnectorDef = {
  id: ConnectorId
  family: ConnectorFamily
  /** Nom propre affiché. Cet écran, et lui seul, a le droit de nommer l'éditeur :
   *  un bouton « Connecter » doit dire ce qu'il connecte. */
  displayName: string
  /** Les lignes du registre serveur qui portent l'état de ce connecteur. */
  registryProviders: readonly string[]
  /**
   * #2207.17 — la feature de palier dont dépend la CONNEXION ELLE-MÊME, pas
   * une action isolée dessus (`crm_sync`, lui, ne gate que l'export d'un
   * contact — `ContactCrmExport.tsx` — jamais la connexion HubSpot/Salesforce,
   * qui reste utile sans lui). Absent ⇒ le connecteur n'est derrière aucun
   * palier : le prédicat de `buildConnectorsView` n'est jamais consulté pour
   * lui.
   */
  planFeature?: PlanFeatureKey
}

export const CONNECTORS: readonly ConnectorDef[] = [
  { id: 'hubspot', family: 'crm', displayName: 'HubSpot', registryProviders: ['hubspot'] },
  { id: 'salesforce', family: 'crm', displayName: 'Salesforce', registryProviders: ['salesforce'] },
  { id: 'pipedrive', family: 'crm', displayName: 'Pipedrive', registryProviders: ['pipedrive'] },
  { id: 'attio', family: 'crm', displayName: 'Attio', registryProviders: ['attio'] },
  { id: 'odoo', family: 'crm', displayName: 'Odoo', registryProviders: ['odoo'] },
  { id: 'zoho', family: 'crm', displayName: 'Zoho CRM', registryProviders: ['zoho'] },

  // Un seul consentement OAuth ouvre messagerie, agenda et documents : une carte.
  {
    id: 'google',
    family: 'workspace',
    displayName: 'Google Workspace',
    registryProviders: ['gmail', 'google-calendar', 'google-drive'],
  },
  { id: 'microsoft', family: 'workspace', displayName: 'Microsoft 365', registryProviders: ['microsoft'] },
  { id: 'notion', family: 'workspace', displayName: 'Notion', registryProviders: ['notion'] },

  { id: 'slack', family: 'communication', displayName: 'Slack', registryProviders: ['slack'] },
  { id: 'teams', family: 'communication', displayName: 'Microsoft Teams', registryProviders: ['teams'] },
  { id: 'googlechat', family: 'communication', displayName: 'Google Chat', registryProviders: ['googlechat'] },
  { id: 'discord', family: 'communication', displayName: 'Discord', registryProviders: ['discord'] },
  { id: 'mattermost', family: 'communication', displayName: 'Mattermost', registryProviders: ['mattermost'] },
  // #4406.4 — aucune ligne de registre serveur : la carte lit `/beeper/status` (rendue « branchable »).
  // #4406.1 — Beeper est une MESSAGERIE (famille « Messagerie, agenda et documents »), pas un canal d'équipe.
  { id: 'beeper', family: 'workspace', displayName: 'Beeper', registryProviders: ['beeper'] },
  { id: 'webhook', family: 'communication', displayName: 'Webhook', registryProviders: ['webhook'] },

  // #4427.1 — branché par CLÉ d'API, par espace.
  { id: 'lemlist', family: 'outreach', displayName: 'Lemlist', registryProviders: ['lemlist'] },

  { id: 'ats', family: 'ats', displayName: 'BoondManager', registryProviders: ['boondmanager'] },
  {
    id: 'telephony',
    family: 'telephony',
    displayName: 'Aircall · Ringover · Allo',
    registryProviders: ['aircall', 'ringover', 'allo'],
  },
  {
    id: 'admin_docs',
    family: 'admin_docs',
    displayName: 'Yousign · DocuSign · Qonto · Tiime',
    registryProviders: ['yousign', 'docusign', 'qonto', 'tiime'],
  },

  {
    id: 'mcp',
    family: 'assistant',
    displayName: 'Assistant IA',
    registryProviders: ['mcp'],
    planFeature: 'mcp_assistant',
  },
]

/** L'état d'un connecteur à l'écran. Quatre réponses à « qu'est-ce que je peux
 *  faire ? » : les trois d'origine, plus `not_included_in_plan` (#2207.17) —
 *  l'offre en cours n'ouvre pas cette connexion, distinct d'« available » qui
 *  promettrait un clic qui échoue derrière le mur de palier. */
export type ConnectorState = 'connected' | 'action_required' | 'available' | 'not_included_in_plan'

export type ConnectorView = ConnectorDef & {
  state: ConnectorState
  /**
   * Les lignes de registre qui portent ce connecteur.
   *
   * L'écran n'avait accès qu'à l'état à trois valeurs. Or ce que le PDF 7 exige
   * — dernière preuve, dernière erreur, portée manquante — vit sur les
   * capacités de CHAQUE ligne, et n'atteignait donc aucun composant.
   */
  tools: ConnectedTool[]
}

type ConnectorGroup = { family: ConnectorFamily; connectors: ConnectorView[] }

type ConnectorsView = {
  groups: ConnectorGroup[]
  counts: { connected: number; actionRequired: number; available: number }
  /**
   * Tout ce qui est branchable, AVANT filtre et recherche (#1445).
   *
   * ⚠️ « Recommandé pour démarrer » ne dépend pas de ce que l'utilisateur est en
   * train de chercher : taper « hub » dans la barre ne doit pas faire croire
   * qu'il ne reste qu'une étape de démarrage. Les compteurs de l'entête sont
   * déjà calculés sur cette même liste, et pour la même raison.
   */
  all: ConnectorView[]
}

/** Le filtre de la barre d'en-tête. */
type ConnectorFilter = 'all' | 'connected' | 'available'

/**
 * L'état d'un connecteur, à partir des lignes de registre qui le portent.
 *
 * L'ordre des tests est l'ordre d'urgence : une autorisation expirée passe
 * devant « connecté », parce qu'un Google Workspace dont le jeton est mort
 * s'affichait « connecté » et laissait chercher la panne ailleurs.
 *
 * Un connecteur dont AUCUNE ligne n'existe côté serveur est rendu `available`
 * plutôt que masqué : une entrée oubliée au catalogue lors d'un rebase doit
 * dégrader en carte branchable, jamais faire disparaître un outil qui marche.
 */
export function connectorState(rows: readonly ConnectedTool[]): ConnectorState | null {
  if (rows.length === 0) return 'available'
  const statuses = new Set<ToolStatus>(rows.map(r => r.status))
  if (statuses.has('action_required')) return 'action_required'
  if (statuses.has('connected')) return 'connected'
  if (statuses.has('available')) return 'available'
  // Toutes les lignes en `coming_soon` : ce serveur n'offre pas l'outil.
  return null
}

/**
 * La carte est-elle « branchée » ? UNE seule réponse pour la carte ET le filtre « Branchés » : quand le registre
 * a tranché (`connected`, `action_required`, `available`), c'est lui — le `/status` du module rend `connected`
 * jusqu'au premier appel qui échoue et pouvait dire autre chose que le filtre (HubSpot listé « Branché » mais
 * proposé en « Connecter HubSpot »). Sans état de registre (`not_included_in_plan`, prop absente), le `/status`.
 */
export function isConnectorCardConnected(
  state: ConnectorState | undefined,
  statusConnected: boolean | undefined,
): boolean {
  if (state === 'connected' || state === 'action_required') return true
  if (state === 'available') return false
  return statusConnected ?? false
}

/**
 * Construit la vue de l'écran.
 *
 * Les familles vides ne sont pas rendues — un titre « Téléphonie » suivi de rien
 * se lit comme une panne d'affichage. Le tri interne remonte ce qui demande un
 * geste, puis ce qui marche, puis ce qui reste à brancher.
 */
export function buildConnectorsView(
  registry: readonly ConnectedTool[],
  filter: ConnectorFilter = 'all',
  search = '',
  /**
   * #2207.17 — l'offre en cours ouvre-t-elle cette feature ? Repli `() => true`
   * (« toujours ouvert ») pour que les appelants qui ignorent le palier — donc
   * tous ceux d'AVANT ce point — gardent EXACTEMENT le même comportement,
   * jamais un connecteur verrouillé par surprise sur un simple oubli d'argument.
   */
  isPlanFeatureAllowed: (feature: PlanFeatureKey) => boolean = () => true,
): ConnectorsView {
  const byProvider = new Map(registry.map(tool => [tool.provider, tool]))
  const needle = search.trim().toLocaleLowerCase()

  const visible: ConnectorView[] = []
  for (const def of CONNECTORS) {
    const rows = def.registryProviders.map(p => byProvider.get(p)).filter((t): t is ConnectedTool => Boolean(t))
    const baseState = connectorState(rows)
    if (baseState === null) continue
    // Le mur de palier ne s'applique JAMAIS à une connexion déjà `connected`
    // ou `action_required` : downgrader une connexion active sous les pieds
    // d'un client n'est pas une décision que cet écran a le droit de prendre
    // seul — c'est celle, plus large, du sort d'un abonnement résilié.
    const state: ConnectorState =
      baseState === 'available' && def.planFeature && !isPlanFeatureAllowed(def.planFeature)
        ? 'not_included_in_plan'
        : baseState
    visible.push({ ...def, state, tools: rows })
  }

  // Les compteurs portent sur TOUT ce qui est branchable, pas sur ce que le
  // filtre laisse voir : « 3 branchés » doit rester vrai quand on cherche.
  // `not_included_in_plan` ne compte dans AUCUN des trois : il n'est ni
  // branché, ni vraiment « à brancher » (le clic échouerait sur l'offre).
  const counts = {
    connected: visible.filter(c => c.state === 'connected').length,
    actionRequired: visible.filter(c => c.state === 'action_required').length,
    available: visible.filter(c => c.state === 'available').length,
  }

  const kept = visible.filter(c => {
    if (needle && !c.displayName.toLocaleLowerCase().includes(needle)) return false
    if (filter === 'connected') return isConnectorCardConnected(c.state, undefined)
    if (filter === 'available') return c.state === 'available'
    return true
  })

  const groups: ConnectorGroup[] = CONNECTOR_FAMILY_ORDER.map(family => ({
    family,
    connectors: kept.filter(c => c.family === family).sort((a, b) => urgency(a) - urgency(b)),
  })).filter(group => group.connectors.length > 0)

  return { groups, counts, all: visible }
}

function urgency(c: ConnectorView): number {
  return c.state === 'action_required' ? 0 : c.state === 'connected' ? 1 : 2
}
