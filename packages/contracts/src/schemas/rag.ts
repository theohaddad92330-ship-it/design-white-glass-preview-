import { z } from 'zod'

/**
 * Le magasin de connaissance — catégories, origines, citation (tome 7 §36-41).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE TOUCHE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le tome nomme six choix comme justes, et ce module les laisse intacts : le
 * repli plein texte (le RAG marche sans pgvector configuré), la distillation
 * déterministe (« aucune donnée inventée », appliqué au RAG), le plafond de
 * 2 000 caractères, le reclassement à trois niveaux, l'alimentation
 * best-effort, et le périmètre par utilisateur.
 */

/**
 * Les catégories de la connaissance DISTILLÉE, dans l'ordre.
 *
 * ⚠️ Les trois premières sont historiques et restent EN TÊTE : l'ordre est
 * lisible par un humain dans les écrans de connaissance, et permuter deux
 * lignes ferait croire à un changement de priorité qui n'a pas eu lieu.
 *
 * ⚠️ Ce n'est PAS une contrainte de base. La colonne `category` porte déjà du
 * texte libre en production — `Notion` pour une page ingérée, `sales`, `Autre`
 * pour un dépôt manuel. La contraindre rejetterait des documents que des
 * clients ont déposés. C'est un CATALOGUE : ce que le produit sait produire
 * lui-même, pas la liste de tout ce qu'il accepte.
 */
export const RAG_CATEGORIES = [
  // Les trois historiques, en tête et dans leur ordre d'origine.
  'account_fact',
  'sector_insight',
  'winning_angle',
  // Les six qu'exigent les chantiers des tomes 1 à 5.
  'access_fact',
  'partner_fact',
  'territory_insight',
  'objection_answer',
  'client_proof',
  'esn_profile_fact',
] as const
export const ragCategorySchema = z.enum(RAG_CATEGORIES)
export type RagCategory = z.infer<typeof ragCategorySchema>

/**
 * D'où vient un document — un seul magasin, deux origines (M6).
 *
 * `distilled` : produit par une analyse, court, déterministe.
 * `uploaded` : déposé par l'ESN (méthode, trames, cas clients).
 *
 * La distinction sert à DEUX choses et à rien d'autre : la purge de M3 ne
 * touche jamais un document déposé par un humain, et l'écran de connaissance
 * peut dire d'où vient ce qu'il montre. Elle ne crée AUCUN second chemin
 * d'indexation — c'était tout l'intérêt de M6.
 */
export const RAG_ORIGINS = ['distilled', 'uploaded'] as const
export const ragOriginSchema = z.enum(RAG_ORIGINS)
export type RagOrigin = z.infer<typeof ragOriginSchema>

/**
 * #1954.7 — la PORTÉE d'un document RAG : qui peut le lire.
 *
 * Décision de Louis (12/09/2026), après le constat qu'une pièce jointe du chat
 * était ingérée EN SILENCE dans la base de connaissance DURABLE de tout
 * l'espace (`rag.controller.ts` → `useIngestRagDocument`, le même hook que
 * `/knowledge`), et que « retirer avant envoi » ne supprimait pas le document.
 *
 * `workspace` (défaut) : le document ancre l'analyse de toute l'équipe — le
 * comportement d'AVANT cette portée, celui de `/knowledge` et de toute analyse
 * de compte.
 *
 * `conversation` : un fichier joint au chat, lu SEULEMENT par le tour de chat
 * du FIL qui l'a déposé. Jamais listé dans `/knowledge`
 * (`RagService.listForWorkspace`), jamais dans le RAG d'une analyse de compte,
 * jamais dans un autre fil, jamais pour un autre espace. `conversationId` est
 * obligatoire quand `scope = 'conversation'` (contrainte SQL
 * `rag_documents_conversation_scope_requires_id_check`, migration
 * `1792800004817-RagDocumentConversationScope`).
 */
/*
 * #2779 — les trois portées manquantes de #1954 (« Mon espace personnel »,
 * « Un compte précis », « Base de connaissance durable »). Ajoutées EN QUEUE :
 * l'ordre des deux premières ne bouge pas, `workspace` reste le défaut.
 *
 * `personal` : lu SEULEMENT par son auteur (`user_id`), dans son espace — la
 * récupération d'un collègue ne le voit jamais, `/knowledge` ne le liste qu'à
 * son auteur.
 *
 * `account` : rattaché à UN compte (`account_id`, obligatoire — contrainte SQL
 * `rag_documents_account_scope_requires_id_check`). Il ne grounde QUE ce qui
 * porte ce compte-là (analyse du compte, fil de Laura sur le compte) : une
 * requête sur un autre compte, ou sans compte, ne le voit JAMAIS.
 *
 * `knowledge_base` : la base de connaissance DURABLE de l'ESN, lue comme
 * `workspace` par toute l'équipe. Jamais un défaut : « aucun document ne doit
 * rejoindre silencieusement la base de connaissance durable » (#1954) — il
 * n'y entre que sur ce choix explicite.
 *
 * Miroir Python : `RAG_DOCUMENT_SCOPES` (`apps/ia/app/services/rag_service.py`),
 * tenu par un test de parité côté IA. Contrainte SQL : `rag_documents_scope_check`
 * (migration `1796001543888-RagDocumentAccountScope`, élargie AVANT le code qui
 * écrit — GA-11/GA-12).
 */
export const RAG_DOCUMENT_SCOPES = ['workspace', 'conversation', 'personal', 'account', 'knowledge_base'] as const
export const ragDocumentScopeSchema = z.enum(RAG_DOCUMENT_SCOPES)
export type RagDocumentScope = z.infer<typeof ragDocumentScopeSchema>

/**
 * #3669.2 — où en est un document déposé : ce que Bellum en a RÉELLEMENT fait.
 * Cinq états, dans l'ordre d'une vie : `received` (reçu, pas encore lu),
 * `processing` (en cours de traitement), `usable` (exploitable), `partial`
 * (partiellement exploitable : une partie seulement a été lue), `to_fix`
 * (à corriger : rien d'exploitable, la cause se corrige à la source).
 * `NULL` en base = « non évalué » (documents d'avant la colonne, jamais
 * rétro-calculés en silence) : l'écran n'affiche alors AUCUNE ligne d'état —
 * jamais « exploitable » par défaut. Seul `usable` peut être annoncé comme
 * pleinement intégré. Contrainte SQL : `rag_documents_processing_status_check`
 * (migration `20261005211101`). Miroir Python : `RAG_PROCESSING_STATUSES`.
 */
export const RAG_PROCESSING_STATUSES = ['received', 'processing', 'usable', 'partial', 'to_fix'] as const
export const ragProcessingStatusSchema = z.enum(RAG_PROCESSING_STATUSES)
export type RagProcessingStatus = z.infer<typeof ragProcessingStatusSchema>

/** #3669.2 — seul `usable` s'annonce « intégré » ; tout autre état (ou l'absence
 *  d'évaluation) ne le dit jamais. */
export function isFullyIntegrated(status: RagProcessingStatus | null | undefined): boolean {
  return status === 'usable'
}

/**
 * #2779 — la CIBLE qu'une portée exige, et son absence nommée. Une seule
 * règle pour les trois portes d'écriture (dépôt unitaire, archive, changement
 * de portée) : `conversation` exige un fil, `account` exige un compte.
 * Retourne le champ manquant, `null` si rien ne manque.
 */
export function ragScopeMissingTarget(data: {
  scope?: RagDocumentScope | undefined
  conversationId?: string | undefined
  accountId?: string | undefined
}): 'conversationId' | 'accountId' | null {
  if (data.scope === 'conversation' && !data.conversationId) return 'conversationId'
  if (data.scope === 'account' && !data.accountId) return 'accountId'
  return null
}

/** Le `superRefine` partagé des trois portes — le message NOMME la cible. */
export function refineRagScopeTarget(
  data: { scope?: RagDocumentScope | undefined; conversationId?: string | undefined; accountId?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const missing = ragScopeMissingTarget(data)
  if (missing === 'conversationId') {
    ctx.addIssue({ code: 'custom', message: 'conversationId requis quand scope = conversation', path: [missing] })
  } else if (missing === 'accountId') {
    ctx.addIssue({ code: 'custom', message: 'accountId requis quand scope = account', path: [missing] })
  }
}

/** #2779 — l'identifiant d'un compte (`accounts.id`, un UUID). */
export const ragAccountIdSchema = z.string().guid()

/**
 * #1954.22 — CHANGER la portée d'un document déjà attaché (menu de la carte
 * de pièce jointe, `Chat.tsx`). Même forme et même garde que
 * `ragZipIngestInputSchema` (`rag-zip-ingest.ts`) : `conversation` sans
 * `conversationId` — et, depuis #2779, `account` sans `accountId` — est
 * refusé ICI, avant même d'atteindre le service, en 400 lisible plutôt qu'en
 * 500 sur la contrainte SQL.
 */
export const ragScopeUpdateInputSchema = z
  .object({
    scope: ragDocumentScopeSchema,
    conversationId: z.string().min(1).max(200).optional(),
    accountId: ragAccountIdSchema.optional(),
  })
  .strict()
  .superRefine(refineRagScopeTarget)
export type RagScopeUpdateInput = z.infer<typeof ragScopeUpdateInputSchema>

/**
 * #1954 — la catégorie sous laquelle le composeur de Laura dépose un fichier joint.
 *
 * Décision de Louis (12/09/2026) : les documents DÉJÀ ingérés depuis le chat,
 * avant la portée « fil seul », restent dans la base de l'ESN INCHANGÉS — et
 * « Connaissances » les MARQUE « jointe depuis le chat » en lisant cette valeur.
 * Un écrivain (le composeur), un lecteur (l'écran), un seul nom.
 */
export const CHAT_ATTACHMENT_CATEGORY = 'chat'

/**
 * L'âge au-delà duquel un document a perdu la moitié de son score (M1).
 *
 * Deux ans. `decay = min(0.5, âge_jours / 730)` : un document de deux ans vaut
 * la moitié d'un document d'aujourd'hui à pertinence égale, et **il ne
 * disparaît pas** — c'est la différence entre pondérer et filtrer. Un angle
 * gagnant de 2024 reste trouvable ; il cesse simplement de passer devant celui
 * d'hier.
 */
export const RAG_DECAY_HORIZON_DAYS = 730
/** Le plancher : au pire, un document garde la moitié de son score. */
export const RAG_MAX_DECAY = 0.5

/**
 * Le score d'un document, pondéré par son âge.
 *
 * Pure et testée des deux côtés du fil — c'est la formule du §38, et la seule
 * du chapitre qui change un classement.
 *
 * Une date absente ou illisible **ne pénalise pas** : l'absence de date n'est
 * pas une preuve d'ancienneté, et un document sans horodatage serait sinon
 * relégué pour un défaut d'écriture qui n'est pas le sien.
 */
export function decayedScore(similarity: number, ageDays: number | null | undefined): number {
  if (ageDays === null || ageDays === undefined || !Number.isFinite(ageDays) || ageDays < 0) return similarity
  const decay = Math.min(RAG_MAX_DECAY, ageDays / RAG_DECAY_HORIZON_DAYS)
  return similarity * (1 - decay)
}

/**
 * Une citation rendue avec une réponse construite sur le magasin (M5).
 *
 * Le titre voyage avec l'identifiant : sans lui, l'interface devrait relire le
 * document pour afficher un lien cliquable, c'est-à-dire faire une requête de
 * plus pour une information que la recherche avait déjà en main.
 */
export const ragCitationSchema = z.object({
  docId: z.string(),
  title: z.string(),
  category: z.string(),
  origin: ragOriginSchema,
})
export type RagCitation = z.infer<typeof ragCitationSchema>

/**
 * Combien de mois sans le moindre usage avant qu'un document distillé soit
 * purgeable (M3).
 *
 * La garde qui rend la purge acceptable n'est pas ce délai : c'est
 * `used_count > 0`. Un document qui a servi UNE fois n'est jamais purgé
 * automatiquement — il a prouvé sa valeur, et l'effacer parce qu'il n'a pas
 * reservi depuis un an détruirait la connaissance la plus rare.
 */
export const RAG_PURGE_AFTER_MONTHS = 12

export type RagPurgeCandidate = {
  id: string
  usedCount: number
  origin: RagOrigin
  ageDays: number | null
  /**
   * #2779 — la portée du document. `knowledge_base` a SA règle : elle ne part
   * jamais, quels que soient son origine, son usage ou son âge — c'est la base
   * DURABLE de l'ESN, jamais un défaut, jamais purgée en silence (#1954).
   * Optionnel : absent, un candidat se comporte comme avant cette règle, au
   * bit près (aucun appelant existant n'est touché par ce lot).
   */
  scope?: RagDocumentScope
}

/**
 * Ce qu'on a le droit d'effacer, et rien d'autre.
 *
 * Quatre refus, chacun contre une perte irréversible :
 * - un document de la base de connaissance DURABLE ne part jamais (#2779) —
 *   c'est le sens même de « durable » ;
 * - un document DÉJÀ UTILISÉ ne part jamais (la garde du §41) ;
 * - un document DÉPOSÉ par un humain ne part jamais — il n'a pas été produit
 *   par une analyse, personne ne peut le régénérer ;
 * - un document sans âge lisible ne part pas : on ne détruit pas sur un doute.
 */
export function ragPurgeable(candidates: readonly RagPurgeCandidate[]): string[] {
  const floor = RAG_PURGE_AFTER_MONTHS * 30
  return candidates
    .filter(doc => doc.scope !== 'knowledge_base')
    .filter(doc => doc.usedCount === 0 && doc.origin === 'distilled')
    .filter(doc => typeof doc.ageDays === 'number' && Number.isFinite(doc.ageDays) && doc.ageDays >= floor)
    .map(doc => doc.id)
}
