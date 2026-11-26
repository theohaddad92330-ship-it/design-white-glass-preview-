import { z } from 'zod'
import { connectorCapabilityLevelSchema } from './connector-capability-level.js'

/**
 * Tool Registry wire schemas — the *unified* read model over every third-party
 * tool BellumAI can be wired to. Today the connection state lives in three
 * separate silos (self-serve chat/webhooks in the `integrations` table, OAuth
 * CRM links in `crm_connections`, MCP assistant grants in `oauth_consents`) plus
 * a set of tools that are *modeled but not yet connectable*. This schema is the
 * single shape the API aggregates them into so the copilot and the analysis
 * engine never have to *guess* whether a tool exists — they read the registry.
 *
 * See the "vision prime" roadmap (Bellum = the unique interface of the sales
 * rep) and `agent_docs/vision-copilote-actions.md`.
 *
 * IMPORTANT: this is a **read** model. It aggregates the real state of the three
 * storage systems — it never claims a tool is connected when no row backs it.
 */

/** Functional family a tool belongs to (roadmap section 8). */
export const toolFamilyValues = [
  'crm',
  'email',
  'calendar',
  'linkedin',
  'prospection',
  'documents',
  'communication',
  'jobs',
  'data',
  'finance',
  'mcp',
  /** ATS / ERP de l'ESN (BoondManager). Identifiants saisis par espace. */
  'ats',
  /** Outil d'appel (Aircall, Ringover). Identifiants saisis par espace. */
  'telephony',
  /** Signature électronique et facturation (Yousign, DocuSign, Qonto, Tiime). */
  'admin_docs',
  /**
   * #2261.30 — appels d'offres / marchés publics (BOAMP), JAMAIS confondue avec
   * `jobs` (offres d'EMPLOI, wttj/france-travail) : un appel d'offres et une
   * offre d'emploi sont deux objets différents, avec deux sources différentes.
   * Ajoutée EN FIN — GA-08 interdit d'insérer au milieu.
   */
  'tenders',
] as const
export const toolFamilySchema = z.enum(toolFamilyValues)
export type ToolFamily = z.infer<typeof toolFamilySchema>

/**
 * Connection status, mapped from the real backing store:
 * - `connected`       — a live connection/grant backs this tool.
 * - `action_required` — connected but broken (e.g. an OAuth token has expired).
 * - `available`       — connectable now (the mechanism exists server-side) but
 *                       the user hasn't connected it yet.
 * - `coming_soon`     — modeled in the registry but not connectable yet (no
 *                       backend, or the server feature is not configured).
 */
export const toolStatusValues = ['connected', 'action_required', 'available', 'coming_soon'] as const
export const toolStatusSchema = z.enum(toolStatusValues)
export type ToolStatus = z.infer<typeof toolStatusSchema>

/** Whether a tool's connection is owned by the whole workspace (team resource,
 *  e.g. a CRM link) or by the individual user (e.g. a personal chat webhook). */
export const toolOwnerScopeValues = ['workspace', 'user'] as const
export const toolOwnerScopeSchema = z.enum(toolOwnerScopeValues)
export type ToolOwnerScope = z.infer<typeof toolOwnerScopeSchema>

/**
 * Human-readable registry text delivered in BOTH product languages (standing
 * i18n rule: every UI ships FR+EN). The API is locale-agnostic — it sends both
 * and the client picks; the chat context (French prompts) reads `.fr`.
 */
export const localizedTextSchema = z.object({
  fr: z.string().min(1),
  en: z.string().min(1),
})
export type LocalizedText = z.infer<typeof localizedTextSchema>

/**
 * What a tool READS from the third-party system vs what Bellum WRITES into it
 * (roadmap §8-9 "Connected Account Memory": data_types must say both). Tokens
 * are stable machine words (`contacts`, `deals`, `notifications`…) the client
 * translates for display.
 */
export const toolDataTypesSchema = z.object({
  reads: z.array(z.string()),
  writes: z.array(z.string()),
})
export type ToolDataTypes = z.infer<typeof toolDataTypesSchema>

/**
 * L'état d'une capacité, plus fin que « connecté » (addendum final p19).
 *
 * « Connecté » est insuffisant : un outil peut être relié et incapable d'écrire
 * (scope non accordé), relié et cassé (jeton expiré), relié et en retard (sync
 * ancienne). Le copilote lisait la même valeur dans les trois cas et promettait
 * donc des actions impossibles — puis échouait au moment le plus coûteux, après
 * le clic.
 *
 * Dix états, chacun avec une réponse produit différente — huit à l'origine,
 * plus `scope_missing` et `untested` ajoutés le 21/08/2026. Ils sont DÉRIVÉS
 * (jamais stockés) : une colonne d'état diverge du réel dès la première panne.
 */
export const capabilityStateValues = [
  /** Rien n'est relié. Réponse : proposer la connexion, dire le bénéfice. */
  'not_connected',
  /** Relié, mais l'écriture n'est pas accordée. Réponse : analyse possible, action désactivée. */
  'read_only',
  /** Relié, écriture partielle (contacts oui, affaires non). Réponse : ne montrer que le possible. */
  'limited_write',
  /** Le jeton a expiré. Réponse : reconnexion, et les workflows en pause. */
  'authorization_expired',
  /**
   * Vérifié, et ça n'a pas marché. Réponse : dire ce qui a échoué, et quand.
   *
   * Producteur (branché le 29/08/2026) : la dernière SONDE a échoué —
   * `connector_capability_probes.last_error_at` est posé et `last_proof_at`
   * effacé, ce que `ConnectorProbeService.record()` fait en une seule écriture.
   * Avant, ces capacités retombaient sur `untested` : « Jamais vérifié » au-dessus
   * d'une chose qu'on venait justement de vérifier et qui était cassée. C'est le
   * défaut de fond du dépôt appliqué à son propre tableau de bord — « cassé » et
   * « non mesuré » se ressemblent, et le premier se lit comme le second.
   */
  'degraded',
  /** La dernière synchronisation est trop ancienne. Réponse : badge de fraîcheur. */
  'sync_late',
  /* `action_pending` a occupé cette place jusqu'au 29/08/2026 (D102).
   *
   * Retiré parce qu'il n'avait AUCUN producteur : déclaré, dérivable, traduit en
   * FR et en EN, et jamais atteint. Le seul producteur honnête aurait été la
   * porte d'approbation d'écriture CRM/ERP, qui est une décision PARQUÉE — la
   * route `GET /crm/write-requests` n'a toujours pas d'écran (D100). Un état
   * qu'aucun chemin n'atteint promet une finesse qui n'existe pas.
   *
   * ⚠️ Si cette porte gagne son écran, la valeur se rajoute EN FIN
   * d'énumération, jamais ici : GA-08 interdit d'insérer au milieu. Le retrait
   * était sûr parce que ces états sont DÉRIVÉS et jamais stockés — aucune
   * contrainte SQL ne les énumère. */
  /** Relié et opérationnel. */
  'operational',
  /**
   * Relié, mais la PORTÉE de cette capacité n'a jamais été accordée (PDF 7 §2).
   *
   * Ajouté en fin d'énumération le 21/08/2026, et c'est l'état autour duquel
   * tourne tout le PDF 7 : il manquait, alors qu'il désigne exactement les trois
   * pannes du 16/08. Il ne se confond ni avec `read_only` (là, l'écriture est
   * refusée mais la lecture marche) ni avec `authorization_expired` (là, le
   * jeton est mort et se renouvelle). Un jeton OAuth ne gagne JAMAIS une portée
   * après coup : la réponse est de reconnecter, et rien d'autre ne la produira.
   */
  'scope_missing',
  /**
   * Relié, la portée est là, et personne ne l'a jamais vérifié.
   *
   * Le PDF pose une règle qui vaut cet état : « `sain` n'est jamais déclaré. Il
   * est dérivé des portées accordées ET d'un test réel. » Sans preuve, dire
   * « opérationnel » est exactement ce que faisait le dépôt le 16/08 — et
   * l'agenda était vide depuis des jours. Ce que cet état dit est vrai et
   * actionnable : « je peux, je crois, mais je ne l'ai pas vérifié ». Le bouton
   * « Tester » existe pour lui.
   */
  'untested',
] as const
export const capabilityStateSchema = z.enum(capabilityStateValues)
export type CapabilityState = z.infer<typeof capabilityStateSchema>

/**
 * Les dix verbes d'une capacité (PDF 7 §1).
 *
 * Le document les énumère et le dépôt n'en connaissait que six, éparpillés dans
 * les `allowed_actions` du catalogue. Les dix sont déclarés ici même quand aucun
 * connecteur ne les porte : c'est le vocabulaire commun qui permet de dire « je
 * ne peux PAS supprimer un message » — la moitié de la carte de connecteur que
 * le PDF décrit est faite de ce qu'on ne fait pas.
 */
export const capabilityKeyValues = [
  'read',
  'search',
  'summarize',
  'prepare',
  'create',
  'update',
  'send',
  'delete',
  'schedule',
  'webhook',
] as const
export const capabilityKeySchema = z.enum(capabilityKeyValues)
export type CapabilityKey = z.infer<typeof capabilityKeySchema>

/**
 * Une capacité, avec son état, sa portée, sa dernière preuve et sa dernière erreur.
 *
 * C'est la forme que demande BEL-INT-601 PR2, et la raison d'être du chantier :
 * un état GLOBAL par connecteur ne dit rien de ce que le produit peut réellement
 * faire. « Google : connecté » était vrai le 16/08 pendant que l'agenda ne
 * répondait pas, que la recherche documentaire rendait une liste vide, et que
 * personne ne pouvait le savoir.
 *
 * `last_proof_sample` porte le NOM d'un objet réel (« Perso, Équipe, Client
 * EDF ») et jamais son contenu — c'est la ligne que le PDF trace explicitement :
 * une preuve est un titre, pas un message.
 */
export const capabilityDescriptorSchema = z.object({
  key: capabilityKeySchema,
  /** DÉRIVÉ, jamais stocké : une colonne d'état diverge du réel dès la première panne. */
  state: capabilityStateSchema,
  /** Les portées que cette capacité exige, NOMMÉES telles que le fournisseur les écrit. */
  scope_required: z.array(z.string()),
  /** Quand la capacité a été vérifiée pour de vrai, ou `null` si jamais. */
  last_proof_at: z.string().datetime().nullable(),
  /** Un échantillon d'objet RÉEL — son nom. Jamais son contenu. */
  last_proof_sample: z.string().nullable(),
  /** Le code de la dernière erreur, ou `null`. Vocabulaire de `connector-error.ts`. */
  last_error_code: z.string().nullable(),
  last_error_at: z.string().datetime().nullable(),
  /**
   * #2383.1 — le niveau de capacité (L0-L6, `connector-capability-level.ts`) de
   * CETTE action précise. `.optional()`, comme `coverage_period`/`latency`/
   * `beta` juste au-dessus dans `connectedToolSchema` : un champ AJOUTÉ à une
   * réponse d'API se lit avec un repli côté web (`!== undefined`), sinon la
   * fenêtre de déploiement Vercel/Railway (une minute contre dix) sert une
   * réponse ancienne à du code neuf et écrase l'écran plutôt que de le
   * dégrader — la leçon du 21/08 sur `capabilities ?? []`.
   */
  level: connectorCapabilityLevelSchema.optional(),
})
export type CapabilityDescriptor = z.infer<typeof capabilityDescriptorSchema>

/**
 * One tool in the unified registry. `provider` is the stable machine id
 * (`hubspot`, `slack`, `gmail`, `mcp`…). Descriptive fields (`data_types`,
 * `allowed_actions`, `rate_limits`, `cost_model`, `memory_policy`) are
 * declarative capability metadata — what the tool *can* do and its operating
 * envelope — so the copilot can reason about a tool even before it is connected.
 * `scopes`/`last_sync` are only ever non-empty when a real connection backs the
 * row; `last_sync` is `null` whenever no reliable timestamp exists (never
 * invented).
 */
/**
 * Les capacités réellement disponibles, déduites des outils branchés.
 *
 * ⚠️ Le contrôleur de l'Action OS passait `new Set<string>()` EN DUR. Le
 * planificateur bloque tout pas dont la capacité manque — donc tous les pas
 * étaient bloqués, et le run se déclarait terminé sans qu'une seule requête
 * parte. La fausse réussite était produite par construction, avant même qu'un
 * appelant existe.
 *
 * Pure et testée à part : c'est la règle qui décide ce qu'un workflow a le droit
 * de tenter, et la mettre dans un service la rendrait invérifiable.
 *
 * `notifications` n'est pas une famille d'outils — c'est la notification
 * in-app, que Bellum sert lui-même. Elle est toujours disponible : la déclarer
 * absente bloquerait le seul pas qui n'a besoin de personne.
 */
export function availableCapabilitiesFrom(tools: readonly ConnectedTool[]): Set<string> {
  const available = new Set<string>(['notifications'])
  for (const tool of tools) {
    // `action_required` = branché mais cassé (jeton périmé). Le compter
    // disponible ferait partir un pas vers un connecteur qui refusera —
    // exactement la fausse promesse que le contrat d'erreur combat.
    if (tool.status !== 'connected') continue
    for (const family of toolFamiliesOf(tool)) available.add(family)
  }
  return available
}

/**
 * #3973 (décision Louis 11/10/2026) — TOUTES les familles qu'un outil sert : sa
 * famille principale (`family`, celle qui le range à l'écran), puis celles qu'il
 * sert AUSSI (`additional_families`). Microsoft 365 est rangé en messagerie mais
 * porte aussi l'agenda : un espace qui n'a que lui a l'agenda branché, et
 * décocher l'agenda Google laisse l'agenda Microsoft lisible.
 *
 * La SEULE lecture des familles d'un outil pour toute question « cette famille
 * est-elle branchée / encore lue ? » (GA-26) — jamais un cas « microsoft »
 * codé en dur chez un appelant.
 */
export function toolFamiliesOf(tool: {
  family: ToolFamily
  additional_families?: readonly ToolFamily[] | null
}): ToolFamily[] {
  return [...new Set([tool.family, ...(tool.additional_families ?? [])])]
}

/**
 * #2261.13 — la latence DÉCLARÉE, jamais estimée.
 *
 * Règle qui commande ce lot (#2261) : « un contrat d'API non vérifiable ne se
 * devine pas ». La latence d'un outil TIERS n'est ni une moyenne qu'on invente,
 * ni une projection — c'est soit ce que le fournisseur ANNONCE dans sa propre
 * documentation (`source: 'declared'`), soit ce que Bellum a MESURÉ lui-même
 * (`source: 'measured'`). Dans les deux cas, `as_of` date la donnée : une
 * annonce a une date de publication, une mesure une date de test. Sans elle,
 * une latence lue aujourd'hui pourrait être un chiffre de l'an dernier qu'on
 * fait passer pour actuel.
 *
 * `value` est un ORDRE DE GRANDEUR en texte (FR+EN), jamais une probabilité —
 * aucun pourcentage de chance n'est jamais affiché (doctrine, six fois refusée).
 */
export const toolLatencySourceValues = ['declared', 'measured'] as const
export const toolLatencySourceSchema = z.enum(toolLatencySourceValues)
export type ToolLatencySource = z.infer<typeof toolLatencySourceSchema>

export const toolLatencyKnownSchema = z.object({
  source: toolLatencySourceSchema,
  /** L'ordre de grandeur déclaré/mesuré — jamais une moyenne inventée. */
  value: localizedTextSchema,
  /** Quand l'annonce a été publiée, OU quand la mesure a été faite. */
  as_of: z.string().datetime(),
  /**
   * #2261.13 (décision Louis 19/09) — la fenêtre et l'échantillon d'une
   * mesure RÉELLE : `source: 'measured'` calcule sur les synchronisations
   * RÉELLES de l'espace, jamais une moyenne glissante muette. Absents pour
   * `source: 'declared'` — une annonce fournisseur n'a ni fenêtre ni
   * échantillon, ce serait une mesure qu'on ne fait pas.
   */
  window_days: z.number().int().positive().optional(),
  sample_count: z.number().int().positive().optional(),
})
export type ToolLatencyKnown = z.infer<typeof toolLatencyKnownSchema>

/**
 * #2261.13 (décision Louis 19/09) — « non mesuré » n'est jamais silencieux
 * (GA-18/GA-19) : quand la fenêtre de 7 jours n'a pas assez de
 * synchronisations réelles, ou que Bellum ne capture pas encore l'horodatage
 * source de cet outil, la raison est un texte FR+EN au même titre qu'un
 * `coverage_period` non précisé — jamais `0`, jamais une valeur de doc.
 */
export const toolLatencyUnmeasuredSchema = z.object({
  source: z.literal('not_measured'),
  reason: localizedTextSchema,
})
export type ToolLatencyUnmeasured = z.infer<typeof toolLatencyUnmeasuredSchema>

export const toolLatencySchema = z.union([toolLatencyKnownSchema, toolLatencyUnmeasuredSchema])
export type ToolLatency = z.infer<typeof toolLatencySchema>

/**
 * #2261.16 — le statut BÊTA déclaré par le FOURNISSEUR, jamais déduit.
 *
 * Une capacité dont le statut est inconnu est `null` (inconnue) — jamais
 * traitée comme « stable » : la doctrine de ce lot distingue explicitement les
 * deux (« non mesuré n'est jamais 0 »). `feature` NOMME ce qui est en bêta,
 * telle que l'annonce le dit ; `null` quand la déclaration porte sur le
 * connecteur entier plutôt que sur une capacité précise.
 */
export const toolBetaSchema = z.object({
  beta: z.boolean(),
  feature: localizedTextSchema.nullable(),
})
export type ToolBetaStatus = z.infer<typeof toolBetaSchema>

export const connectedToolSchema = z.object({
  provider: z.string().min(1),
  family: toolFamilySchema,
  /**
   * #3973 — les familles que l'outil sert EN PLUS de `family` (Microsoft 365 :
   * l'agenda, en plus de la messagerie). `family` reste l'unique rangement à
   * l'écran ; ces familles comptent pour « branché », « encore lu » et
   * l'exclusion « Outils et sources ». Lire via {@link toolFamiliesOf}.
   * `.optional()` : absent = mono-famille, et une réponse d'avant reste valide
   * pendant la fenêtre de déploiement.
   */
  additional_families: z.array(toolFamilySchema).optional(),
  display_name: z.string().min(1),
  status: toolStatusSchema,
  /** Granted OAuth/permission scopes; `[]` when unknown or not connected. */
  scopes: z.array(z.string()),
  owner: toolOwnerScopeSchema,
  /** ISO-8601 timestamp of the last real activity on the connection (a real
   *  delivery/export stamps `last_used_at`; config changes fall back to
   *  `updated_at`), or `null` when no reliable timestamp exists (modeled-only
   *  tools, unconnected tools). */
  last_sync: z.string().datetime().nullable(),
  /** What the tool reads vs what Bellum writes through it (machine tokens). */
  data_types: toolDataTypesSchema,
  /** Actions Bellum may take through the tool (e.g. `export_contact`, `send_email`). */
  allowed_actions: z.array(z.string()),
  /** Human-readable rate-limit envelope (FR+EN), when known — never invented. */
  rate_limits: localizedTextSchema.optional(),
  /** Human-readable cost model (FR+EN), e.g. « 1 crédit / enrichissement réussi ». */
  cost_model: localizedTextSchema.optional(),
  /** Data-retention / memory policy (FR+EN): what Bellum keeps from this tool. */
  memory_policy: localizedTextSchema.optional(),
  /**
   * #2261.8 — la PÉRIODE COUVERTE que l'outil DÉCLARE, jamais devinée.
   *
   * `null` = aucune déclaration connue (« inconnu »), et c'est une réponse
   * honnête à part entière — jamais « probablement 12 mois ». REQUIS (pas
   * `.optional()`, contrairement à `rate_limits`) précisément pour que
   * l'absence se DISE : un champ manquant serait silencieusement sauté par un
   * écran qui ne le lirait pas, alors que `null` force la question posée.
   */
  coverage_period: localizedTextSchema.nullable(),
  /**
   * #2207.23 — la durée ESTIMÉE d'une PREMIÈRE synchronisation avec cet outil,
   * DÉCLARÉE par Bellum (jamais mesurée sur cet espace précis, jamais une
   * probabilité — doctrine, six fois refusée). `.optional()` comme
   * `rate_limits`/`cost_model` juste au-dessus : ajouté à une réponse
   * existante, il se lit avec un repli côté web plutôt qu'avec un champ requis
   * qui casserait toute réponse plus ancienne pendant la fenêtre de
   * déploiement Vercel/Railway. `null` = pas encore déclarée pour ce
   * connecteur — l'écran de prévisualisation le dit explicitement, jamais en
   * silence.
   */
  sync_duration_estimate: localizedTextSchema.nullable().optional(),
  /**
   * #2261.13 — la latence DÉCLARÉE ou MESURÉE, jamais estimée.
   * `null` = ni l'un ni l'autre n'est connu à ce jour.
   */
  latency: toolLatencySchema.nullable(),
  /**
   * #2261.16 — le statut BÊTA déclaré par le fournisseur.
   * `null` = statut inconnu — jamais traité comme « stable ».
   */
  beta: toolBetaSchema.nullable(),
  /**
   * L'état de la CAPACITÉ, dérivé (PDF 6 §4 famille G).
   *
   * `status` dit si la connexion existe ; celui-ci dit ce qu'on peut en FAIRE.
   * Les deux sont nécessaires et différents : une connexion « connected » dont
   * la portée d'écriture a été retirée est en `read_only`, et proposer une
   * action dessus produit un échec après le clic — exactement ce que le §4
   * cherche à éviter.
   *
   * Il a été écrit, testé, et pendant deux jours son seul appelant a été son
   * propre test. C'est ici qu'il est branché.
   */
  capability_state: capabilityStateSchema,
  /**
   * L'état capacité par capacité (PDF 7 §1 et §2).
   *
   * `capability_state` ci-dessus reste l'état de l'OUTIL — utile pour trier une
   * grille. Celui-ci dit ce qu'on peut FAIRE, et c'est le seul des deux qui
   * puisse répondre à « pourquoi ma recherche documentaire ne rend rien ».
   *
   * Vide pour les outils qui n'exposent pas de portées (un webhook n'en a pas :
   * il a une URL, et soit elle répond, soit non).
   */
  capabilities: z.array(capabilityDescriptorSchema),
})
export type ConnectedTool = z.infer<typeof connectedToolSchema>

/** Response of `GET /tool-registry` — the caller's unified tool list. */
export const toolRegistrySchema = z.array(connectedToolSchema)
export type ToolRegistry = z.infer<typeof toolRegistrySchema>

/** Au-delà de ce délai sans activité, une connexion est dite « en retard ». */
export const CAPABILITY_SYNC_LATE_DAYS = 30

/**
 * Dérive l'état d'une capacité depuis ce qu'on sait RÉELLEMENT d'elle.
 *
 * L'ordre des tests est l'ordre d'urgence : ce qui empêche toute action passe
 * avant ce qui la limite, qui passe avant ce qui la retarde. Un jeton expiré ET
 * une sync ancienne, c'est d'abord un jeton expiré — afficher « synchronisation
 * en retard » enverrait l'utilisateur regarder au mauvais endroit.
 */
export function deriveCapabilityState(input: {
  status: ToolStatus
  /** Écritures réellement autorisées par les scopes accordés. */
  writesGranted: boolean
  /** Écritures PARTIELLES : une partie des objets seulement. */
  writesPartial?: boolean
  /** Au moins une capacité de cet outil a-t-elle échoué à sa dernière sonde ? */
  degraded?: boolean
  lastSync?: string | null
  now?: Date
}): CapabilityState {
  if (input.status === 'available' || input.status === 'coming_soon') return 'not_connected'
  if (input.status === 'action_required') return 'authorization_expired'
  if (input.degraded) return 'degraded'
  if (!input.writesGranted) return 'read_only'
  if (input.writesPartial) return 'limited_write'
  if (input.lastSync) {
    const days = ((input.now ?? new Date()).getTime() - new Date(input.lastSync).getTime()) / 86_400_000
    if (Number.isFinite(days) && days > CAPABILITY_SYNC_LATE_DAYS) return 'sync_late'
  }
  return 'operational'
}

/**
 * L'état d'UNE capacité, dérivé de ce qu'on sait réellement d'elle.
 *
 * L'ordre est celui de l'irréversibilité, pas celui de la gravité ressentie :
 * ce qui ne se répare qu'en reconnectant passe avant ce qui se rattrape tout
 * seul. Annoncer « synchronisation en retard » à quelqu'un dont la portée n'a
 * jamais été accordée l'envoie regarder au mauvais endroit — et il n'y trouvera
 * rien, parce qu'il n'y a rien à y voir.
 *
 * ⚠️ `operational` EXIGE une preuve. C'est la règle du PDF 7 §2 (« `sain` n'est
 * jamais déclaré ») et c'est ce qui distingue cette fonction de celle qu'elle
 * complète : le 16/08, le registre disait « opérationnel » sur un agenda dont
 * l'API était éteinte depuis des semaines. Sans preuve, la réponse honnête est
 * `untested`, et le bouton « Tester » est là pour la changer.
 */
export function deriveCapabilityEntryState(input: {
  status: ToolStatus
  /** Les portées RÉELLEMENT accordées par le fournisseur. */
  granted: readonly string[]
  /** Les portées que cette capacité exige. Vide = rien à exiger (un webhook). */
  required: readonly string[]
  /**
   * La DERNIÈRE sonde a-t-elle échoué ?
   *
   * Produit par `describeCapabilities` depuis `last_error_at` sans
   * `last_proof_at` — l'échec efface la preuve, donc les deux ne cohabitent
   * jamais. Sans ce drapeau, une capacité qu'on venait de vérifier et qui avait
   * échoué s'affichait « Jamais vérifié ».
   */
  degraded?: boolean
  lastProofAt?: string | null
  /**
   * Une opération non destructive peut-elle la prouver ?
   *
   * `false` pour tout ce qui écrit : un envoi ne se vérifie qu'en envoyant.
   * Exiger une preuve là afficherait « jamais vérifié » pour toujours sur une
   * capacité qui marche, et un badge permanent cesse d'être lu.
   */
  probeable?: boolean
  now?: Date
}): CapabilityState {
  if (input.status === 'available' || input.status === 'coming_soon') return 'not_connected'
  if (input.status === 'action_required') return 'authorization_expired'

  // Comparaison insensible à la casse : Microsoft rend `Mail.Read` sur l'écran
  // de consentement et `mail.read` dans la réponse du jeton. Comparer tel quel
  // éteindrait une capacité qui marche — et c'est arrivé.
  const granted = new Set(input.granted.map(scope => scope.toLowerCase()))
  const missing = input.required.filter(scope => !granted.has(scope.toLowerCase()))
  // ⚠️ La portée manquante passe DEVANT l'échec de sonde, contrairement à la
  // fonction jumelle au niveau de l'outil — et ce n'est pas une divergence, mais
  // la même règle appliquée à des entrées différentes. Une sonde échoue TOUJOURS
  // quand la portée n'est pas accordée : annoncer « dégradé » masquerait la
  // cause, qui est la seule des deux à se réparer — et le bouton « Réparer » ne
  // s'affiche que sur `scope_missing`.
  if (missing.length > 0) return 'scope_missing'

  // Vérifié, et cassé. Passe devant `operational` et devant `untested` : une
  // capacité non sondable dont la dernière sonde a quand même échoué n'est pas
  // « opérationnelle », et une capacité qui vient d'échouer n'est pas « jamais
  // vérifiée » — c'est l'inverse.
  if (input.degraded) return 'degraded'
  if (input.probeable === false) return 'operational'
  if (!input.lastProofAt) return 'untested'

  const days = ((input.now ?? new Date()).getTime() - new Date(input.lastProofAt).getTime()) / 86_400_000
  if (days > CAPABILITY_SYNC_LATE_DAYS) return 'sync_late'
  return 'operational'
}

/** Les portées manquantes pour une capacité — celles que « Réparer » doit NOMMER. */
export function missingScopesFor(granted: readonly string[], required: readonly string[]): string[] {
  const have = new Set(granted.map(scope => scope.toLowerCase()))
  return required.filter(scope => !have.has(scope.toLowerCase()))
}

/**
 * #2261.21-32 — les capacités INTERNES de Bellum, hors du manifeste ci-dessus.
 *
 * Le registre au-dessus (`toolFamilyValues`) ne couvre que les outils TIERS —
 * ce qu'un espace CONNECTE. Mais Laura reçoit aussi des questions sur les
 * fonctions NATIVES du produit (« le vivier est-il utilisable maintenant ? »,
 * « les routines tournent-elles ? »), qui n'ont ni fournisseur ni écran de
 * connexion. Elles restaient hors du manifeste, donc hors de ce que Laura peut
 * vérifier avant de répondre — le même défaut que celui que le manifeste des
 * outils tiers corrige, un cran plus bas.
 *
 * Volontairement NEUF et pas plus : les familles nommées par le chapitre
 * (#2261.21-27, #2261.32) plus `invoicing` (#2261.31). DataForge et Market
 * Memory gardent leur nom PRODUIT (jamais un nom de fournisseur — ce sont des
 * moteurs internes, pas des tiers).
 *
 * `invoicing` ⚠️ ne se confond avec AUCUNE des deux familles TIERS qui
 * partagent le mot « facturation » : `finance` (Stripe, l'abonnement BELLUM
 * lui-même) et `admin_docs` (Qonto/Tiime/Yousign/DocuSign, l'outil compta du
 * CLIENT qu'il connecte). `invoicing` est la troisième chose — le FACTORING de
 * l'ESN sur ses PROPRES missions (`apps/api/src/modules/factoring`), qui
 * n'avait ni fournisseur ni famille : ce n'est ni Bellum qui facture, ni un
 * outil que l'espace a branché, c'est une fonction native du produit.
 */
export const internalCapabilityValues = [
  'accounts',
  'contacts',
  'needs',
  'talent_pool',
  'missions',
  'market_memory',
  'dataforge',
  'invoicing',
  'routines',
] as const
export const internalCapabilitySchema = z.enum(internalCapabilityValues)
export type InternalCapability = z.infer<typeof internalCapabilitySchema>

/**
 * État d'une capacité INTERNE — jamais « à connecter » (rien à autoriser, pas
 * de fournisseur), mais elle peut être COUPÉE par un kill-switch opérateur.
 *
 * Même règle que `CapabilityState` : DÉRIVÉ, jamais stocké, et une valeur
 * absente n'est jamais un booléen nu — `unavailable_reason` NOMME la coupure.
 */
export const internalCapabilityDescriptorSchema = z.object({
  key: internalCapabilitySchema,
  available: z.boolean(),
  /** FR+EN, `null` quand `available` est vrai — jamais deviné, jamais 0/false nu. */
  unavailable_reason: localizedTextSchema.nullable(),
})
export type InternalCapabilityDescriptor = z.infer<typeof internalCapabilityDescriptorSchema>

/**
 * Dérive l'état des huit capacités internes depuis ce qu'on sait RÉELLEMENT
 * d'elles — aujourd'hui, le seul interrupteur mesuré est celui des routines
 * (`ROUTINES_DISABLED`, kill-switch `routines.sweep`). Les sept autres familles
 * n'ont aucun kill-switch déclaré au 17/09/2026 : leur état honnête est donc
 * `available: true` — pas « inconnu », pas « non mesuré rendu indisponible ».
 */
export function deriveInternalCapabilities(input: { routinesCut: boolean }): InternalCapabilityDescriptor[] {
  return internalCapabilityValues.map(key => {
    if (key === 'routines' && input.routinesCut) {
      return {
        key,
        available: false,
        unavailable_reason: {
          fr: "coupées par l'opérateur (aucun briefing ni routine ne part actuellement)",
          en: 'cut by the operator (no briefing or routine is currently sent)',
        },
      }
    }
    return { key, available: true, unavailable_reason: null }
  })
}
