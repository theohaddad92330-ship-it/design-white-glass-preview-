import {
  toolFamiliesOf,
  toolFamilyValues,
  type CapabilityDescriptor,
  type CapabilityKey,
  type ConnectedTool,
  type ToolFamily,
} from './tool-registry.js'

/**
 * #3774 — recette prod 08/10 : « aucun outil n'affiche Lire parmi ses
 * capacités » alors que la lecture est la capacité première. `read` /
 * `search` / `summarize` sont déclarés `probeable: true`
 * (`tool-capabilities.ts`, apps/api) : sans une sonde RÉELLEMENT exécutée,
 * `deriveCapabilityEntryState` les rend `untested`, jamais `operational` —
 * qui exige une preuve (PDF 7 §2). Les capacités d'ÉCRITURE
 * (`prepare`/`send`/`update`/`create`…), elles, sont `probeable: false` et
 * deviennent `operational` dès que la portée est accordée, sans jamais
 * passer par `untested`. Ne garder QUE `operational` (le choix initial de ce
 * chantier) cachait donc systématiquement la lecture, la capacité la plus
 * sûre, derrière l'écriture, la plus risquée.
 *
 * Ce qui compte pour CE chip n'est pas « vérifié », c'est « accordé » : les
 * seuls états qui disent vraiment « cette capacité n'existe pas pour cet
 * espace » sont `not_connected` (l'outil n'est même pas branché — ne
 * devrait pas apparaître ici), `authorization_expired` (le consentement est
 * révoqué) et `scope_missing` (la portée n'a jamais été accordée). Tout le
 * reste — `operational`, `untested`, `degraded`, `sync_late` — dit que la
 * portée EST là, avec une nuance de fraîcheur/preuve qui appartient à la
 * carte de connecteur détaillée, pas à ce chip compact.
 */
const CAPABILITY_NOT_GRANTED_STATES: ReadonlySet<CapabilityDescriptor['state']> = new Set([
  'not_connected',
  'authorization_expired',
  'scope_missing',
])

/**
 * À QUI APPARTIENT L'OUTIL — les deux listes, et la seule dérivation des noms affichables.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE — décision Louis 13/09/2026, batch 11 (#1912.11 ; « brouillon Gmail »
 * #1930 / #1931 / #1942)
 * ─────────────────────────────────────────────────────────────────────────────
 *   • L'outil que l'espace client a LUI-MÊME connecté se nomme, et se montre,
 *     partout où c'est utile : « brouillon déposé dans Gmail », les outils
 *     branchés dans la saisie de Laura. Son nom arrive par INJECTION, depuis les
 *     connexions de l'espace ({@link connectedClientTools}) — jamais écrit en
 *     dur : un littéral le promettrait à qui ne l'a pas branché.
 *   • Un outil NON connecté ne se nomme pas : on nomme la CAPACITÉ (« ta
 *     messagerie », « ton CRM »).
 *   • NOS fournisseurs ne se nomment JAMAIS — enrichissement, collecte, modèles,
 *     hébergement — ni à l'écran, ni dans un prompt, ni sur le site. Ils sont
 *     remplaçables, leur nom ne répond à aucune question du commercial, et les
 *     citer en clientèle expose notre chaîne d'outillage.
 *
 * C'est l'axe D354 du site public (« à qui appartient l'outil ») étendu à
 * l'application. Réglages › Intégrations ne change pas de rôle : c'est toujours
 * là que l'utilisateur autorise l'accès, et l'écran nomme ce qu'il connecte.
 *
 * Règle d'avant (02/08/2026, addendum final p12) : « jamais de nom d'éditeur
 * côté app, seule exception Réglages › Intégrations ». Elle traitait pareil
 * l'outil du client et le nôtre ; « brouillon déposé dans ta messagerie »
 * obligeait un commercial qui a DEUX boîtes à deviner où regarder.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL ENDROIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces listes étaient recopiées dans cinq gardes (web GA-44, i18n, GA-45, site
 * GA-125, prompt IA), chacune avec ses oublis. Elles vivent ici ; chaque garde
 * choisit, raison écrite, les familles qu'elle lit. La garde IA ne peut pas
 * importer du TypeScript : elle RELIT ce fichier (`test_copilote_prompt_blocks.py`),
 * d'où la forme d'une entrée par ligne, à ne pas replier.
 */

/** Ce que fait pour nous un fournisseur — la raison pour laquelle on le tait. */
export const supplierKindValues = ['enrichment', 'collection', 'model', 'infrastructure'] as const
type SupplierKind = (typeof supplierKindValues)[number]

type OurSupplier = {
  /** La forme non ambiguë sous laquelle il s'écrit — ce qu'une garde cherche en sous-chaîne. */
  name: string
  /** La marque seule — ce qu'une garde cherche entre bornes de mot (« Brave » pour « Brave Search »). */
  brand: string
  kind: SupplierKind
  /** Son identifiant dans le registre d'outils, quand il y figure ; `null` sinon. */
  provider: string | null
  /**
   * #1912 — `true` quand la marque est AUSSI un mot ordinaire (« un brave
   * commercial », « the railway station », « Solo hunter », l'archétype d'ESN
   * de `profile.json`). Sans la casse, elle n'est alors vue que sous sa forme
   * longue ou d'identifiant (« brave search », `brave_search`, « hunter.io ») ;
   * sa forme courte l'est avec sa majuscule.
   */
  ordinaryWord?: true
}

/**
 * NOS fournisseurs. Ne se nomment JAMAIS, nulle part.
 *
 * ⚠️ « Claude » n'y est pas, et ce n'est pas un oubli : c'est aussi l'assistant
 * IA que le CLIENT branche à Bellum (Réglages › Assistant IA, pastilles du site,
 * GA-124). Le prompt de Laura le tient à part, avec sa raison.
 */
export const OUR_SUPPLIERS: readonly OurSupplier[] = [
  { name: 'Apollo', brand: 'Apollo', kind: 'enrichment', provider: 'apollo' },
  { name: 'Dropcontact', brand: 'Dropcontact', kind: 'enrichment', provider: 'dropcontact' },
  { name: 'SalesQL', brand: 'SalesQL', kind: 'enrichment', provider: 'salesql' },
  // 16/09/2026, GA-340 — `brand` valait « Hunter.io », donc la marque SEULE
  // n'existait nulle part et `supplierNamesIn('Hunter')` rendait `[]`, alors
  // que c'est exactement ce que le catalogue d'outils écrit (`display_name:
  // 'Hunter'`). `ordinaryWord` parce que « hunter » est un mot anglais que
  // l'archétype « Solo hunter » emploie (`i18n/locales/en/profile.json`).
  { name: 'Hunter.io', brand: 'Hunter', kind: 'enrichment', provider: 'hunter', ordinaryWord: true },
  { name: 'Lusha', brand: 'Lusha', kind: 'enrichment', provider: 'lusha' },
  { name: 'Kaspr', brand: 'Kaspr', kind: 'enrichment', provider: 'kaspr' },
  { name: 'FullEnrich', brand: 'FullEnrich', kind: 'enrichment', provider: 'fullenrich' },
  { name: 'Brave Search', brand: 'Brave', kind: 'collection', provider: 'brave', ordinaryWord: true },
  { name: 'Serper', brand: 'Serper', kind: 'collection', provider: 'serper' },
  { name: 'Tavily', brand: 'Tavily', kind: 'collection', provider: 'tavily' },
  { name: 'Firecrawl', brand: 'Firecrawl', kind: 'collection', provider: 'firecrawl' },
  { name: 'Pappers', brand: 'Pappers', kind: 'collection', provider: 'pappers' },
  // #3885 (lot RAS) — agrégateurs d'offres d'emploi, branchés côté IA seulement.
  { name: 'Adzuna', brand: 'Adzuna', kind: 'collection', provider: null },
  { name: 'Jooble', brand: 'Jooble', kind: 'collection', provider: null },
  { name: 'TheirStack', brand: 'TheirStack', kind: 'collection', provider: null },
  { name: 'Mantiks', brand: 'Mantiks', kind: 'collection', provider: null },
  { name: 'Fantastic.jobs', brand: 'Fantastic.jobs', kind: 'collection', provider: null },
  // #3941 — fils publics de levées de fonds (presse spécialisée), branchés côté IA seulement.
  { name: 'Maddyness', brand: 'Maddyness', kind: 'collection', provider: null },
  { name: 'FrenchWeb', brand: 'FrenchWeb', kind: 'collection', provider: null },
  { name: 'Anthropic', brand: 'Anthropic', kind: 'model', provider: null },
  { name: 'OpenAI', brand: 'OpenAI', kind: 'model', provider: null },
  { name: 'Supabase', brand: 'Supabase', kind: 'infrastructure', provider: null },
  { name: 'Railway', brand: 'Railway', kind: 'infrastructure', provider: null, ordinaryWord: true },
]

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Entre bornes de lettre ou de chiffre : `apollo_enrich` est vu, « apollons » ne l'est pas. */
const bounded = (body: string, flags: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, flags)

// Sans le drapeau `g` : `RegExp.test()` resterait STATEFUL d'un appel à l'autre.
const SUPPLIER_PATTERNS: ReadonlyArray<{ name: string; patterns: readonly RegExp[] }> = OUR_SUPPLIERS.map(supplier => {
  const words = supplier.name.split(/\s+/)
  const longForm = words.map(escapeRegExp).join('[\\s_-]+')
  const brand = bounded(escapeRegExp(supplier.brand), supplier.ordinaryWord ? 'u' : 'iu')
  // Un mot ordinaire dont le nom EST la marque (« Railway ») n'a pas de forme
  // longue : la lui donner sans la casse attraperait « the railway station ».
  // ⚠️ La condition portait sur le nombre de MOTS du nom, ce qui privait
  // « Hunter.io » — un seul mot, mais distinct de « Hunter » — de sa forme
  // longue, donc de sa graphie en minuscules. Ce qui compte est que la forme
  // longue AJOUTE quelque chose à la marque, pas qu'elle ait un espace.
  const longFormAddsNothing = supplier.name === supplier.brand
  const patterns = supplier.ordinaryWord && longFormAddsNothing ? [brand] : [brand, bounded(longForm, 'iu')]
  return { name: supplier.name, patterns }
})

/**
 * #1912 — les noms de NOS fournisseurs qu'un texte cite, CASSE IGNORÉE, dans
 * l'ordre de {@link OUR_SUPPLIERS}.
 *
 * « Non appliqué par pappers » a traversé toutes les gardes : elles cherchaient
 * « Pappers » avec sa majuscule, et l'écran interpolait l'identifiant technique.
 * Ce détecteur est le seul : l'écran, l'i18n, le changelog et le digest de
 * Laura le lisent. Il voit la marque en minuscules, en capitales et sous forme
 * d'identifiant (`apollo_enrich`, `brave_search`) ; il laisse passer un registre
 * public (France Travail, INSEE) et un mot dont la marque n'est qu'un préfixe
 * (« apollons », « bravoure »).
 */
export function supplierNamesIn(text: string): string[] {
  return SUPPLIER_PATTERNS.filter(({ patterns }) => patterns.some(pattern => pattern.test(text))).map(
    ({ name }) => name,
  )
}

/**
 * #4180 R25 — le même détecteur, mais qui RÉÉCRIT : chaque nom de NOS fournisseurs
 * devient « une source de données ». Pour un texte qu'on ne maîtrise pas (sortie du
 * modèle stockée, parfois depuis des mois) : l'écran ne montre jamais « Apollo »,
 * même si le dossier a été écrit avant la règle. Un texte sans fournisseur sort identique.
 */
const SUPPLIER_REDACTION = 'une source de données'
function redactSupplierNames(text: string): string {
  if (supplierNamesIn(text).length === 0) return text
  return SUPPLIER_PATTERNS.reduce(
    (out, { patterns }) =>
      patterns.reduce(
        (acc, pattern) => acc.replace(new RegExp(pattern.source, `${pattern.flags}g`), SUPPLIER_REDACTION),
        out,
      ),
    text,
  )
}

/** {@link redactSupplierNames} sur toute chaîne d'une valeur JSON ; les clés techniques (`source`, `url`…) restent intactes. */
export function redactSupplierNamesDeep<T>(value: T, technicalKeys: ReadonlySet<string> = TECHNICAL_KEYS): T {
  if (typeof value === 'string') return redactSupplierNames(value) as T
  if (Array.isArray(value)) return value.map(item => redactSupplierNamesDeep(item, technicalKeys)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        technicalKeys.has(key) ? item : redactSupplierNamesDeep(item, technicalKeys),
      ]),
    ) as T
  }
  return value
}

const TECHNICAL_KEYS: ReadonlySet<string> = new Set([
  'source', 'sources', 'provider', 'providers', 'provenance', 'trace', 'traces', 'citations', 'tags',
  'url', 'urls', 'link', 'links', 'sourceUrl', 'source_url', 'id', 'ids',
]) // prettier-ignore

type ClientTool = {
  /** Son identifiant dans le registre d'outils (`ConnectedTool.provider`). */
  provider: string
  /** Les formes sous lesquelles il s'écrit. La PREMIÈRE est celle qu'on affiche. */
  names: readonly string[]
}

/**
 * Les outils que l'ESPACE peut brancher lui-même — et donc les seuls nommables,
 * à condition d'être connectés. Un identifiant absent d'ici n'est jamais nommé.
 */
export const CLIENT_TOOLS: readonly ClientTool[] = [
  { provider: 'hubspot', names: ['HubSpot'] },
  { provider: 'salesforce', names: ['Salesforce'] },
  { provider: 'pipedrive', names: ['Pipedrive'] },
  { provider: 'attio', names: ['Attio'] },
  { provider: 'odoo', names: ['Odoo'] },
  { provider: 'zoho', names: ['Zoho CRM', 'Zoho'] },
  { provider: 'gmail', names: ['Gmail', 'Google Workspace'] },
  { provider: 'microsoft', names: ['Outlook', 'Microsoft 365'] },
  { provider: 'google-calendar', names: ['Google Calendar', 'Google Agenda'] },
  { provider: 'google-drive', names: ['Google Drive', 'Google Sheets'] },
  { provider: 'notion', names: ['Notion'] },
  { provider: 'slack', names: ['Slack'] },
  { provider: 'discord', names: ['Discord'] },
  { provider: 'teams', names: ['Microsoft Teams'] },
  { provider: 'googlechat', names: ['Google Chat'] },
  { provider: 'mattermost', names: ['Mattermost'] },
  { provider: 'boondmanager', names: ['BoondManager'] },
  { provider: 'aircall', names: ['Aircall'] },
  { provider: 'ringover', names: ['Ringover'] },
  // #4427 — l'outil de séquences que l'espace branche par sa clé d'API.
  { provider: 'lemlist', names: ['Lemlist'] },
  { provider: 'yousign', names: ['Yousign'] },
  { provider: 'docusign', names: ['DocuSign'] },
  { provider: 'qonto', names: ['Qonto'] },
  { provider: 'tiime', names: ['Tiime'] },
  { provider: 'linkedin', names: ['LinkedIn'] },
]

const CLIENT_TOOL_BY_PROVIDER = new Map(CLIENT_TOOLS.map((tool, index) => [tool.provider, { tool, index }]))

/**
 * Un outil branché par l'espace, prêt à être affiché sous son nom.
 *
 * #2406.33 — `needsReconnect` porte ce que {@link connectedClientTools} sait
 * déjà (`status === 'action_required'`) : un consentement révoqué reste
 * NOMMÉ (« connecté ou à reconnecter », docblock ci-dessous) mais ne se
 * présente plus comme un outil sain à l'écran qui le rend — jamais un second
 * calcul de ce statut côté écran (GA-26).
 */
export type ConnectedClientTool = {
  provider: string
  family: ToolFamily
  /** #3973 — les familles servies en plus de `family` (posé seulement si non vide) ; lire via `toolFamiliesOf`. */
  additional_families?: ToolFamily[]
  name: string
  needsReconnect?: boolean
  /**
   * #3708.2 — accès LIMITÉ : la connexion existe mais la lecture seule, une
   * écriture partielle ou une portée jamais accordée en borne l'usage. Dérivé
   * de `capability_state` (la seule source) ; absent pour tout le reste, y
   * compris `untested`, qui n'est pas une limite mais une preuve manquante.
   */
  limited?: boolean
  /**
   * #3774.3.1 — les capacités RÉELLES, une par une, plutôt que le seul état
   * global (`limited` ci-dessus). Retient celles dont la PORTÉE est accordée
   * (tout état de `ConnectedTool.capabilities` sauf `not_connected` /
   * `authorization_expired` / `scope_missing`, #3774 — voir
   * {@link CAPABILITY_NOT_GRANTED_STATES}) — jamais devinées depuis
   * `allowed_actions`, qui dit ce qu'un outil PEUT supporter au catalogue, pas
   * ce que CET espace a prouvé.
   *
   * `.optional()` comme `limited`/`needsReconnect` ci-dessus : {@link
   * connectedClientTools} la pose TOUJOURS (`[]` si rien d'accordé — une
   * liste, donc une absence n'y fait AUCUNE ligne, jamais un champ distinct à
   * lire), mais un littéral écrit à la main ailleurs (fixtures de test
   * antérieures à ce point) n'a pas à la fournir pour rester valide.
   */
  capabilities?: CapabilityKey[]
}

const LIMITED_CAPABILITY_STATES: ReadonlySet<string> = new Set(['read_only', 'limited_write', 'scope_missing'])

/**
 * #1912.11 — les outils que l'espace a BRANCHÉS, sous leur nom. La seule
 * dérivation : l'écran et le digest du copilote la lisent tous deux.
 *
 * Retenu : un identifiant de {@link CLIENT_TOOLS}, connecté ou à reconnecter
 * (la connexion existe, l'outil est bien le sien). Écarté : tout le reste — un
 * fournisseur de Bellum que le registre dit « connecté » parce qu'une clé
 * serveur est posée, un outil disponible mais non branché, un identifiant
 * inconnu. Le défaut est de TAIRE.
 *
 * Tolérant par construction : la barre de saisie qui la lit est montée sur
 * presque tout le produit, et un registre qui n'est pas un tableau (corps
 * d'erreur, front neuf sur API ancienne) ne doit rien faire tomber.
 */
export function connectedClientTools(tools: readonly ConnectedTool[] | null | undefined): ConnectedClientTool[] {
  if (!Array.isArray(tools)) return []
  const byProvider = new Map<string, ConnectedClientTool & { order: number }>()
  for (const tool of tools as ReadonlyArray<ConnectedTool | null | undefined>) {
    if (!tool || (tool.status !== 'connected' && tool.status !== 'action_required')) continue
    const known = CLIENT_TOOL_BY_PROVIDER.get(tool.provider)
    const name = known?.tool.names[0]
    if (!known || !name || byProvider.has(tool.provider)) continue
    const familyRank = toolFamilyValues.indexOf(tool.family)
    byProvider.set(tool.provider, {
      provider: tool.provider,
      family: tool.family,
      ...(tool.additional_families?.length ? { additional_families: [...tool.additional_families] } : {}),
      name,
      needsReconnect: tool.status === 'action_required',
      limited: tool.status === 'connected' && LIMITED_CAPABILITY_STATES.has(tool.capability_state),
      // #3774 — un même verbe peut être déclaré deux fois (deux portées
      // différentes, ex. HubSpot « lire tes contacts » / « lire tes
      // affaires ») : un `Set` garde chaque verbe une seule fois, dans
      // l'ordre de sa première apparition.
      capabilities: [
        ...new Set(
          (tool.capabilities ?? [])
            .filter(capability => !CAPABILITY_NOT_GRANTED_STATES.has(capability.state))
            .map(capability => capability.key),
        ),
      ],
      order: (familyRank === -1 ? toolFamilyValues.length : familyRank) * 1000 + known.index,
    })
  }
  return [...byProvider.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ provider, family, additional_families, name, needsReconnect, limited, capabilities }) => ({
      provider,
      family,
      ...(additional_families ? { additional_families } : {}),
      name,
      capabilities,
      ...(needsReconnect ? { needsReconnect } : {}),
      ...(limited ? { limited } : {}),
    }))
}

/**
 * #3708.2 — les familles d'outils que l'espace PEUT brancher et n'a pas branchées.
 *
 * Par FAMILLE, jamais par outil : « non connecté » nomme un besoin métier (ton CRM,
 * ton agenda), pas un éditeur qu'on pousserait — la doctrine nomme ce que l'espace
 * a branché. Une famille déjà portée par un outil connecté ou à reconnecter n'y est
 * pas ; un outil seulement annoncé (`coming_soon`) ou un fournisseur de Bellum non
 * plus : sans connexion possible, une absence ne fait aucune ligne. Ordre de
 * `toolFamilyValues`, pour que le menu ne se réordonne pas d'un rendu à l'autre.
 */
export function unconnectedClientToolFamilies(tools: readonly ConnectedTool[] | null | undefined): ToolFamily[] {
  if (!Array.isArray(tools)) return []
  const live = new Set<ToolFamily>()
  const connectable = new Set<ToolFamily>()
  for (const tool of tools as ReadonlyArray<ConnectedTool | null | undefined>) {
    if (!tool || !CLIENT_TOOL_BY_PROVIDER.has(tool.provider)) continue
    const families = toolFamiliesOf(tool)
    if (tool.status === 'connected' || tool.status === 'action_required') families.forEach(family => live.add(family))
    else if (tool.status === 'available') families.forEach(family => connectable.add(family))
  }
  return toolFamilyValues.filter(family => connectable.has(family) && !live.has(family))
}

/**
 * #2561 — le nom d'affichage d'un outil CLIENT, à partir de son seul
 * IDENTIFIANT technique (`ConnectedTool.provider`, ou le `provider` porté par
 * un fait déjà mis en cache comme `crm_deal_facts`).
 *
 * Utile quand l'appelant sait déjà, par construction, que l'outil a été
 * connecté — un `crm_deal_facts` n'existe que parce qu'une synchronisation a
 * eu lieu — et n'a pas sous la main le registre `ConnectedTool[]` complet
 * qu'exige {@link connectedClientTools}. `null` si l'identifiant est absent ou
 * inconnu de {@link CLIENT_TOOLS} : jamais un nom deviné.
 */
export function clientToolName(provider: string | null | undefined): string | null {
  return (provider && CLIENT_TOOL_BY_PROVIDER.get(provider)?.tool.names[0]) || null
}

/**
 * Le fournisseur de messagerie (`MailboxProvider`) → l'outil du registre. Les
 * deux espaces d'identifiants existent déjà ; on ne les renomme pas.
 */
const MAILBOX_REGISTRY_PROVIDER: Readonly<Record<string, string>> = { google: 'gmail', microsoft: 'microsoft' }

/**
 * Le nom de la messagerie où un brouillon vient d'atterrir, lu sur le RÉSULTAT
 * réel (`MailDraftResult.provider`). `null` quand le fournisseur est absent ou
 * inconnu — l'écran dit alors « ta messagerie », jamais un nom deviné.
 */
export function mailboxToolName(provider: string | null | undefined): string | null {
  const registryProvider = provider ? MAILBOX_REGISTRY_PROVIDER[provider] : undefined
  return (registryProvider && CLIENT_TOOL_BY_PROVIDER.get(registryProvider)?.tool.names[0]) || null
}

/**
 * La messagerie branchée, AVANT l'exécution : son nom quand l'espace n'en a
 * qu'UNE, `null` sinon. Deux boîtes connectées, et l'écran ne sait pas dans
 * laquelle le brouillon partira — en nommer une serait deviner.
 */
export function connectedMailboxName(tools: readonly ConnectedClientTool[]): string | null {
  const mailboxes = tools.filter(tool => tool.family === 'email')
  return mailboxes.length === 1 ? (mailboxes[0]?.name ?? null) : null
}
