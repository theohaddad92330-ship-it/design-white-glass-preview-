import { z } from 'zod'

/**
 * #4185 — L'ADAPTATEUR CRM COMMUN : le contrat que chaque CRM branché porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Brancher un CRM de plus touchait une dizaine de switchs et de listes (le
 * routeur d'actions, l'export de besoin, l'écran de connecteurs, le rappel
 * OAuth, la recommandation « pour démarrer »…). Chaque fournisseur restait donc
 * à un niveau différent, et personne ne pouvait dire lequel savait quoi sans
 * ouvrir cinq fichiers.
 *
 * Ce fichier est l'UNIQUE endroit (GA-26) qui dit :
 *  - quels CRM le produit sait brancher (`CRM_PROVIDERS`) ;
 *  - quelles opérations un adaptateur CRM peut porter (`CRM_ADAPTER_OPERATIONS`) ;
 *  - ce que CHAQUE fournisseur porte aujourd'hui (`CRM_PROVIDER_CAPABILITIES`).
 *
 * La garde `crm-adapter.registry.spec.ts` (API) fait échouer la CI si un
 * fournisseur déclaré ici n'a pas d'adaptateur, ou si une opération déclarée
 * n'est pas implémentée — et, à l'inverse, si un adaptateur implémente une
 * opération que la matrice ne déclare pas (une capacité tue est un mensonge
 * par omission dans l'écran qui la lit).
 *
 * ⚠️ `provider` est un identifiant INTERNE ; l'écran affiche `CRM_TOOL_NAMES`.
 * La doctrine interdit de nommer NOS fournisseurs (données, modèles, hébergement),
 * pas l'outil que l'espace a lui-même BRANCHÉ (décision Louis 16/10/2026) : « Envoyer
 * vers HubSpot · bellum-it.com » dit l'outil ET l'espace (`accountLabel`) — sans
 * quoi l'on ne sait pas où part l'envoi.
 */
export const CRM_PROVIDERS = ['hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho'] as const
export const crmProviderSchema = z.enum(CRM_PROVIDERS)
export type CrmProvider = (typeof CRM_PROVIDERS)[number]

/** Le nom de l'OUTIL branché par le client, tel qu'il s'écrit à l'écran — l'unique table (GA-26). */
export const CRM_TOOL_NAMES: Readonly<Record<CrmProvider, string>> = {
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  pipedrive: 'Pipedrive',
  attio: 'Attio',
  odoo: 'Odoo',
  zoho: 'Zoho CRM',
}

/**
 * Les opérations de l'interface. `status` est obligatoire pour tous (savoir si
 * le lien existe est la condition de tout le reste) ; les autres sont portées
 * ou non, et la matrice le dit.
 *
 *  - `upsert_contact` : créer OU mettre à jour une personne (jamais un doublon) ;
 *  - `upsert_company` : créer OU retrouver une société (jamais un doublon) ;
 *  - `task_note`      : déposer un besoin sous la forme idiomatique du CRM
 *                       (affaire, tâche ou note) ;
 *  - `read`           : relire comptes/contacts/affaires depuis le CRM.
 */
export const CRM_ADAPTER_OPERATIONS = ['status', 'upsert_contact', 'upsert_company', 'task_note', 'read'] as const
export type CrmAdapterOperation = (typeof CRM_ADAPTER_OPERATIONS)[number]

/**
 * #4290.17 — les CRM dont un webhook entrant est accepté (la contrainte SQL porte la même liste). Les autres sont relus
 * à intervalle régulier : la carte le dit AVANT même le branchement. Vit ICI, à un seul endroit (GA-26).
 */
export const CRM_WEBHOOK_PROVIDERS = ['hubspot', 'salesforce'] as const
export type CrmWebhookProvider = (typeof CRM_WEBHOOK_PROVIDERS)[number]

/** Comment le lien se pose : un aller-retour OAuth, ou des identifiants saisis. */
type CrmConnectMode = 'oauth' | 'credentials'

type CrmProviderCapability = {
  readonly connect: CrmConnectMode
  readonly operations: readonly CrmAdapterOperation[]
}

/**
 * Ce que chaque fournisseur porte AUJOURD'HUI — mesuré sur le code, pas promis.
 * État du 14/10/2026 (épopée #4184) :
 *  - `read` : HubSpot seul relisait vraiment ; depuis #4189 les six relisent par
 *    l'interface commune — QUELS objets chacun relit se lit dans
 *    `CRM_PROVIDER_READ_SCOPE` (un objet que le CRM n'expose pas est absent) ;
 *  - `upsert_company` : les cinq depuis #4188 (« ce compte, je l'envoie sur mon CRM ») ;
 *  - `task_note` : Odoo n'a aucun dépôt de besoin.
 */
export const CRM_PROVIDER_CAPABILITIES: Readonly<Record<CrmProvider, CrmProviderCapability>> = {
  hubspot: { connect: 'oauth', operations: ['status', 'upsert_contact', 'upsert_company', 'task_note', 'read'] },
  salesforce: { connect: 'oauth', operations: ['status', 'upsert_contact', 'upsert_company', 'task_note', 'read'] },
  pipedrive: { connect: 'oauth', operations: ['status', 'upsert_contact', 'upsert_company', 'task_note', 'read'] },
  attio: { connect: 'oauth', operations: ['status', 'upsert_contact', 'upsert_company', 'task_note', 'read'] },
  odoo: { connect: 'credentials', operations: ['status', 'upsert_contact', 'upsert_company', 'read'] },
  // #4187 — Zoho : OAuth 2.0 à région paramétrable ; dépose une tâche (+ note sur la société).
  zoho: { connect: 'oauth', operations: ['status', 'upsert_contact', 'upsert_company', 'task_note', 'read'] },
}

/** Le fournisseur porte-t-il cette opération ? Lecture de la matrice, rien d'autre. */
export function crmSupports(provider: CrmProvider, operation: CrmAdapterOperation): boolean {
  return CRM_PROVIDER_CAPABILITIES[provider].operations.includes(operation)
}

/** Les CRM qui portent une opération, dans l'ordre de `CRM_PROVIDERS` (l'ordre du sélecteur). */
export function crmProvidersSupporting(operation: CrmAdapterOperation): CrmProvider[] {
  return CRM_PROVIDERS.filter(provider => crmSupports(provider, operation))
}

/** Les CRM dont le lien se pose par un aller-retour OAuth (le rappel les lit). */
export const CRM_OAUTH_PROVIDERS: readonly CrmProvider[] = CRM_PROVIDERS.filter(
  provider => CRM_PROVIDER_CAPABILITIES[provider].connect === 'oauth',
)

/**
 * #4189 — les objets que l'interface de LECTURE sait relire.
 *
 * `owners` (les propriétaires de fiches) n'existe que là où le contrat du CRM le
 * rend avec les droits demandés : Zoho (`ZohoCRM.users.READ`), et depuis SYNC-A (19/10/2026)
 * HubSpot, Salesforce, Pipedrive et Odoo.
 */
export const CRM_READ_OBJECTS = ['accounts', 'contacts', 'deals', 'activities', 'owners'] as const
export type CrmReadObject = (typeof CRM_READ_OBJECTS)[number]

/**
 * #3918.7 (recette 18/10) — les fournisseurs dont les AFFAIRES deviennent des signaux de veille (affaire perdue,
 * en sommeil, à renouveler) : la lecture profonde alimente le cache des signaux CRM. Une seule liste, lue par
 * l'API (récolte) ET par l'écran Intégrations (la note de périmètre ne dit « hors périmètre » que pour les autres).
 */
export const CRM_DEAL_SIGNAL_PROVIDERS = ['pipedrive', 'odoo', 'salesforce'] as const satisfies readonly CrmProvider[]

/**
 * Ce que CHAQUE fournisseur relit RÉELLEMENT — l'écran (`CrmReadScopeNote`) lit
 * cette table et rien d'autre : une capacité absente d'ici n'est jamais
 * affichée comme lue. Un objet que le CRM n'expose pas (ou dont le droit de
 * lecture n'est pas demandé à l'installation) est ABSENT, jamais inventé :
 *  - Zoho : pas d'activités — les scopes minimaux n'incluent aucune lecture des tâches ;
 *  - Attio : pas d'activités — tâches et notes demandent un droit que l'intégration ne demande pas.
 * Un fournisseur qui ne porte pas `read` ne déclare aucun objet.
 */
export const CRM_PROVIDER_READ_SCOPE: Readonly<Record<CrmProvider, readonly CrmReadObject[]>> = {
  // SYNC-A (19/10/2026) — le miroir : activités et propriétaires là où l'API les rend avec les portées
  // demandées (HubSpot : `crm.objects.owners.read` ajoutée, reconnexion requise).
  hubspot: ['accounts', 'contacts', 'deals', 'activities', 'owners'],
  salesforce: ['accounts', 'contacts', 'deals', 'activities', 'owners'],
  pipedrive: ['accounts', 'contacts', 'deals', 'activities', 'owners'],
  attio: ['accounts', 'contacts', 'deals'],
  odoo: ['accounts', 'contacts', 'deals', 'activities', 'owners'],
  zoho: ['accounts', 'contacts', 'deals', 'owners'],
}

export function crmReadsObject(provider: CrmProvider, object: CrmReadObject): boolean {
  return CRM_PROVIDER_READ_SCOPE[provider].includes(object)
}

/**
 * La synchro INCRÉMENTALE par fournisseur : sur QUOI elle se cale, et si la
 * lecture arrive DANS L'ORDRE de ce curseur.
 *
 *  - `cursor` : `modified_at` = la date de modification de la fiche ;
 *    `created_at` = seulement sa création — c'est le cas d'Attio, dont les
 *    fiches ne portent pas de date de modification : ses créations arrivent,
 *    ses modifications non (l'écran le DIT).
 *  - `ordered` : la lecture est triée par ce curseur (croissant). Si non, le
 *    curseur n'avance QUE sur un passage complet — avancer sur un passage
 *    tronqué ferait sauter à jamais les fiches non encore lues.
 *
 * SYNC-C (19/10/2026) — HubSpot y ENTRE : sa lecture « depuis » passe par l'API search
 * (`hs_lastmodifieddate` croissant). Son rapprochement quotidien de `crm-sync` (#2261) reste.
 */
export const CRM_INCREMENTAL_SYNC: Readonly<
  Partial<Record<CrmProvider, { readonly cursor: 'modified_at' | 'created_at'; readonly ordered: boolean }>>
> = {
  hubspot: { cursor: 'modified_at', ordered: true },
  salesforce: { cursor: 'modified_at', ordered: true },
  pipedrive: { cursor: 'modified_at', ordered: true },
  attio: { cursor: 'created_at', ordered: false },
  odoo: { cursor: 'modified_at', ordered: true },
  zoho: { cursor: 'modified_at', ordered: true },
}

/** Les CRM dont la lecture sait se caler sur un curseur (l'ordre du contrat). */
export const CRM_INCREMENTAL_PROVIDERS: readonly CrmProvider[] = CRM_PROVIDERS.filter(
  provider => CRM_INCREMENTAL_SYNC[provider] !== undefined,
)

/**
 * #4189 — un écart PROPOSÉ : la fiche a été modifiée des deux côtés. `bellumValue` est la valeur
 * GARDÉE (une correction humaine gagne toujours), `crmValue` celle que le CRM annonce. Rien n'est
 * appliqué ; une valeur absente est `null`, jamais une chaîne inventée.
 */
export type CrmReadConflict = {
  /** #4189.9 — l'écart journalisé (cible du geste « Garder la valeur du CRM ») ; absent sur la ligne de démonstration. */
  id?: string
  entityType: 'account' | 'contact'
  /** Théo D settings-integrations.N3 — la fiche concernée (nom du contact ou de la société) ; `null` si elle n'existe plus. */
  entityLabel?: string | null
  field: string
  bellumValue: string | null
  crmValue: string | null
  /** Date du passage qui a vu l'écart (ISO). */
  at: string
}

/**
 * #4467 — les raisons d'échec de synchro que l'écran sait DIRE en français (le code est la donnée ; la phrase
 * vit dans les traductions, avec le nom de l'outil branché par le client — jamais celui d'un de nos fournisseurs).
 */
export const CRM_SYNC_ERROR_HINTS = [
  'hubspot_owners_scope',
  'authorization_expired',
  'attio_deals_disabled',
  'odoo_endpoint_unreachable',
] as const

/**
 * #4189 — ce que l'écran des intégrations lit, par CRM BRANCHÉ (`GET /crm/import/status`).
 * `lastSyncAt` est la date d'un passage RÉEL (jamais « maintenant ») ; `null` = aucune synchro encore.
 * `provider` reste un identifiant interne : l'écran nomme l'espace (`accountLabel`).
 */
export type CrmReadStatus = {
  provider: CrmProvider
  accountLabel: string | null
  /** Les objets réellement relus (`CRM_PROVIDER_READ_SCOPE`). */
  objects: CrmReadObject[]
  /** Sur quoi se cale la synchro incrémentale ; `null` = ce CRM n'a pas de synchro incrémentale par ce chemin. */
  incremental: 'modified_at' | 'created_at' | null
  /** #4290.16 — la dernière synchro RÉUSSIE (jamais la date d'un essai raté) ; `null` = aucune réussie. */
  lastSyncAt: string | null
  /** #4290.16 — l'essai le plus récent, présent SEULEMENT s'il a échoué après la dernière réussite (la raison : `lastError`). */
  lastAttemptAt?: string | null
  /** SYNC-C — la prochaine synchro prévue (ISO) : dernier passage réel + intervalle. `null` = aucune prévue (jamais synchronisé, ou synchro coupée). */
  nextSyncAt?: string | null
  /** #4290.17 — comment ce CRM reste à jour : `webhook` (temps réel) ou relecture toutes les `everyMinutes`. Absent = serveur antérieur. */
  refresh?: { mode: 'webhook' } | { mode: 'poll'; everyMinutes: number }
  lastError: string | null
  /** #4467 — la raison de `lastError` quand elle est connue ; `null` = erreur brute, aucune raison inventée. */
  lastErrorHint?: (typeof CRM_SYNC_ERROR_HINTS)[number] | null
  /** Fiches modifiées des deux côtés au dernier passage (la correction humaine est gardée). */
  conflicts: number
  /** Les écarts du dernier passage, PROPOSÉS (les plus récents d'abord, bornés). Absent = serveur antérieur. */
  conflictItems?: CrmReadConflict[]
  /** #4189.8 — ligne de la salle de démonstration : données fictives, aucun CRM réel derrière. */
  demo?: true
}

/** #4189.9 — le geste « Garder la valeur du CRM » : un écart (son id) et le champ dont la valeur CRM l'emporte. */
export const keepCrmValueSchema = z.object({
  eventId: z.string().guid(),
  field: z.string().min(1).max(64),
})
export type KeepCrmValueInput = z.infer<typeof keepCrmValueSchema>

/**
 * Théo D settings-integrations.N4 — une ligne de l'HISTORIQUE DES ÉCHANGES : une opération réellement faite avec un
 * outil branché, et son résultat TEL QUE L'OUTIL LE RAPPORTE. Aucune ligne n'est inventée : elles viennent des
 * passages de lecture (`sync_runs`), des écritures validées (`contact_crm_exports`) et des premières synchros.
 *
 * - `read` / `first_sync` : lecture entrante. `result: 'to_review'` quand des écarts attendent l'onglet À relire.
 * - `write` : une écriture validée par l'utilisateur ; `confirmed` = l'outil a répondu (jamais « fait » sans retour).
 * - `refused` : l'outil a refusé ; `detail` porte sa raison telle quelle.
 *
 * `provider` est un identifiant interne : l'écran nomme l'outil par le registre, jamais un fournisseur à nous.
 */
export type IntegrationExchange = {
  id: string
  /** Date de l'opération (ISO). */
  at: string
  provider: string
  kind: 'read' | 'write' | 'first_sync'
  entityType: 'account' | 'contact' | null
  counts: { created: number; updated: number; skipped: number; conflicts: number } | null
  result: 'done' | 'to_review' | 'confirmed' | 'refused'
  /** La raison d'un refus, telle que l'outil l'a rendue ; `null` sinon. */
  detail: string | null
  /** Ligne de la salle de démonstration : fictive, aucun outil réel derrière. */
  demo?: true
}
