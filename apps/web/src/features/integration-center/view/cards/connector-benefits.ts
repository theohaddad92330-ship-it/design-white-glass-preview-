import type { ConnectedTool } from '@bellum/contracts'

/**
 * Une action autorisée → la phrase qui dit ce qu'elle apporte (#1443).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /tool-registry` renvoie `allowed_actions` depuis le premier jour. Un
 * balayage du 04/09/2026 sur `apps/web/src` n'en trouvait que des FIXTURES DE
 * TEST : la donnée arrivait dans la mémoire du navigateur et n'atteignait aucun
 * pixel. La carte disait donc la même phrase pour un outil qui sait envoyer un
 * contact et pour un outil qui sait seulement lire un agenda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST JAMAIS AFFICHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Un JETON MACHINE. `export_contact` n'est pas une phrase ; l'afficher brut
 * serait pire que se taire. Une action sans phrase écrite est donc SAUTÉE — et
 * c'est `ConnectorBenefits.test.tsx` qui empêche le trou de s'installer, en
 * exigeant que CHAQUE jeton du catalogue serveur ait sa phrase en FR et en EN.
 * Une garde par liste de mots serait passée à côté : ce sont des VERBES qu'on
 * ajoute au catalogue, pas des noms propres.
 *
 * Le vocabulaire est celui de la CAPACITÉ, jamais celui d'un éditeur : le nom de
 * l'outil est déjà l'entête de la carte.
 *
 * ⚠️ Séparée du composant : `ConnectorBenefits.tsx` n'exporte QUE des
 * composants, c'est la condition du rechargement à chaud de Vite.
 */
/**
 * ⚠️ EXPORTÉE depuis le 04/09/2026 (#1444) : les rangs de capacité
 * (`capability-tiers.ts`) doivent prouver qu'ils couvrent TOUT ce vocabulaire.
 * Une action sans rang serait silencieusement absente de la carte — un outil qui
 * sait écrire s'afficherait comme s'il savait seulement lire. La liste reste
 * l'unique propriétaire de l'ordre d'affichage.
 */
export const TOOL_ACTION_KEYS = [
  'export_contact',
  'import_contacts',
  'log_activity',
  'log_to_crm',
  'read_opportunities',
  'enrich_contact',
  'search_contacts',
  'search_web',
  'scrape_page',
  'lookup_company',
  'search_files',
  'read_file',
  'read_pages',
  'search_pages',
  'read_emails',
  'create_draft',
  'send_email',
  'list_events',
  'create_event',
  'send_notification',
  'send_event',
  'send_message',
  'view_profile',
  'read_data',
  'run_analysis',
  'read_calls',
  'transcribe_recording',
  'search_offers',
  'read_consultants',
  'read_missions',
  'list_pending_signatures',
  'send_to_signature',
  'list_unpaid_invoices',
  'manage_billing',
] as const

const KNOWN = new Set<string>(TOOL_ACTION_KEYS)

/**
 * Les actions d'un connecteur, dédoublonnées et dans l'ordre du vocabulaire.
 *
 * Une carte porte parfois plusieurs lignes de registre (messagerie + agenda +
 * documents sous un seul consentement) : les concaténer telles quelles
 * répéterait « Chercher un document » deux fois. L'ordre vient de la table
 * ci-dessus, pas de celui du serveur — sinon deux espaces liraient la même
 * carte autrement.
 *
 * ⚠️ `?? []` sur les deux niveaux : le web se déploie en une minute, l'API en
 * dix, et `apiFetch` type par ASSERTION. Un champ obligatoire au contrat peut
 * manquer de la réponse sans que le compilateur le voie.
 */
export function connectorActions(tools: readonly ConnectedTool[] | undefined): string[] {
  const seen = new Set<string>()
  for (const tool of tools ?? []) {
    for (const action of tool.allowed_actions ?? []) {
      if (KNOWN.has(action)) seen.add(action)
    }
  }
  return TOOL_ACTION_KEYS.filter(action => seen.has(action))
}

/**
 * Y A-T-IL QUELQUE CHOSE À DÉPLIER ? — le garde-fou du repli (#1442).
 *
 * ⚠️ Un élément React est TOUJOURS vrai, même quand le composant rend `null`.
 * `details={<ConnectorBenefits …/>}` faisait donc apparaître un bouton « Voir le
 * détail » sur un connecteur sans aucune ligne de registre — un contrôle qui
 * n'ouvre rien, c'est-à-dire pire que pas de contrôle du tout.
 *
 * Le cas n'est pas théorique : `connectorState` rend délibérément `available`
 * quand AUCUNE ligne n'existe côté serveur (« une entrée oubliée au catalogue
 * lors d'un rebase doit dégrader en carte branchable, jamais faire disparaître
 * un outil qui marche »). La carte se rend donc, sans rien à dire d'elle.
 *
 * Les deux moitiés du détail sont couvertes : ce que l'outil sait faire
 * (`allowed_actions`) et ce que les diagnostics ont à montrer (`capabilities`,
 * dont `ConnectorDiagnostics` se tait quand elle est vide).
 */
export function hasConnectorDetails(tools: readonly ConnectedTool[] | undefined): boolean {
  if (connectorActions(tools).length > 0) return true
  return (tools ?? []).some(tool => (tool.capabilities ?? []).length > 0)
}
