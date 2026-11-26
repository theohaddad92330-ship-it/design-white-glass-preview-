import { z } from 'zod'

/**
 * La REPRISE et la COHABITATION — faire entrer un CRM existant sans écraser ce
 * qu'on y a déjà, et sans créer de doublons.
 *
 * C'est la tranche qui décide si une ESN peut adopter Bellum. Personne ne part
 * d'une base vide : il y a un CRM, trois ans d'historique, et une équipe qui
 * continue de travailler dedans pendant la bascule. Trois accidents à éviter,
 * dans cet ordre de gravité :
 *
 * 1. **Le doublon.** Réimporter crée une seconde fiche pour la même personne, et
 *    à partir de là plus personne ne sait laquelle est à jour. C'est ce que
 *    `sync_links` empêche : un lien entre l'identifiant EXTERNE et le nôtre, posé
 *    au premier import et relu à tous les suivants.
 * 2. **L'écrasement.** Un import qui remplace tout écrase les corrections faites
 *    à la main. Les champs importés arrivent donc avec la provenance
 *    `connector`, que l'arbitre de T0 place SOUS `human` : une correction
 *    humaine survit à tous les imports suivants, sans que l'import ait à le
 *    savoir.
 * 3. **L'irréversible.** Un premier import massif qui se passe mal doit pouvoir
 *    se défaire. D'où le `dry-run` obligatoire avant la première écriture, et le
 *    dénombrement de ce qui serait créé, mis à jour, ou ignoré.
 */

// #4189 — `odoo` (déjà admis par la base depuis la migration 1791570000000) et `zoho` (#4187,
// contrainte élargie par la migration 1796541540046, AVANT le code qui écrit).
export const SYNC_PROVIDERS = ['hubspot', 'salesforce', 'pipedrive', 'attio', 'odoo', 'zoho', 'csv'] as const
export const syncProviderSchema = z.enum(SYNC_PROVIDERS)
export type SyncProvider = (typeof SYNC_PROVIDERS)[number]

export const SYNC_ENTITY_TYPES = ['account', 'contact'] as const
export const syncEntityTypeSchema = z.enum(SYNC_ENTITY_TYPES)
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number]

/**
 * Le lien entre un enregistrement externe et le nôtre.
 *
 * C'est la seule chose qui empêche un second import de créer un second contact.
 * La clé est `(espace, fournisseur, type, identifiant externe)` : le même
 * identifiant peut exister chez deux fournisseurs sans être la même personne.
 */
export const syncLinkSchema = z.object({
  id: z.string().guid(),
  provider: syncProviderSchema,
  entityType: syncEntityTypeSchema,
  externalId: z.string(),
  internalId: z.string().guid(),
  /** Dernière fois que la ligne externe a été relue. */
  lastSyncedAt: z.string(),
  createdAt: z.string(),
})
export type SyncLink = z.infer<typeof syncLinkSchema>

/**
 * Ce qu'un import a FAIT — ou ferait, en `dryRun`.
 *
 * `skipped` porte sa RAISON. Un import qui annonce « 412 lignes traitées » sans
 * dire que 90 ont été ignorées laisse croire à une reprise complète, et le trou
 * se découvre trois semaines plus tard sur un compte qu'on croyait suivi.
 */
export const SYNC_SKIP_REASONS = [
  'no_identifier',
  'invalid_email',
  'already_linked_elsewhere',
  'unchanged',
  'limit_reached',
] as const
export const syncSkipReasonSchema = z.enum(SYNC_SKIP_REASONS)
export type SyncSkipReason = (typeof SYNC_SKIP_REASONS)[number]

export const syncOutcomeSchema = z.object({
  provider: syncProviderSchema,
  entityType: syncEntityTypeSchema,
  /** Vrai = rien n'a été écrit. Le premier import d'un espace l'est toujours. */
  dryRun: z.boolean(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.array(z.object({ ref: z.string(), reason: syncSkipReasonSchema })),
  /**
   * La borne a coupé. L'écran doit le DIRE : « 500 contacts importés » sur une
   * base de 3000 se lit comme une reprise finie.
   */
  truncated: z.boolean(),
  /** Ce que l'import n'a pas su lire chez le fournisseur, s'il y a lieu. */
  unavailable: z.string().nullable(),
  /**
   * #4189 — fiches modifiées des DEUX côtés : la correction humaine est gardée
   * (« une correction humaine gagne toujours »), l'écart est compté ici et
   * journalisé fiche par fiche. Absent des reprises d'avant le compteur.
   */
  conflicts: z.number().int().nonnegative().optional(),
})
export type SyncOutcome = z.infer<typeof syncOutcomeSchema>

export const startSyncSchema = z
  .object({
    provider: syncProviderSchema,
    entityType: syncEntityTypeSchema.default('contact'),
    /**
     * Défaut `true`, et c'est le cœur de la tranche : un import écrit seulement
     * quand quelqu'un a VU ce qu'il allait faire. Un défaut à `false` ferait
     * du premier appel exploratoire une écriture de masse.
     */
    dryRun: z.boolean().default(true),
    /** Borne dure par exécution. Au-delà, on repasse — et on le dit. */
    limit: z.number().int().min(1).max(1000).default(200),
  })
  .strict()
export type StartSyncInput = z.infer<typeof startSyncSchema>

/** L'exécution d'un import, telle qu'on la relit après coup. */
export const syncRunSchema = z.object({
  id: z.string().guid(),
  provider: syncProviderSchema,
  entityType: syncEntityTypeSchema,
  dryRun: z.boolean(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  startedByName: z.string().nullable(),
  error: z.string().nullable(),
})
export type SyncRun = z.infer<typeof syncRunSchema>

/**
 * Ce qui est arrivé à UN enregistrement pendant un import.
 *
 * Le journal par enregistrement est ce qui permet de répondre à « d'où vient ce
 * contact ? » et « pourquoi ce champ a-t-il changé ? » — les deux questions que
 * pose une équipe le lendemain d'une reprise. Sans lui, la réponse est « l'import
 * l'a fait », ce qui n'aide personne.
 */
export const SYNC_RECORD_ACTIONS = ['created', 'updated', 'skipped', 'conflict'] as const
export const syncRecordActionSchema = z.enum(SYNC_RECORD_ACTIONS)
export type SyncRecordAction = (typeof SYNC_RECORD_ACTIONS)[number]

export const syncRecordEventSchema = z.object({
  id: z.string().guid(),
  runId: z.string().guid(),
  entityType: syncEntityTypeSchema,
  externalId: z.string(),
  internalId: z.string().guid().nullable(),
  action: syncRecordActionSchema,
  /** Les champs réellement écrits. Vide sur un `skipped`. */
  fields: z.array(z.string()),
  reason: z.string().nullable(),
  at: z.string(),
})
export type SyncRecordEvent = z.infer<typeof syncRecordEventSchema>

/** Une ligne d'import, réduite à ce dont la décision a besoin. */
export type IncomingRecord = {
  externalId: string
  email: string | null
  name: string | null
  /** #4189 — date de modification (ISO) côté CRM, quand il la rend ; porte le curseur incrémental. */
  modifiedAt?: string | null
  /**
   * #4603 — le SIREN que la SOCIÉTÉ porte côté CRM, brut (normalisé à l'écriture), quand le CRM le rend.
   * Absent = le CRM ne le porte pas : la fiche part sans SIREN, jamais un identifiant deviné.
   */
  siren?: string | null
}

export type SyncDecision =
  | { action: 'create' }
  | { action: 'update'; internalId: string }
  | { action: 'skip'; reason: SyncSkipReason }

/**
 * L'index de rattachement, tel que la décision le lit.
 *
 * `linkedInternalIds` est la moitié qui manquait, et son absence a coûté cher :
 * sans elle, « cette adresse appartient déjà à quelqu'un » et « cette fiche est
 * déjà revendiquée par une autre ligne du CRM » étaient le même fait. Ce sont
 * deux situations opposées — la première est une résolution à poser, la seconde
 * est un arbitrage humain.
 */
export type SyncIndex = {
  /** Identifiant externe → identifiant interne, tel que `sync_links` le porte. */
  byExternalId: Map<string, string>
  /** Adresse normalisée → identifiant interne, sur TOUTES les fiches de l'espace. */
  byEmail: Map<string, string>
  /** Les fiches qui portent DÉJÀ un identifiant externe de ce fournisseur. */
  linkedInternalIds: ReadonlySet<string>
}

/**
 * Que faire d'une ligne entrante.
 *
 * Pur et testé, parce que c'est ici que se décide le doublon. Cinq règles :
 *
 * 1. **Sans identifiant externe, on n'importe pas.** Un import sans clé ne peut
 *    pas être rejoué : le second passage recréerait tout.
 * 2. **Un lien existant fait une MISE À JOUR**, jamais une création. C'est ce
 *    qui rend un import rejouable.
 * 3. **Une adresse qui désigne une fiche NON LIÉE est la première résolution** :
 *    on rattache et on met à jour. Rattacher n'est PAS fusionner — rien n'est
 *    détruit, aucune fiche n'en absorbe une autre ; un identifiant externe est
 *    posé sur la fiche qui porte exactement cette adresse. Une adresse est une
 *    clé d'identité forte : deux homonymes chez deux sociétés différentes n'ont
 *    pas la même, et c'est précisément le cas que la doctrine anti-fusion
 *    protège.
 * 4. **Une adresse qui désigne une fiche DÉJÀ LIÉE est un conflit**, pas une
 *    fusion : deux lignes du CRM revendiquent la même personne, et c'est à un
 *    humain de trancher — même doctrine que `crm-duplicates`.
 * 5. **Une ligne sans adresse ET sans nom n'est rien.** L'importer créerait une
 *    fiche vide que personne ne saura jamais rattacher.
 */
export function decideSync(incoming: IncomingRecord, index: SyncIndex): SyncDecision {
  if (!incoming.externalId.trim()) return { action: 'skip', reason: 'no_identifier' }

  const linked = index.byExternalId.get(incoming.externalId)
  if (linked) return { action: 'update', internalId: linked }

  const email = incoming.email?.trim().toLowerCase()
  if (email) {
    const owner = index.byEmail.get(email)
    if (owner) {
      // Déjà revendiquée par une AUTRE ligne du CRM : personne ne peut dire
      // laquelle est la bonne à notre place.
      if (index.linkedInternalIds.has(owner)) return { action: 'skip', reason: 'already_linked_elsewhere' }
      // Sinon c'est la première résolution : la fiche existe, elle n'appartient
      // encore à aucun identifiant externe. La recréer serait le doublon que
      // tout ce mécanisme existe pour éviter.
      return { action: 'update', internalId: owner }
    }
  } else if (!incoming.name?.trim()) {
    return { action: 'skip', reason: 'no_identifier' }
  }

  return { action: 'create' }
}

/**
 * Agrège des décisions en compte-rendu.
 *
 * Le `dryRun` traverse tel quel : c'est le seul champ qui dit si les nombres
 * décrivent ce qui a été fait ou ce qui le SERAIT, et les confondre est la
 * façon la plus simple de croire qu'un import a eu lieu.
 */
export function summarizeSync(
  decisions: readonly { decision: SyncDecision; ref: string }[],
  meta: { provider: SyncProvider; entityType: SyncEntityType; dryRun: boolean; truncated: boolean },
): SyncOutcome {
  let created = 0
  let updated = 0
  const skipped: { ref: string; reason: SyncSkipReason }[] = []

  for (const entry of decisions) {
    if (entry.decision.action === 'create') created += 1
    else if (entry.decision.action === 'update') updated += 1
    else skipped.push({ ref: entry.ref, reason: entry.decision.reason })
  }

  return { ...meta, created, updated, skipped, unavailable: null }
}
