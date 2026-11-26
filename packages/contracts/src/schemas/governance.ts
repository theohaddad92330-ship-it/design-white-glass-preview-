import { z } from 'zod'

/**
 * La GOUVERNANCE du CRM natif — vues sauvegardées, champs personnalisés bornés,
 * doublons proposés.
 *
 * Trois besoins qu'un CRM finit toujours par rencontrer, et trois façons connues
 * de les rater :
 *
 * 1. **Les vues sauvegardées.** Chacun refait le même filtre tous les matins.
 *    L'erreur classique est de sauvegarder le RÉSULTAT : la vue se périme le
 *    lendemain et ment. On sauvegarde le CRITÈRE.
 * 2. **Les champs personnalisés.** L'erreur classique est de les rendre
 *    illimités : au bout d'un an la base porte quarante colonnes que personne
 *    n'a documentées, dont douze doublons, et plus aucun rapport n'est possible.
 *    Ils sont donc BORNÉS, typés, et un champ retiré garde ses valeurs.
 * 3. **Les doublons.** L'erreur classique est de fusionner automatiquement.
 *    Fusionner est irréversible et un faux positif détruit l'historique d'un
 *    vrai client — on PROPOSE, avec la raison et la confiance, et la décision
 *    est enregistrée pour que la même paire ne revienne pas indéfiniment.
 */

// ─────────────────────────────── vues sauvegardées ───────────────────────────

/**
 * ⚠️ **AJOUT EN FIN, jamais d'insertion au milieu** (GA-08), et la contrainte
 * `saved_views_scope_check` s'élargit AVANT le code qui écrit (GA-11 / GA-12).
 *
 * `discover` est arrivé le 15/09/2026 (#2151.3 à .13). Découvrir gardait ses
 * périmètres rejouables dans le `localStorage` du navigateur : ils ne
 * survivaient ni au changement de poste, ni au partage, ni au vidage du cache —
 * alors que la table, ses trois routes, sa borne, son `owner_id` et son `shared`
 * existaient depuis le CRM natif et n'avaient qu'un seul appelant web.
 */
/**
 * #2170.52 — `projects_pipe` rejoint la liste, 17/09/2026. Un scope À PART de
 * `projects` (déjà pris par les vues enregistrées des BESOINS ouverts,
 * `SavedNeedViews.tsx`) : les critères ne sont pas la même forme (`NeedFilters`
 * contre les filtres rapides du pipe), et les mélanger dans une seule liste
 * ferait apparaître une vue de besoins parmi des vues de pipe sans que rien ne
 * les distingue à l'écran.
 */
export const SAVED_VIEW_SCOPES = [
  'accounts',
  'contacts',
  'projects',
  'talents',
  'missions',
  'discover',
  'projects_pipe',
] as const
export const savedViewScopeSchema = z.enum(SAVED_VIEW_SCOPES)
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number]

/** Combien de vues par personne et par écran. Au-delà, on ne choisit plus. */
export const SAVED_VIEWS_MAX_PER_SCOPE = 20

/**
 * #2151.6 — à quelle CADENCE le périmètre se rejoue.
 *
 * `manual` est le défaut et il est le premier de la liste : une alerte ne
 * s'allume pas parce qu'on a enregistré un filtre. Trois valeurs, parce qu'une
 * quatrième (« toutes les heures ») promettrait une fraîcheur que les sources
 * publiques n'ont pas — un registre d'entreprises ne bouge pas dans l'heure.
 */
export const SAVED_VIEW_ALERT_FREQUENCIES = ['manual', 'daily', 'weekly'] as const
export const savedViewAlertFrequencySchema = z.enum(SAVED_VIEW_ALERT_FREQUENCIES)
export type SavedViewAlertFrequency = (typeof SAVED_VIEW_ALERT_FREQUENCIES)[number]

/**
 * #2151.12 — PAR OÙ l'alerte arrive. Liste FERMÉE : un canal ajouté doit savoir
 * se couper, se tracer et respecter le silence de l'espace. `null` (pas de
 * canal) est un état distinct de `in_app` — « je ne veux pas être prévenu » et
 * « préviens-moi dans l'application » ne se confondent pas.
 */
export const SAVED_VIEW_ALERT_CHANNELS = ['in_app', 'email', 'sms'] as const
export const savedViewAlertChannelSchema = z.enum(SAVED_VIEW_ALERT_CHANNELS)
export type SavedViewAlertChannel = (typeof SAVED_VIEW_ALERT_CHANNELS)[number]

/**
 * #2151.5 — LE TYPE DE RÉSULTAT qu'un périmètre enregistré ramène.
 *
 * Découvrir ne rendait qu'une seule sorte de chose : des comptes. Un périmètre
 * enregistré ne pouvait donc pas dire ce qu'il ramène — et deux périmètres qui
 * ramènent des objets différents s'affichaient identiques dans la colonne de
 * gauche. Les quatre valeurs reprennent les types demandés au registre
 * (#2165.6 à .9), sans en inventer un cinquième.
 *
 * ⚠️ C'est un RÉSULTAT, pas un filtre : `ENTITY_TYPES` (`client`/`esn`/`all`,
 * `discover.ts`) dit QUI on cherche, cette liste dit QUOI on obtient. Les
 * confondre ferait un réglage à deux endroits (GA-26).
 *
 * ⚠️ `null` est un état à part entière : « personne ne l'a qualifié ». Retomber
 * sur `accounts` par défaut attribuerait au périmètre de quelqu'un un type
 * qu'il n'a pas choisi, et ce serait indiscernable d'un choix.
 *
 * ⚠️ AJOUT EN FIN, jamais d'insertion au milieu (GA-08) : la valeur voyage vers
 * `saved_views.result_type`, et la contrainte SQL s'élargit AVANT le code qui
 * l'écrit (GA-11 / GA-12).
 */
export const SAVED_VIEW_RESULT_TYPES = ['accounts', 'contacts', 'needs_signals', 'partners'] as const
export const savedViewResultTypeSchema = z.enum(SAVED_VIEW_RESULT_TYPES)
export type SavedViewResultType = (typeof SAVED_VIEW_RESULT_TYPES)[number]

export const savedViewSchema = z.object({
  id: z.string().guid(),
  scope: savedViewScopeSchema,
  name: z.string(),
  /**
   * Les CRITÈRES, jamais les résultats. Une vue qui stocke des identifiants se
   * périme le lendemain et affiche une liste qui ne correspond plus à son nom.
   */
  filters: z.record(z.string(), z.unknown()),
  /**
   * #2151.3 — POURQUOI ce périmètre existe, dans les mots de celui qui l'a
   * enregistré (« ouvrir trois comptes industriels en Rhône-Alpes »). `null`
   * quand il ne l'a pas dit : un objectif deviné vaudrait moins que rien.
   */
  objective: z.string().nullable(),
  /** Partagée avec l'espace, ou personnelle. */
  shared: z.boolean(),
  /** #2151.6 — à quelle cadence le périmètre se rejoue. */
  alertFrequency: savedViewAlertFrequencySchema,
  /** #2151.12 — par où l'alerte arrive. `null` = aucune alerte. */
  alertChannel: savedViewAlertChannelSchema.nullable(),
  /**
   * #2151.5 — CE QUE le périmètre ramène. `null` = non qualifié, jamais un
   * type par défaut.
   *
   * ⚠️ Optionnel avec un défaut, comme les autres champs neufs de ce contrat :
   * pendant les minutes qui séparent le déploiement du front de celui de l'API,
   * l'écran reçoit encore la réponse de l'API PRÉCÉDENTE.
   */
  resultType: savedViewResultTypeSchema.nullable().default(null),
  /**
   * #2151.8 — COMBIEN de nouveaux éléments depuis la dernière exécution.
   *
   * ⚠️ `null` n'est pas `0` : `null` = « jamais rejouée, donc on n'a pas
   * regardé », `0` = « on a regardé, il n'y a rien ». Calculé par
   * `newItemsSince` (`discover-alert-events.ts`), à un seul endroit.
   */
  newItems: z.number().int().min(0).nullable().default(null),
  /**
   * #2151.9 — la NATURE des sources qui alimentent ce périmètre, jamais le nom
   * d'un éditeur. Vide = source non qualifiée, jamais « aucune source ».
   */
  sourceKinds: z.array(z.string()).default([]),
  /**
   * #2151.7 — la DERNIÈRE EXÉCUTION, qui n'est pas la date d'enregistrement.
   * `null` = jamais rejouée depuis qu'elle existe. Retomber sur `createdAt`
   * inventerait une exécution qui n'a pas eu lieu.
   */
  lastRunAt: z.string().nullable(),
  ownerId: z.string().guid().nullable(),
  ownerName: z.string().nullable(),
  createdAt: z.string(),
})
export type SavedView = z.infer<typeof savedViewSchema>

export const createSavedViewSchema = z
  .object({
    scope: savedViewScopeSchema,
    name: z.string().trim().min(1).max(80),
    filters: z.record(z.string(), z.unknown()),
    /** #2151.3 — l'objectif, quand celui qui enregistre a bien voulu l'écrire. */
    objective: z.string().trim().max(240).nullable().default(null),
    /** Personnelle par défaut : partager la vue de quelqu'un d'autre sans qu'il
     *  l'ait demandé encombre l'écran de tout le monde. */
    shared: z.boolean().default(false),
    /** #2151.6 — `manual` par défaut : une alerte ne s'allume pas toute seule
     *  parce qu'on a enregistré un filtre. */
    alertFrequency: savedViewAlertFrequencySchema.default('manual'),
    /** #2151.12 — `null` par défaut, pour la même raison. */
    alertChannel: savedViewAlertChannelSchema.nullable().default(null),
    /** #2151.5 — ce que le périmètre ramène. `null` = non qualifié : on
     *  n'attribue pas un type à qui n'en a pas choisi. */
    resultType: savedViewResultTypeSchema.nullable().default(null),
  })
  .strict()
  .refine(value => Object.keys(value.filters).length > 0, {
    message: 'Une vue sans critère est la liste complète — elle existe déjà',
    path: ['filters'],
  })
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>
/**
 * Ce qu'un CLIENT envoie — les défauts ne sont pas encore appliqués.
 *
 * Distinct de `CreateSavedViewInput`, qui est ce que le serveur LIT une fois le
 * schéma passé : sans cette distinction, chaque écran devrait recopier les
 * défauts (`shared: false`, `alertFrequency: 'manual'`, …) pour compiler, et
 * une valeur par défaut recopiée à cinq endroits est une valeur qui divergera.
 */
export type CreateSavedViewDraft = z.input<typeof createSavedViewSchema>

// ──────────────────────────── champs personnalisés ───────────────────────────

/**
 * Les types autorisés. Liste FERMÉE et courte : chaque type ajouté doit savoir
 * s'afficher, se filtrer, s'exporter et se valider. Un type « objet libre »
 * coûterait ces quatre choses et n'en rendrait aucune.
 */
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'select'] as const
export const customFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPES)
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

export const CUSTOM_FIELD_ENTITIES = ['account', 'contact', 'project', 'consultant'] as const
export const customFieldEntitySchema = z.enum(CUSTOM_FIELD_ENTITIES)
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number]

/**
 * Combien de champs personnalisés par objet. **Dix, et c'est une décision.**
 *
 * Un système illimité produit, au bout d'un an, quarante colonnes que personne
 * n'a documentées, dont douze disent la même chose sous des noms différents — et
 * plus aucun rapport n'est possible. Dix force à arbitrer, et l'arbitrage est
 * précisément ce qui garde une base lisible.
 */
export const CUSTOM_FIELDS_MAX_PER_ENTITY = 10

export const customFieldDefSchema = z.object({
  id: z.string().guid(),
  entityType: customFieldEntitySchema,
  /** Clé machine, stable. Elle ne change JAMAIS — les exports s'y adossent. */
  key: z.string(),
  label: z.string(),
  type: customFieldTypeSchema,
  /** Valeurs autorisées, pour `select` uniquement. */
  options: z.array(z.string()),
  /** Un champ retiré n'efface pas ses valeurs : il cesse d'être proposé. */
  archived: z.boolean(),
  createdAt: z.string(),
})
export type CustomFieldDef = z.infer<typeof customFieldDefSchema>

export const createCustomFieldSchema = z
  .object({
    entityType: customFieldEntitySchema,
    label: z.string().trim().min(1).max(60),
    type: customFieldTypeSchema.default('text'),
    options: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  })
  .strict()
  .refine(value => value.type !== 'select' || value.options.length > 0, {
    message: 'Une liste de choix sans choix ne se remplit jamais',
    path: ['options'],
  })
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>

/**
 * Une clé machine à partir d'un libellé.
 *
 * Stable, ASCII, sans accent : elle voyage dans des exports CSV, des en-têtes et
 * des noms de colonne, et un accent y devient un caractère de remplacement chez
 * la moitié des tableurs.
 */
export function customFieldKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/**
 * Valide une valeur contre la définition de son champ.
 *
 * Rend `null` quand la valeur est acceptable, ou la raison du refus. Refuser en
 * NOMMANT la raison : « valeur invalide » sur un formulaire à dix champs oblige
 * à chercher lequel.
 */
export function validateCustomValue(
  def: Pick<CustomFieldDef, 'type' | 'options' | 'label'>,
  value: unknown,
): string | null {
  // Une valeur vide EFFACE le champ — c'est un geste légitime, et le refuser
  // rendrait un champ impossible à corriger une fois rempli par erreur.
  if (value === null || value === undefined || value === '') return null

  switch (def.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `« ${def.label} » attend un nombre`
    case 'boolean':
      return typeof value === 'boolean' ? null : `« ${def.label} » attend oui ou non`
    case 'date': {
      const parsed = typeof value === 'string' ? new Date(`${value}T12:00:00Z`) : null
      const valid =
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        parsed !== null &&
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      return valid ? null : `« ${def.label} » attend une date au format AAAA-MM-JJ`
    }
    case 'select':
      return typeof value === 'string' && def.options.includes(value)
        ? null
        : `« ${def.label} » n'accepte que : ${def.options.join(', ')}`
    default:
      return typeof value === 'string' && value.length <= 2000
        ? null
        : `« ${def.label} » attend un texte de moins de 2000 caractères`
  }
}

// ────────────────────────────── doublons proposés ────────────────────────────

/**
 * `auto_merged` (#4016 L6, 11/10/2026) — ajouté EN FIN (GA-08) : le balayeur a
 * FUSIONNÉ la paire lui-même, dans Bellum seulement, parce qu'elle atteignait
 * {@link DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE}. Jamais écrit par un humain
 * (`decideDuplicateSchema` le refuse) ; une annulation repasse la paire en
 * `dismissed` — « ce ne sont pas les mêmes » — et elle ne revient plus.
 */
export const DUPLICATE_DECISIONS = ['pending', 'merged', 'dismissed', 'auto_merged'] as const
export const duplicateDecisionSchema = z.enum(DUPLICATE_DECISIONS)
export type DuplicateDecision = (typeof DUPLICATE_DECISIONS)[number]

export const duplicatePairSchema = z.object({
  id: z.string().guid(),
  entityType: z.enum(['account', 'contact']),
  leftId: z.string().guid(),
  leftLabel: z.string().nullable(),
  rightId: z.string().guid(),
  rightLabel: z.string().nullable(),
  /** POURQUOI on les rapproche. Affiché tel quel : une proposition sans raison
   *  ne se vérifie pas, donc ne se décide pas. */
  reason: z.string(),
  /** 0 à 1. Une paire à 0,35 se montre différemment d'une paire à 0,95. */
  confidence: z.number().min(0).max(1),
  decision: duplicateDecisionSchema,
  decidedAt: z.string().nullable(),
  decidedByName: z.string().nullable(),
})
export type DuplicatePairView = z.infer<typeof duplicatePairSchema>

/**
 * #4016 L6 — LA FUSION AUTOMATIQUE, ET SON SEUIL (décision Louis 11/10/2026).
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ de `c37_fusion_doublons` (« on PROPOSE, on ne fusionne
 * JAMAIS »). Une paire dont la confiance atteint 0,99 est fusionnée par le
 * balayeur, SANS clic : dans BellumAI seulement — jamais dans le CRM du client,
 * dont l'écriture garde un go — et RÉVERSIBLE (journal `duplicate_pairs` +
 * annulation). En dessous, rien ne change : la paire est proposée.
 *
 * Ce qui atteint 0,99 aujourd'hui : deux fiches de contact à la MÊME adresse
 * ET au MÊME nom (société égale ou absente d'un côté). La date de naissance
 * reste HORS des clés (c58/c37, critère protégé — légal, jamais levé).
 */
export const DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE = 0.99

export function isAutoMergeable(confidence: number): boolean {
  return confidence >= DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE
}

/**
 * Qui survit à une fusion automatique : la fiche la plus ANCIENNE (c'est elle
 * que les objets d'affaire citent depuis le plus longtemps), l'identifiant
 * départageant deux dates égales — le même choix à chaque passage, jamais un
 * tirage.
 */
export function autoMergeSurvivor(
  left: { id: string; createdAt: string },
  right: { id: string; createdAt: string },
): { keptId: string; absorbedId: string } {
  const leftAt = Date.parse(left.createdAt)
  const rightAt = Date.parse(right.createdAt)
  const leftFirst = leftAt === rightAt ? left.id < right.id : leftAt < rightAt
  return leftFirst ? { keptId: left.id, absorbedId: right.id } : { keptId: right.id, absorbedId: left.id }
}

/** #4016 L6 — une fusion automatique, telle que la liste « fusionnés par Bellum » la montre. */
export const autoMergedPairSchema = z.object({
  id: z.string().guid(),
  entityType: z.enum(['account', 'contact']),
  keptId: z.string().guid(),
  keptLabel: z.string().nullable(),
  absorbedId: z.string().guid(),
  absorbedLabel: z.string().nullable(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  mergedAt: z.string(),
})
export type AutoMergedPairView = z.infer<typeof autoMergedPairSchema>

/**
 * #3490 — CE QUE LE DERNIER BALAYAGE A RÉELLEMENT VU.
 *
 * « Aucun doublon en attente » voulait dire trois choses que l'écran ne
 * distinguait pas : rien à signaler, personne n'a regardé, ou tout ce qui a
 * été détecté est déjà tranché. Les compteurs les séparent. `null` sur un
 * périmètre = NON MESURÉ (sa lecture a échoué), jamais « 0 ».
 */
const setAsideAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `merged` = rattaché à un autre dossier ; `archived` = archivé. */
  status: z.enum(['archived', 'merged']),
})
const setAsidePairSchema = z.object({
  left: setAsideAccountSchema.extend({ status: z.enum(['active', 'archived', 'merged']) }),
  right: setAsideAccountSchema.extend({ status: z.enum(['active', 'archived', 'merged']) }),
})

const duplicateScanSchema = z.object({
  accountsExamined: z.number().int().nonnegative().nullable(),
  /** #3490 — comptes archivés ou rattachés, laissés de côté du rapprochement. `null`/absent = non mesuré. */
  accountsSetAside: z.number().int().nonnegative().nullable().optional(),
  /**
   * #3490 (Y22) — LES comptes écartés, NOMMÉS (nom + statut) : « 2 comptes écartés » sans
   * les nommer ne se vérifie pas. Absent = rapport antérieur au champ ; liste bornée par le
   * balayeur (`accountsSetAside` garde le total réel).
   */
  setAsideAccounts: z.array(setAsideAccountSchema).optional(),
  /** #3490 (Y22) — paires de même nom DONT UN COMPTE est écarté : dites, jamais proposées. */
  setAsidePairs: z.array(setAsidePairSchema).optional(),
  contactsExamined: z.number().int().nonnegative().nullable(),
  /** Paires détectées au passage, déjà connues comprises (en attente ou tranchées). */
  pairsDetected: z.number().int().nonnegative(),
  /** Paires détectées mais déjà en base — celles qu'un humain a tranchées n'y reviennent pas. */
  alreadyKnown: z.number().int().nonnegative(),
  /** Au moins un périmètre n'a pas pu être lu : le passage est INCOMPLET. */
  failed: z.boolean(),
  /** #4016 L6 — paires fusionnées par CE passage (≥ 0,99, dans Bellum seulement). Absent = rapport antérieur. */
  autoMerged: z.number().int().nonnegative().optional(),
  /** #3490 — le passage n'a PAS eu lieu, et pourquoi : jamais confondu avec « rien trouvé ». */
  skipped: z.enum(['disabled', 'demo']).nullable().optional(),
  at: z.string(),
})
export type DuplicateScanView = z.infer<typeof duplicateScanSchema>

export const decideDuplicateSchema = z
  .object({
    /**
     * `merged` enregistre qu'un HUMAIN a fusionné — dans son CRM, à la main.
     * Bellum n'écrit rien dans le CRM : c'est irréversible côté CRM, et un faux
     * positif détruit l'historique d'un vrai client. (#4016 L6 — la fusion
     * automatique ≥ 0,99, elle, est écrite par le balayeur, jamais par ce geste.)
     */
    decision: z.enum(['merged', 'dismissed']),
  })
  .strict()
export type DecideDuplicateInput = z.infer<typeof decideDuplicateSchema>

/**
 * Une clé stable pour une paire, indépendante de l'ORDRE.
 *
 * Sans elle, (A, B) et (B, A) seraient deux paires : on proposerait deux fois le
 * même rapprochement, et écarter l'une laisserait l'autre revenir — ce qui rend
 * la liste impossible à vider, donc inutilisée.
 */
export function duplicatePairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join(':')
}
