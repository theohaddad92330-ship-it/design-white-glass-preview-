import { z } from 'zod'

/**
 * MemoryItem — l'objet « mémoire » de l'architecture transverse (restitution V2
 * §20). Le rapport en exige un contenu minimum : **fait, préférence, correction,
 * origine, portée, expiration**.
 *
 * La table `memory_pinned_facts` ne portait que le fait et sa portée
 * (workspace / compte) : tout ce qui était épinglé était un FAIT, sans dire d'où
 * il venait, et vrai POUR TOUJOURS. Ces trois schémas ferment l'écart :
 *
 * - `kind`      — la NATURE de l'élément : un fait constaté, une préférence de
 *                 travail, ou une correction que le commercial impose au copilote.
 * - `origin`    — D'OÙ il vient : épinglé à la main, retenu d'une réponse du
 *                 copilote, ou dérivé d'un dossier analysé.
 * - `expiresAt` — jusqu'à QUAND il vaut. `null` = sans échéance (le comportement
 *                 historique, conservé par défaut) ; daté = le copilote cesse de
 *                 le lire une fois la date passée.
 *
 * Rien n'est deviné : les défauts (`fact` / `manual` / pas d'échéance) décrivent
 * exactement ce que faisait déjà un épinglage manuel.
 */

/**
 * #1962.2/.5/.7/.9/.10 — LES SEPT NATURES.
 *
 * Trois natures ne suffisaient pas : « le décideur a changé » (une correction
 * du terrain), « ils ont levé 12 M€, source communiqué du 3 mars » (une
 * observation SOURCÉE) et « je crois qu'ils internalisent » (une HYPOTHÈSE)
 * arrivaient toutes trois dans le prompt comme des « faits épinglés à respecter
 * en priorité ». Une supposition lue comme un fait est exactement ce que la
 * doctrine « jamais de donnée fictive » interdit ; c'est `_format_memory`
 * (service IA) qui en tire les conséquences, et lui seul.
 *
 * - `fact`                — un constat.
 * - `preference`          — une façon de travailler.
 * - `correction`          — ce que la personne impose au copilote. Rang 1.
 * - `workspace_rule`      — une règle de l'ESN (#1962.5). Son NOM dit qu'elle
 *                           est partagée : d'où son défaut de portée.
 * - `sourced_observation` — un constat QUI CITE SA SOURCE (#1962.7).
 * - `hypothesis`          — une piste à vérifier (#1962.9/.15). Elle éclaire,
 *                           elle ne tranche jamais.
 * - `temporary_context`   — un contexte qui ne vaut qu'un temps (#1962.10). La
 *                           NATURE, distincte de `expiresAt` qui est la DATE :
 *                           « on est en appel d'offres » vaut un temps même
 *                           quand personne n'a su dire jusqu'à quand.
 * - `goal`                — #2260.17 (LAU-FINAL-005) : un objectif de
 *                           l'utilisateur (« ouvrir 3 comptes Banque ce
 *                           trimestre »). Absent jusqu'ici : le centre
 *                           « ce que Laura garde en tête » devait montrer les
 *                           objectifs, et aucune nature ne les distinguait
 *                           d'une préférence ou d'un fait déclaré.
 *
 * La huitième catégorie de l'issue #1962 — « note de Laura, à vérifier » —
 * n'était PAS une nature : c'est l'origine `copilot` non confirmée, déjà
 * portée et déjà affichée. Une nature de plus la aurait dédoublée (loi 1 du
 * tome 7) ; `goal` répond à un besoin différent, déjà distingué à l'écran.
 *
 * ⚠️ Enum LIVRÉ (GA-08) : les valeurs s'ajoutent EN FIN, jamais au
 * milieu — `kind` est écrit en base et relu par le prompt. La contrainte SQL
 * `memory_pinned_facts_kind_check` les connaît AVANT ce code (GA-11 / GA-12,
 * migration `1794001962000` puis `1795540000000` pour `goal`).
 */
export const memoryItemKindSchema = z.enum([
  'fact',
  'preference',
  'correction',
  'workspace_rule',
  'sourced_observation',
  'hypothesis',
  'temporary_context',
  'goal',
])
export type MemoryItemKind = z.infer<typeof memoryItemKindSchema>

/** Les 8 natures, dans l'ordre d'affichage du sélecteur d'épinglage. */
export const memoryItemKinds = memoryItemKindSchema.options

export const memoryItemOriginSchema = z.enum(['manual', 'copilot', 'analysis'])
export type MemoryItemOrigin = z.infer<typeof memoryItemOriginSchema>

/**
 * #1918.1 — LA PORTÉE : pour qui l'élément vaut, donc QUI le voit et pour qui
 * Laura s'en sert.
 *
 * - `user`      — la personne qui l'a épinglé, et elle seule. Ni l'écran de
 *                 mémoire d'un collègue, ni le contexte envoyé au modèle quand
 *                 un collègue parle à Laura ne le reçoivent.
 * - `workspace` — tous les membres de l'espace. C'était la portée de TOUT
 *                 élément avant ce lot ; la migration `1792800070000` y range
 *                 donc l'existant, pour qu'aucune visibilité ne change en silence.
 * - `business_unit` (#1918.2) — les membres d'UN périmètre de travail NOMMÉ.
 *                 L'élément porte `businessUnitId` : ce n'est pas « mon
 *                 équipe » en général, c'est CETTE agence, CETTE practice.
 * - `conversation` (#1918.5) — ce seul fil, et son seul auteur. L'élément porte
 *                 `conversationId` et ne survit pas au fil.
 *
 * Le propriétaire n'a pas de champ à lui : c'est `user_id`, estampillé depuis le
 * jeton à la création de la ligne (jamais depuis le corps). Deux colonnes pour
 * dire « à qui est cette ligne » divergeraient.
 *
 * ⚠️ Enum LIVRÉ (GA-08) : une valeur s'ajoute EN FIN, jamais au milieu — d'où
 * l'ordre `user, workspace, business_unit, conversation`, qui n'est PLUS
 * l'ordre d'affichage (voir {@link offerableMemoryScopes}).
 *
 * ⚠️ #1918.2 — CE SUR QUOI « MON ÉQUIPE » S'APPUIE, ET CE QU'ON A REFUSÉ.
 * Une BU citée dans une réponse de questionnaire (`EsnAnswers`) est un LIBELLÉ
 * DÉCLARATIF : un mot, pas un objet qui a des membres. Une portée branchée
 * dessus ne filtrerait rien et mentirait sur ce qu'elle promet — un commercial
 * croirait parler à son agence en parlant à toute l'ESN. `business_unit`
 * s'appuie donc sur `business_unit_members` (`1793710000000-BusinessUnits`), la
 * seule table du dépôt qui dise qui fait partie de quoi.
 *
 * ⚠️ Et la VISIBILITÉ de cette portée se lit dans l'APPARTENANCE, jamais dans
 * `business_unit_access` : ce dernier répond à « qui a le droit de voir les
 * DONNÉES d'un périmètre » et vaut `workspace` par défaut, si bien qu'une
 * portée branchée dessus serait lue par tout l'espace. Deux questions
 * voisines, deux réponses — voir `MemoryService.readVisibleFacts`.
 */
export const memoryItemScopeSchema = z.enum(['user', 'workspace', 'business_unit', 'conversation'])
export type MemoryItemScope = z.infer<typeof memoryItemScopeSchema>

/** Les 4 portées, dans l'ordre FIGÉ de l'énumération (GA-08) — pas l'affichage. */
export const memoryItemScopes = memoryItemScopeSchema.options

/**
 * #2260.7 — L'OBJET VISÉ par un élément de mémoire : contact, besoin,
 * consultant ou mission. DISTINCT d'`accountId` juste au-dessus (#1918.1) :
 * `accountId` dit pour quel DOSSIER l'élément vaut (le compte auquel il est
 * ATTACHÉ) ; l'objet visé désigne une chose PRÉCISE à l'intérieur — ou
 * indépendante d'un dossier pour un consultant du vivier. Les deux voyagent
 * ensemble, ils ne répondent pas à la même question.
 *
 * Mesure du 17/09/2026 (`memory-item.ts:183` avant ce lot) : seul `accountId`
 * existait comme lien d'objet — aucun `contactId`, `needId`, `consultantId`,
 * `missionId`. Le lot précédent (#2260, chapitre LAU-FINAL-005) s'est arrêté
 * là par manque de budget.
 *
 * ⚠️ Enum LIVRÉ (GA-08) : une valeur s'ajoute EN FIN, jamais au milieu — la
 * contrainte SQL `memory_pinned_facts_object_single_check` (migration
 * `1795694318557`) la connaît avant ce code (GA-11 / GA-12) : elle ne porte
 * pas les VALEURS (ce ne sont pas des colonnes texte contraintes par un `IN`,
 * mais quatre colonnes `uuid` nullables — une par type), elle porte le fait
 * qu'AU PLUS UNE des quatre est renseignée à la fois.
 */
export const memoryItemObjectTypeSchema = z.enum(['contact', 'need', 'consultant', 'mission'])
export type MemoryItemObjectType = z.infer<typeof memoryItemObjectTypeSchema>

/**
 * Corps qui DÉSIGNE l'objet visé : le type ET son identifiant, TOUJOURS
 * ensemble — un seul objet à la fois, jamais quatre colonnes optionnelles
 * qu'un appelant pourrait remplir en silence (#2260.7). `id` est un uuid : les
 * quatre référentiels (`contacts`, `project_needs`, `consultants`, `missions`)
 * en émettent tous un, contrairement au fil (`conversationId`, une clé texte)
 * ou au périmètre CRM d'un fournisseur externe.
 */
export const memoryItemObjectInputSchema = z.object({
  type: memoryItemObjectTypeSchema,
  id: z.string().guid(),
})
export type MemoryItemObjectInput = z.infer<typeof memoryItemObjectInputSchema>

/**
 * L'objet visé tel que RENDU par l'API : le type, l'identifiant, et son NOM
 * résolu côté serveur — jamais le corps d'un message, jamais deviné (« le
 * CORPS des messages ne sort jamais », doctrine). `name: null` = l'identifiant
 * existe mais son nom n'a pas pu être résolu (objet hors de l'espace, ligne
 * disparue du référentiel) : l'écran le DIT plutôt que de taire le lien
 * (« une valeur absente ne s'affiche jamais 0 ni vide-muet »).
 */
export const memoryItemObjectRefSchema = z.object({
  type: memoryItemObjectTypeSchema,
  id: z.string(),
  name: z.string().nullable(),
})
export type MemoryItemObjectRef = z.infer<typeof memoryItemObjectRefSchema>

/**
 * #1918.2 / #1918.5 — CE QU'UN ÉCRAN A LE DROIT DE PROPOSER, ici et pas ailleurs.
 *
 * Deux portées sur quatre ne s'offrent QUE dans un contexte qui les rend
 * vraies, et c'est tout le sujet : une portée qu'on affiche sans pouvoir la
 * remplir est une promesse que rien ne tient.
 *
 * - « cette conversation » n'existe que DANS un fil. Réglages › Mémoire n'en
 *   est pas un — on n'y rattache pas après coup un élément à une conversation.
 * - un périmètre ne s'offre que si l'appelant en PORTE un, et il s'offre alors
 *   NOMMÉ, un choix par périmètre. « Mon équipe » sans désigner laquelle
 *   n'aurait aucune définition quand quelqu'un en porte deux.
 *
 * ⚠️ Le TÉMOIN de cette fonction, et la régression qu'elle empêche : sans
 * contexte, elle rend EXACTEMENT les deux portées d'avant, dans le même ordre.
 * Les écrans parcouraient `memoryItemScopes` ; un enum élargi y aurait fait
 * apparaître tout seul deux boutons radio impossibles à honorer.
 */
export type MemoryScopeOffer = {
  scope: MemoryItemScope
  /** Le périmètre visé — présent pour `business_unit`, et pour elle seule. */
  businessUnitId?: string
  /** Son nom, pour que l'écran l'AFFICHE au lieu d'un « mon équipe » générique. */
  businessUnitName?: string
  /**
   * Le fil visé — présent pour `conversation`, et pour elle seule. Il voyage
   * AVEC le choix : sans lui, l'écran devrait le retrouver ailleurs au moment
   * d'épingler, et c'est exactement le genre de seconde source qui diverge.
   */
  conversationId?: string
}

export function offerableMemoryScopes(context: {
  /** Le fil courant, quand l'écran est dans un fil. Vide / absent : aucun. */
  conversationId?: string | null
  /** Les périmètres que l'APPELANT porte (`business_unit_members`), déjà bornés
   *  à son espace par l'API. Vide ou absent : aucune portée d'équipe. */
  businessUnits?: readonly { id: string; name: string }[] | null
}): MemoryScopeOffer[] {
  const offers: MemoryScopeOffer[] = [{ scope: 'user' }, { scope: 'workspace' }]
  for (const unit of context.businessUnits ?? []) {
    offers.push({ scope: 'business_unit', businessUnitId: unit.id, businessUnitName: unit.name })
  }
  // #1918.5 — un fil vide n'est pas un fil : on n'offre pas une portée qui ne
  // désignerait rien, et que la contrainte SQL rejetterait.
  const thread = (context.conversationId ?? '').trim()
  if (thread) offers.push({ scope: 'conversation', conversationId: thread })
  return offers
}

/**
 * #1917.3 — LA PORTÉE PROPOSÉE PAR DÉFAUT au moment d'épingler. Décision de
 * Louis du 12/09/2026, écrite à UN seul endroit (GA-26) parce que trois écrans
 * épinglent (la carte de confirmation de Laura, la carte Mémoire, la barre) :
 *
 * - « moi » par défaut — un objectif ou une préférence personnelle ne devient
 *   pas une règle de toute l'ESN parce que personne n'a pensé à décocher ;
 * - « mon espace » pour la CORRECTION D'UN COMPTE — « le décideur de ce compte
 *   est Julie Martin » vaut pour quiconque travaille ce compte.
 *
 * Une correction SANS compte n'est pas « la correction d'un compte » : elle
 * retombe sur « moi ». Ce n'est qu'un DÉFAUT proposé — la personne choisit.
 */
export function defaultMemoryScope(input: {
  kind?: MemoryItemKind | null
  accountId?: string | null
}): MemoryItemScope {
  // #1962.5 — une « règle d'ESN » proposée « toi uniquement » ferait mentir son
  // étiquette : son nom dit déjà pour qui elle vaut. Reste un DÉFAUT.
  if (input.kind === 'workspace_rule') return 'workspace'
  return input.kind === 'correction' && input.accountId ? 'workspace' : 'user'
}

/**
 * Corps `POST /memory/facts`. Aucune identité dedans : le serveur estampille
 * `user_id` / `workspace_id` depuis le JWT et le workspace actif.
 *
 * `kind` / `origin` sont optionnels et retombent sur les défauts historiques —
 * un client qui ignore ces champs continue d'épingler un fait manuel.
 * `expiresAt` est un ISO 8601 ; `null` (ou absent) = pas d'échéance.
 *
 * `scope` (#1918.1) est optionnel pour la même raison : un onglet ouvert AVANT
 * le déploiement n'en envoie pas, et il épingle alors ce qu'il épinglait — un
 * élément partagé avec l'espace, ce que son écran lui promet. Les écrans neufs
 * l'envoient TOUJOURS, choisi à partir de {@link defaultMemoryScope}.
 * #1918.8 (13/09) — sauf une « Préférence » : sans portée, le serveur la garde
 * « Toi uniquement », le défaut que les écrans proposent.
 */
export const createMemoryItemSchema = z
  .object({
    fact: z.string().trim().min(1).max(2000),
    accountId: z.string().guid().nullable().optional(),
    kind: memoryItemKindSchema.optional(),
    origin: memoryItemOriginSchema.optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    scope: memoryItemScopeSchema.optional(),
    /**
     * #1918.5 — le fil visé, quand `scope = 'conversation'`. Un TEXTE, pas un
     * uuid : c'est la même clé que les autres mémoires de fil (`general`,
     * `account:<uuid>`, ou l'identifiant envoyé par l'écran de chat).
     */
    conversationId: z.string().trim().min(1).max(200).nullable().optional(),
    /** #1918.2 — le périmètre visé, quand `scope = 'business_unit'`. L'API
     *  vérifie que l'appelant en est MEMBRE : ce champ désigne, il n'autorise pas. */
    businessUnitId: z.string().guid().nullable().optional(),
    /**
     * #2260.7 — L'OBJET VISÉ : contact, besoin, consultant ou mission, à côté
     * d'`accountId` ci-dessus. `null` (ou absent) = aucun objet visé, le
     * comportement historique — aucun onglet ouvert avant ce lot n'en envoie.
     */
    object: memoryItemObjectInputSchema.nullable().optional(),
  })
  // #1918.2 / #1918.5 — une portée qui DÉSIGNE quelqu'un exige sa désignation.
  // La contrainte SQL dit la même chose (`1795204871293`) ; ici on la dit tôt,
  // pour qu'un client reçoive un 400 explicite plutôt qu'une erreur de base.
  .superRefine((value, ctx) => {
    if (value.scope === 'conversation' && !value.conversationId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conversationId'], message: 'conversation_id_required' })
    }
    if (value.scope === 'business_unit' && !value.businessUnitId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessUnitId'], message: 'business_unit_id_required' })
    }
  })
export type CreateMemoryItem = z.infer<typeof createMemoryItemSchema>

/**
 * #1916.21 — corps `PATCH /memory/facts/:id/scope`. La portée, et RIEN d'autre
 * (`strict`) : ce geste ne réécrit ni le texte ni la nature, et seul le
 * propriétaire de la ligne peut le faire (vérifié côté serveur, jamais ici).
 */
/**
 * #1918.2 / #1918.5 — LES PORTÉES QU'ON PEUT ENCORE DONNER à un élément déjà
 * épinglé : les deux DURABLES, et elles seules.
 *
 * `conversation` et `business_unit` DÉSIGNENT quelque chose que ce corps ne
 * porte pas — un fil, un périmètre. Les accepter ici reviendrait soit à
 * rattacher un élément à un fil où il n'a jamais été écrit, soit à violer la
 * contrainte SQL et rendre une erreur de base à l'écran. Le choix se fait à
 * l'épinglage, là où le contexte existe.
 */
export const MEMORY_ITEM_REASSIGNABLE_SCOPES = ['user', 'workspace'] as const satisfies readonly MemoryItemScope[]
export type MemoryItemReassignableScope = (typeof MEMORY_ITEM_REASSIGNABLE_SCOPES)[number]

export const updateMemoryItemScopeSchema = z.object({ scope: z.enum(MEMORY_ITEM_REASSIGNABLE_SCOPES) }).strict()
export type UpdateMemoryItemScope = z.infer<typeof updateMemoryItemScopeSchema>

/**
 * #1916.19 / #1916.22 — corps `PATCH /memory/facts/:id` : le TEXTE et/ou
 * l'ÉCHÉANCE, rien d'autre (`strict`). La portée a son propre geste, réservé au
 * propriétaire (#1916.21) ; la nature et l'origine disent ce que l'élément EST
 * et d'où il VIENT — les réécrire effacerait sa provenance.
 *
 * `expiresAt: null` RETIRE l'échéance. Un corps vide est refusé : un geste qui
 * ne change rien ne s'écrit pas, et ne laisse pas de ligne vide dans
 * l'historique. QUI peut modifier se vérifie côté serveur (l'auteur ; sur un
 * élément partagé, un manager aussi — la même règle que la suppression, #1918.7).
 */
export const updateMemoryItemSchema = z
  .object({
    fact: z.string().trim().min(1).max(2000).optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    /**
     * #1962.19 — CONFIRMER une note de Laura (`origin: 'copilot'`) sans en
     * réécrire le texte : un geste DÉDIÉ. Avant ce champ, la seule porte de
     * confirmation était la réécriture du texte (Q1, 13/09) — une note qu'on
     * veut confirmer TELLE QU'ELLE EST n'avait aucun geste. `true` seul : ce
     * corps ne sert jamais à RETIRER une confirmation (`false` est refusé).
     */
    confirm: z.literal(true).optional(),
  })
  .strict()
  .refine(body => body.fact !== undefined || body.expiresAt !== undefined || body.confirm !== undefined, {
    message: 'Rien à modifier : envoie le texte, l’échéance, la confirmation, ou plusieurs.',
  })

/**
 * #1916.16 — QUI a posé ou changé un élément : un PRÉNOM et un AVATAR, jamais
 * l'identifiant ni l'adresse e-mail. Résolu parmi les membres de l'espace LU
 * (un collègue d'une autre ESN ne traverse pas). `avatarUrl` est `null` sans
 * photo — l'écran montre alors des initiales, jamais une photo inventée.
 *
 * ⚠️ Une photo s'AFFICHE, elle ne classe rien : cette identité ne part dans
 * aucun prompt (doctrine « critères protégés »).
 */
export const memoryAuthorSchema = z.object({ firstName: z.string().min(1), avatarUrl: z.string().nullable() })
export type MemoryAuthor = z.infer<typeof memoryAuthorSchema>

/**
 * #1916.23 — les GESTES journalisés sur un élément (table `memory_fact_events`,
 * migration `1792800150613`). Trois, pas quatre : la CRÉATION se lit sur la
 * ligne elle-même (`created_at`, `user_id`), qui existe pour chaque élément — y
 * compris ceux épinglés avant la migration. La recopier dans le journal
 * donnerait deux dates de création, et aucune pour les anciens éléments.
 *
 * ⚠️ Enum LIVRÉ (GA-08) : une valeur s'ajoute EN FIN, et la contrainte SQL
 * `memory_fact_events_event_check` la connaît AVANT le code (GA-11 / GA-12).
 */
export const MEMORY_ITEM_EVENTS = ['text_changed', 'scope_changed', 'expiry_changed'] as const
export type MemoryItemEvent = (typeof MEMORY_ITEM_EVENTS)[number]

/**
 * Une entrée de l'historique. `created` est DÉRIVÉ de la ligne (voir
 * {@link MEMORY_ITEM_EVENTS}) ; `newValue` y porte le texte d'ORIGINE.
 * Pour une échéance, les valeurs sont des ISO 8601 (`null` = sans échéance) ;
 * pour une portée, `user` / `workspace`. `author: null` = auteur inconnu
 * (compte effacé, membre parti) — jamais un prénom deviné.
 */
export const memoryItemHistoryEntrySchema = z.object({
  event: z.enum(['created', ...MEMORY_ITEM_EVENTS]),
  at: z.string(),
  author: memoryAuthorSchema.nullable(),
  previousValue: z.string().nullable(),
  newValue: z.string().nullable(),
})
export type MemoryItemHistoryEntry = z.infer<typeof memoryItemHistoryEntrySchema>

/** Réponse `GET /memory/facts/:id/history` — de la création au dernier geste. */
export const memoryItemHistorySchema = z.object({ entries: z.array(memoryItemHistoryEntrySchema) })
export type MemoryItemHistory = z.infer<typeof memoryItemHistorySchema>

/**
 * Un élément de mémoire tel que renvoyé par l'API (jamais les `user_id` /
 * `workspace_id` internes — le scoping est une affaire serveur). Les éléments
 * EXPIRÉS ne sont pas renvoyés : la liste est ce que le copilote lit réellement.
 *
 * #1918.1 — `scope` dit pour qui il vaut ; `ownedByMe` dit si l'APPELANT en est
 * le propriétaire (donc s'il peut en changer la portée). Jamais l'identifiant du
 * propriétaire : un booléen calculé pour l'appelant suffit à l'écran.
 */
export const memoryItemSchema = z.object({
  id: z.string(),
  fact: z.string(),
  accountId: z.string().nullable(),
  kind: memoryItemKindSchema,
  origin: memoryItemOriginSchema,
  scope: memoryItemScopeSchema,
  /**
   * #1918.2 — le périmètre visé quand `scope = 'business_unit'`, `null` sinon.
   * L'identifiant seul : l'écran NOMME le périmètre depuis la liste qu'il a
   * déjà (`GET /business-units`), plutôt que de faire voyager deux fois un nom
   * qui vit ailleurs. Absent = API plus ancienne que ce champ.
   */
  businessUnitId: z.string().nullable().optional(),
  /**
   * #2260.7 — L'OBJET VISÉ, RÉSOLU : contact, besoin, consultant ou mission,
   * avec son nom. `null` = aucun objet visé (mesuré, pas deviné) ; absent =
   * API plus ancienne que ce champ, l'écran n'affiche alors rien plutôt qu'un
   * lien inventé.
   */
  object: memoryItemObjectRefSchema.nullable().optional(),
  ownedByMe: z.boolean(),
  /**
   * #1918.7 — l'APPELANT peut-il retirer cet élément ? Calculé par le serveur :
   * son auteur toujours ; un manager de l'espace (`owner` / `admin`) sur un
   * élément PARTAGÉ. L'écran n'affiche le geste que si `true` — le serveur
   * reste la vraie garde, et l'écran ne devine aucun rôle.
   */
  canForget: z.boolean(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  /**
   * Q1 (décision de Louis du 13/09) — quand une PERSONNE a confirmé cette note
   * de Laura en en réécrivant le texte. `null` = jamais confirmée ; absent =
   * API plus ancienne que ce champ (l'écran garde alors « à vérifier »).
   * L'origine n'est pas réécrite : la note reste « retenue d'une réponse de
   * Laura », et Laura la range avec les faits déclarés.
   */
  confirmedAt: z.string().nullable().optional(),
})
export type MemoryItem = z.infer<typeof memoryItemSchema>

/**
 * #1962 — le sous-ensemble d'un `MemoryItem` qui voyage jusqu'au CONTEXTE du
 * copilote (`ChatContextService` → service IA), pour que le prompt sache
 * distinguer une correction, un fait déclaré et une conclusion de Laura jamais
 * confirmée. Ni `id`, ni `accountId` brut, ni `expiresAt` : ce sont des
 * affaires de l'API et de l'écran de mémoire, pas du texte que le modèle lit.
 * Avant #1962, seul `fact` (une chaîne nue) faisait ce trajet ; `kind`/`origin`
 * s'y ajoutent, jamais un champ retiré : un appelant qui ne connaît pas encore
 * ce type continue de recevoir/envoyer ce qu'il envoyait.
 */
export type PinnedMemoryContextItem = Pick<MemoryItem, 'fact' | 'kind' | 'origin'> & {
  /**
   * Q1 (13/09) — `true` quand une personne a confirmé cette note de Laura : le
   * service IA la range alors avec les faits déclarés (`_format_memory`, seul
   * endroit où le rang se calcule). Posé SEULEMENT dans ce cas : un élément
   * non confirmé voyage exactement comme avant, et un service IA pas encore
   * redéployé ignore la clé (la note reste une note le temps de la fenêtre).
   */
  confirmed?: true
  /**
   * #3892.1 (ADD-SANOFI-06, retour bêta Sanofi 08/10/2026) — REVERSEMENT
   * ASSUMÉ du choix « ni accountId » ci-dessus, pour CE seul champ : un fait
   * borné à UN compte (BPCE) entrait, sans aucune étiquette, dans le prompt
   * d'un AUTRE compte (Sanofi) ou d'une conversation sans compte actif —
   * `listFacts` rend alors l'élément (comportement voulu, #1918.1), mais rien
   * ne disait plus qu'il venait d'ailleurs, et Laura le réutilisait comme une
   * règle générale de l'ESN. Le NOM, jamais l'UUID brut : résolu server-side
   * (`AccountsService.namesForAccounts`), pour que le modèle n'ait jamais à
   * deviner une entreprise depuis un identifiant. Absent = élément non borné
   * à un compte (règle générale, réutilisable partout — comportement
   * historique, inchangé) OU compte que la résolution n'a pas pu nommer :
   * dans les deux cas, jamais un nom inventé.
   */
  accountName?: string
}

/**
 * Un élément a-t-il cessé de valoir ? Sans échéance, jamais (le comportement
 * historique). Une échéance illisible n'expire rien non plus : on ne périme pas
 * un fait sur une date qu'on n'a pas su lire.
 */
export function isMemoryItemExpired(expiresAt: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!expiresAt) return false
  const ms = Date.parse(expiresAt)
  return Number.isFinite(ms) && ms <= nowMs
}
