import { z } from 'zod'
import { outreachMessageChannelSchema } from './outreach-canonical.js'
import { memoryItemScopeSchema, type MemoryItemScope } from './memory-item.js'

/**
 * MÉMOIRE DE STYLE DES MESSAGES — épopée #2768 (LAU-FINAL-084, #2369).
 *
 * Le registre (`.claude/notes/registre-2026-09-20-chat-lot5.md`, section
 * #2369) classe les 14 demandes « reformulé » : aucune n'a d'existant. Ce
 * fichier livre l'objet TEMPLATE :
 *  - #2369.9  — objectif/canal/persona/statut/interdits/version/owner.
 *  - #2369.10 — son cycle de vie à cinq statuts (draft/validated/active/
 *               deprecated/archived), gardé par une machine pure.
 *  - #2369.6  — LOT j1 (26/09) : la mémoire à quatre niveaux avec priorité
 *               fixe, tranchée sans Louis « étendre `memory/` existant
 *               plutôt que nouveau modèle » (GA-26). `MemoryItemScope`
 *               (`memory-item.ts`) porte DÉJÀ quatre portées avec un ordre
 *               fixe (`user, workspace, business_unit, conversation`) : ce
 *               fichier les RÉUTILISE plutôt que d'inventer un second enum
 *               qui dirait la même chose autrement. Deux noms de l'épopée
 *               n'ont pas d'objet dédié dans le produit — « équipe » DÉSIGNE
 *               `business_unit` (le seul périmètre de travail nommé du
 *               dépôt, `business_unit_members`) ; « campagne » DÉSIGNE
 *               `conversation` (`c74_campagne_etiquette_mono_contact` a déjà
 *               fermé la porte à un objet Campagne séparé — une campagne EST
 *               le fil dans lequel elle se prépare, mono-contact).
 *
 * La proposition de règle (#2369.7/.8) et la garde d'apprentissage (#2369.13)
 * vivent dans `message-style-rule-proposal.ts` — un template n'a pas besoin
 * d'elles pour exister.
 *
 * Restent HORS de ce socle (#2369.1/.2/.3/.4/.5/.11/.12/.14) : les quinze
 * sources de style admises, l'import de messages pour apprentissage, l'analyse
 * préalable (patterns/ton/structure/risques), la restitution « je conserve /
 * je ne reproduis pas / je propose », la comparaison de versions avant
 * adoption, les métriques d'usage, et le NO-GO de #2369.14.
 */

/**
 * #2369.9 — le canal réutilise EXACTEMENT le vocabulaire de l'outreach
 * (`outreach-canonical.ts`) : un style se pratique sur les mêmes canaux qu'un
 * message, jamais un second enum qui dirait la même chose autrement (GA-26).
 */
export const messageStyleTemplateChannelSchema = outreachMessageChannelSchema
export type MessageStyleTemplateChannel = z.infer<typeof messageStyleTemplateChannelSchema>

/**
 * #2369.10 — LE CYCLE À CINQ STATUTS.
 *
 * `draft` (à l'essai) → `validated` (relu, pas encore utilisé) → `active`
 * (sert à écrire) → `deprecated` (ne sert plus, gardé pour référence) →
 * `archived` (fermé — « on archive, on ne supprime pas »). `archived` est
 * TERMINAL : un style retiré ne ressuscite pas en place, on en propose un
 * nouveau — un déprécié, lui, se réactive (`deprecated → active`), parce que
 * la dépréciation n'est qu'une mise en pause.
 *
 * ⚠️ Enum LIVRÉ (GA-08) : une valeur s'ajoute EN FIN, jamais au milieu.
 */
export const MESSAGE_STYLE_TEMPLATE_STATUSES = ['draft', 'validated', 'active', 'deprecated', 'archived'] as const
export const messageStyleTemplateStatusSchema = z.enum(MESSAGE_STYLE_TEMPLATE_STATUSES)
export type MessageStyleTemplateStatus = z.infer<typeof messageStyleTemplateStatusSchema>

/** #2369.9 — l'objet Template, ses sept attributs, + #2369.6 sa portée. */
export const messageStyleTemplateSchema = z.object({
  id: z.string().guid(),
  workspaceId: z.string().guid(),
  /** Owner : qui porte ce style — estampillé depuis le jeton, jamais depuis le corps. */
  ownerId: z.string().guid(),
  objective: z.string().trim().min(1).max(200),
  channel: messageStyleTemplateChannelSchema,
  persona: z.string().trim().min(1).max(200),
  status: messageStyleTemplateStatusSchema,
  /** Interdits : ce que ce style ne fait jamais (« jamais de prix », « jamais de superlatif »). */
  forbidden: z.array(z.string().trim().min(1).max(200)).max(20),
  /** Version strictement positive — jamais 0 (GA-18) : une valeur absente ne s'affiche jamais `0`. */
  version: z.number().int().positive(),
  /** #2369.6 — la portée, au sens de `MemoryItemScope` (`user, workspace,
   *  business_unit, conversation`). Défaut serveur `workspace` : le
   *  comportement historique (tout template posé avant ce lot reste visible
   *  à tout l'espace, rien ne change en silence). */
  scope: memoryItemScopeSchema,
  /** #2369.6 — le périmètre visé, quand `scope = 'business_unit'` (« équipe »). */
  businessUnitId: z.string().guid().nullable(),
  /** #2369.6 — le fil visé, quand `scope = 'conversation'` (« campagne » —
   *  `c74_campagne_etiquette_mono_contact` : pas d'objet Campagne séparé). */
  conversationId: z.string().trim().min(1).max(200).nullable(),
  /** #2947 (#2204.60) — le PITCH que ce style met en avant. `null` = non déclaré, jamais deviné. */
  pitch: z.string().trim().min(1).max(500).nullable(),
  /** #2947 (#2204.61) — le TON déclaré (tutoiement, formalité…). `null` = non déclaré. */
  tone: z.string().trim().min(1).max(200).nullable(),
  /** #2947 (#2204.63) — la SIGNATURE, recopiée telle quelle en fin de message. `null` = non déclarée. */
  signature: z.string().trim().min(1).max(500).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type MessageStyleTemplate = z.infer<typeof messageStyleTemplateSchema>

/**
 * Corps de création : ni `status` (naît `draft`), ni `version` (naît `1`), ni
 * `ownerId`/`workspaceId` (posés depuis le contexte serveur, jamais depuis le
 * corps) — un client qui les fournirait quand même verrait le champ IGNORÉ à
 * l'analyse (comportement Zod par défaut : les clés inconnues ne passent pas).
 *
 * `scope` est OPTIONNEL pour la même raison que `createMemoryItemSchema`
 * (#1918.1) : un appelant qui l'ignore continue de créer ce qu'il créait —
 * un style visible par tout l'espace. `businessUnitId`/`conversationId` ne
 * comptent que quand `scope` les désigne (`superRefine` ci-dessous, même
 * forme que `createMemoryItemSchema`).
 */
export const createMessageStyleTemplateSchema = z
  .object({
    objective: z.string().trim().min(1).max(200),
    channel: messageStyleTemplateChannelSchema,
    persona: z.string().trim().min(1).max(200),
    forbidden: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    scope: memoryItemScopeSchema.optional(),
    businessUnitId: z.string().guid().nullable().optional(),
    conversationId: z.string().trim().min(1).max(200).nullable().optional(),
    // #2947 (#2204.60/.61/.63) — optionnels : un appelant qui les ignore crée
    // ce qu'il créait (colonnes `NULL`, consigne de style byte-identique).
    pitch: z.string().trim().min(1).max(500).nullable().optional(),
    tone: z.string().trim().min(1).max(200).nullable().optional(),
    signature: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'business_unit' && !value.businessUnitId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['businessUnitId'], message: 'business_unit_id_required' })
    }
    if (value.scope === 'conversation' && !value.conversationId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conversationId'], message: 'conversation_id_required' })
    }
  })
export type CreateMessageStyleTemplate = z.infer<typeof createMessageStyleTemplateSchema>

const MESSAGE_STYLE_TEMPLATE_TRANSITIONS: Record<MessageStyleTemplateStatus, readonly MessageStyleTemplateStatus[]> = {
  draft: ['validated', 'archived'],
  validated: ['active', 'draft', 'archived'],
  active: ['deprecated', 'archived'],
  deprecated: ['active', 'archived'],
  archived: [],
}

export type MessageStyleTemplateTransitionCheck = { ok: true } | { ok: false; reason: 'unknown_state' | 'not_allowed' }

/** #2369.10 — la machine PURE ; le service l'applique, l'écran la lit, personne ne la redevine. */
export function checkMessageStyleTemplateTransition(
  from: MessageStyleTemplateStatus,
  to: MessageStyleTemplateStatus,
): MessageStyleTemplateTransitionCheck {
  const allowed = MESSAGE_STYLE_TEMPLATE_TRANSITIONS[from]
  if (!allowed) return { ok: false, reason: 'unknown_state' }
  if (!allowed.includes(to)) return { ok: false, reason: 'not_allowed' }
  return { ok: true }
}

/** Corps de `POST /message-style/templates/:id/transition` — #2369.10. */
export const transitionMessageStyleTemplateRequestSchema = z.object({ to: messageStyleTemplateStatusSchema })
export type TransitionMessageStyleTemplateRequest = z.infer<typeof transitionMessageStyleTemplateRequestSchema>

/**
 * #2204.65 — le « fil » d'un style, côté composer : la conversation avec UN contact. Une clé, un seul endroit
 * (GA-26) — le formulaire de création la pose en `conversationId`, l'API la recompose depuis le contact de la
 * génération pour résoudre le style du fil. Jamais envoyée par le navigateur : un client ne désigne pas le fil
 * d'un autre.
 */
export function messageStyleThreadKey(contactId: string): string {
  return `contact:${contactId}`
}

/**
 * #2369.6 — L'ORDRE FIXE, du plus spécifique au plus général : une « campagne »
 * (ce fil précis) l'emporte sur « moi » (tous mes fils), qui l'emporte sur
 * « mon équipe » (ce périmètre), qui l'emporte sur « tout l'espace » — le
 * défaut quand rien de plus précis ne s'applique. Cet ordre est un TABLEAU,
 * jamais recalculé ailleurs (GA-26) : {@link resolveMessageStyleTemplate} le
 * lit, personne ne le redevine.
 */
export const MESSAGE_STYLE_SCOPE_PRIORITY: readonly MemoryItemScope[] = [
  'conversation',
  'user',
  'business_unit',
  'workspace',
]

/** Le contexte d'écriture : QUI écrit, dans quel fil, pour quel périmètre. */
export type MessageStyleResolutionContext = {
  userId: string
  businessUnitId?: string | null
  conversationId?: string | null
}

/** Un template ne s'applique QUE si sa portée désigne bien ce contexte —
 *  jamais par déduction (« il n'a pas dit non » n'est pas « oui »). */
function messageStyleTemplateApplies(
  template: Pick<MessageStyleTemplate, 'scope' | 'ownerId' | 'businessUnitId' | 'conversationId'>,
  context: MessageStyleResolutionContext,
): boolean {
  switch (template.scope) {
    case 'workspace':
      return true
    case 'user':
      return template.ownerId === context.userId
    case 'business_unit':
      return !!context.businessUnitId && template.businessUnitId === context.businessUnitId
    case 'conversation':
      return !!context.conversationId && template.conversationId === context.conversationId
  }
}

/**
 * #2369.6 — LA RÉSOLUTION : parmi les templates `active` de CET objectif/canal
 * qui s'appliquent à ce contexte, celui de portée la plus spécifique gagne
 * (priorité FIXE, {@link MESSAGE_STYLE_SCOPE_PRIORITY}) — jamais le plus
 * récent, jamais le premier de la liste. `null` quand rien ne s'applique :
 * pas de style à imposer n'est pas une erreur.
 */
export function resolveMessageStyleTemplate(
  templates: readonly MessageStyleTemplate[],
  target: { objective: string; channel: MessageStyleTemplateChannel },
  context: MessageStyleResolutionContext,
): MessageStyleTemplate | null {
  const candidates = templates.filter(
    template =>
      template.status === 'active' &&
      template.objective === target.objective &&
      template.channel === target.channel &&
      messageStyleTemplateApplies(template, context),
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, candidate) =>
    MESSAGE_STYLE_SCOPE_PRIORITY.indexOf(candidate.scope) < MESSAGE_STYLE_SCOPE_PRIORITY.indexOf(best.scope)
      ? candidate
      : best,
  )
}

/**
 * #2369.11 (reste, épopée #2768) — LE NO-GO PROLONGÉ : « Laura affirme avoir
 * appris le style » ne suffit plus une fois {@link resolveMessageStyleTemplate}
 * livré (#2369.6) — encore faut-il pouvoir comparer ce que CHAQUE couche
 * produirait, avant de savoir laquelle gagne. Quatre couches, dans l'ordre où
 * l'écran les montre :
 *
 *  - `generic`  — aucune contrainte de style : la colonne de référence.
 *  - `workspace` — le template `active` de portée `workspace`, s'il existe.
 *  - `user`     — le template `active` de portée `user` DE CET utilisateur, s'il existe.
 *  - `final`    — celui que {@link resolveMessageStyleTemplate} retiendrait
 *    RÉELLEMENT pour ce contexte (peut être `workspace`, `user`, un autre
 *    périmètre non affiché isolément — équipe/campagne —, ou `null`).
 *
 * Une couche sans template ne DEVIENT pas `generic` par défaut (GA-18/19 :
 * une absence ne s'affiche jamais comme une valeur) — l'appelant (le service)
 * décide s'il appelle quand même l'IA pour cette couche ou affiche « non
 * configuré à ce niveau » sans dépense.
 */
export const MESSAGE_STYLE_PREVIEW_LAYERS = ['generic', 'workspace', 'user', 'final'] as const
export const messageStylePreviewLayerSchema = z.enum(MESSAGE_STYLE_PREVIEW_LAYERS)
export type MessageStylePreviewLayer = z.infer<typeof messageStylePreviewLayerSchema>

export type MessageStyleLayerResolution = {
  layer: MessageStylePreviewLayer
  template: MessageStyleTemplate | null
}

/** #2369.11 — le calcul PUR des quatre couches ; le service décide ensuite qui appeler. */
export function compareMessageStyleLayers(
  templates: readonly MessageStyleTemplate[],
  target: { objective: string; channel: MessageStyleTemplateChannel },
  context: MessageStyleResolutionContext,
): readonly MessageStyleLayerResolution[] {
  const matching = templates.filter(
    template =>
      template.status === 'active' && template.objective === target.objective && template.channel === target.channel,
  )
  const workspace = matching.find(template => template.scope === 'workspace') ?? null
  const user = matching.find(template => template.scope === 'user' && template.ownerId === context.userId) ?? null
  const final = resolveMessageStyleTemplate(matching, target, context)
  return [
    { layer: 'generic', template: null },
    { layer: 'workspace', template: workspace },
    { layer: 'user', template: user },
    { layer: 'final', template: final },
  ]
}

/** Corps de `POST /message-style/templates/preview-compare` — #2369.11. */
export const messageStylePreviewCompareRequestSchema = z.object({
  objective: z.string().trim().min(1).max(200),
  channel: messageStyleTemplateChannelSchema,
  contactId: z.string().guid(),
  /** L'angle libre du commercial, comme dans le composer (`GenerateMessageDto.context`). */
  context: z.string().trim().max(2000).optional(),
})
export type MessageStylePreviewCompareRequest = z.infer<typeof messageStylePreviewCompareRequestSchema>

/**
 * Une ligne du résultat. `generic` a toujours `templateId: null` mais un
 * `text` généré (la colonne de référence, sans contrainte de style). Pour
 * `workspace`/`user`/`final`, `templateId: null` ET `text: null` ensemble —
 * une couche sans template configuré n'appelle jamais l'IA (GA-18/19 : on ne
 * devine pas un message pour une couche qui n'existe pas).
 */
export const messageStylePreviewResultSchema = z.object({
  layer: messageStylePreviewLayerSchema,
  templateId: z.string().guid().nullable(),
  text: z.string().nullable(),
})
export type MessageStylePreviewResult = z.infer<typeof messageStylePreviewResultSchema>

/**
 * #2369.12 (reste, épopée #2768) — LES QUATRE TAUX, PAR STYLE, JAMAIS PAR
 * PERSONNE (GA-240/241). `sampleSize` à zéro n'arrive jamais en pratique (un
 * groupe naît d'au moins un message), mais un taux reste `null` — jamais `0`
 * — dès que son dénominateur l'est (GA-18/19) : ce test existe pour que
 * `computeMessageStyleUsageStats` ne l'oublie pas si un appelant futur passe
 * un groupe vide.
 */
export type MessageStyleUsageCounts = {
  templateId: string
  templateVersion: number
  total: number
  modified: number
  validated: number
  responded: number
  unsubscribed: number
}

export const messageStyleUsageStatsSchema = z.object({
  templateId: z.string().guid(),
  templateVersion: z.number().int().positive(),
  sampleSize: z.number().int().nonnegative(),
  modificationRate: z.number().min(0).max(1).nullable(),
  validationRate: z.number().min(0).max(1).nullable(),
  responseRate: z.number().min(0).max(1).nullable(),
  unsubscribeRate: z.number().min(0).max(1).nullable(),
})
export type MessageStyleUsageStats = z.infer<typeof messageStyleUsageStatsSchema>

/** #2369.12 — le calcul PUR : un dénominateur de zéro sort le taux du calcul, il ne devient jamais 0. */
export function computeMessageStyleUsageStats(counts: MessageStyleUsageCounts): MessageStyleUsageStats {
  const rate = (numerator: number): number | null => (counts.total > 0 ? numerator / counts.total : null)
  return {
    templateId: counts.templateId,
    templateVersion: counts.templateVersion,
    sampleSize: counts.total,
    modificationRate: rate(counts.modified),
    validationRate: rate(counts.validated),
    responseRate: rate(counts.responded),
    unsubscribeRate: rate(counts.unsubscribed),
  }
}
