import { z } from 'zod'
import { workspaceTeamMemberSchema } from './workspace.js'

/**
 * LA SORTIE D'UN UTILISATEUR — reprendre un portefeuille sans rien perdre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXIGENCE, CITÉE À LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tome 8 §33, « Les 6 angles morts que je vois encore », angle n°2 — et l'auteur
 * le désigne lui-même comme celui qu'il traiterait **en premier** :
 *
 * > « La sortie d'un utilisateur — quand quelqu'un quitte l'ESN, son
 * >   portefeuille, ses relations et sa mémoire Laura partent avec lui.
 * >   **Rien n'est prévu.** »
 * > « Le n°2 est celui que je traiterais en premier. Effort faible, et c'est un
 * >   moment de vérité : une ESN qui perd un commercial découvre à ce moment-là
 * >   si le produit a vraiment capturé le travail, ou s'il était dans la tête du
 * >   parti. »
 *
 * L'angle n°1 est son jumeau : « l'onboarding d'une équipe existante qui reprend
 * un portefeuille — un BM qui arrive hérite de 40 comptes qu'il ne connaît pas ».
 * Les deux sont le MÊME geste vu des deux bouts, et c'est celui-ci.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LIGNE — ce qui se transmet, ce qui ne se transmet PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois catégories, et les confondre est le seul vrai risque de ce chantier :
 *
 * 1. **CE QUI CHANGE DE MAIN** ({@link PORTFOLIO_HANDOVER_KINDS}) — le PORTAGE.
 *    Un compte, un contact, une tâche, une opportunité, un besoin, une mission
 *    ont un porteur nommé. Ce porteur est une AFFECTATION de l'entreprise, pas
 *    une propriété de la personne : il se réattribue.
 *
 * 2. **CE QUI NE BOUGE PAS PARCE QUE C'EST DÉJÀ À L'ESPACE** — ce qui a été
 *    APPRIS. Les angles d'attaque, les notes, l'historique, les faits d'accès,
 *    la mémoire épinglée de Laura sont lus par `workspace_id` ; `user_id` n'y
 *    est que l'attribution d'AUTEUR. Ils survivent au départ **sans qu'aucune
 *    ligne ne soit réécrite**, et c'est exactement pourquoi ils n'apparaissent
 *    pas dans la liste ci-dessus : un transfert qui les toucherait réécrirait
 *    l'auteur d'un fait, donc mentirait sur qui l'a appris.
 *
 * 3. **CE QUI RESTE PERSONNEL** ({@link PORTFOLIO_PERSONAL_KINDS}) — et ne se
 *    transmet à personne, jamais. **Une boîte mail est PERSONNELLE (D58)**, et
 *    **le corps des messages ne sort jamais vers un humain ni vers le modèle
 *    (D65)**. Donner la messagerie du partant à son successeur serait
 *    exactement l'inverse de ces deux arbitrages — pour un gain de confort.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON ARCHIVE, ON NE SUPPRIME PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une reprise de portefeuille n'efface rien : elle change un porteur. Le
 * membre sortant garde ses données personnelles, ses conversations et sa boîte ;
 * l'espace garde ce qu'il a appris. Aucun `DELETE` n'existe dans ce chemin.
 */

/**
 * Ce qui CHANGE de main, par nature d'objet.
 *
 * ⚠️ L'ordre est celui de l'écran, et un enum ne perd jamais de valeur ni n'en
 * insère au milieu (GA-08) : toute nature nouvelle s'AJOUTE à la fin.
 *
 * Chaque nature de cette liste porte deux propriétés, et les deux sont
 * obligatoires : une colonne de PORTEUR (`assigned_to` ou `owner_id`) **et** une
 * colonne `workspace_id`, sans laquelle l'écriture ne pourrait pas être bornée à
 * l'espace — un `UPDATE … WHERE owner = :from` sans le propriétaire est un
 * défaut d'isolation, pas un raccourci.
 *
 * `action_plan_items` (natures `actions` et `followups`, #4158.29) n'a pas de
 * colonne `workspace_id` : elle se rattache à un compte. Son écriture est donc
 * bornée PAR LE COMPTE (`account_id IN (comptes de l'espace)`) — jamais par le
 * seul porteur. Une garde dédiée dans la spec de doctrine le tient.
 */
// #4158.29 — `actions` (étapes de plan déléguées, encore ouvertes) et `followups` (relances de cadence
// ouvertes) arrivent EN FIN, comme le veut GA-08. Les deux se rattachent à un compte : leur écriture est
// bornée à l'espace par le compte (`accounts.workspace_id`), faute de colonne propre.
export const PORTFOLIO_HANDOVER_KINDS = [
  'accounts',
  'contacts',
  'tasks',
  'opportunities',
  'needs',
  'missions',
  'actions',
  'followups',
] as const
export const portfolioHandoverKindSchema = z.enum(PORTFOLIO_HANDOVER_KINDS)
export type PortfolioHandoverKind = z.infer<typeof portfolioHandoverKindSchema>

/**
 * Ce qui NE se transmet PAS, nommé.
 *
 * Le nommer est la moitié du travail : un administrateur qui transfère un
 * portefeuille doit savoir ce qu'il ne transfère pas, sinon il croit avoir tout
 * repris et découvre le trou trois semaines plus tard. La liste est rendue à
 * l'écran, traduite, à côté de ce qui change de main.
 */
export const PORTFOLIO_PERSONAL_KINDS = ['mailbox', 'calendar', 'copilotConversations', 'personalSettings'] as const
export const portfolioPersonalKindSchema = z.enum(PORTFOLIO_PERSONAL_KINDS)
export type PortfolioPersonalKind = z.infer<typeof portfolioPersonalKindSchema>

/**
 * Combien d'objets d'une nature, chez ce membre.
 *
 * ⚠️ `count` est NULLABLE, et c'est le cœur de la règle du dépôt : `null` = **on
 * n'a pas su compter**, `0` = **il n'y en a aucun**, qui est une mesure VRAIE.
 * Les écrire pareil ferait lire « ce membre ne porte rien, on peut le retirer
 * sans risque » à une requête tombée — sur le geste le plus irréversible de
 * l'écran Équipe. Question à se poser : _si cette valeur est absente, « 0 »
 * est-il VRAI ?_ Ici, non.
 */
export const portfolioHoldingSchema = z.object({
  kind: portfolioHandoverKindSchema,
  count: z.number().int().nonnegative().nullable(),
})
export type PortfolioHolding = z.infer<typeof portfolioHoldingSchema>

/**
 * Réponse de `GET /workspaces/members/:userId/portfolio` — la PRÉVISUALISATION.
 *
 * Elle existe pour une raison précise : le transfert est irréversible en un
 * clic, et un geste irréversible sans prévisualisation de ce qu'il déplace est
 * un piège. L'écran montre ce tableau AVANT de demander confirmation.
 */
export const memberPortfolioSchema = z.object({
  userId: z.string().guid(),
  email: z.string().email().nullable(),
  fullName: z.string().nullable(),
  /** Ce qui changerait de main, par nature. Une nature par entrée, toujours les
   *  mêmes, dans le même ordre — une nature absente serait indiscernable d'une
   *  nature à zéro. */
  holdings: z.array(portfolioHoldingSchema),
  /** Ce qui ne se transmet PAS. Nommé, jamais silencieux. */
  personal: z.array(portfolioPersonalKindSchema),
  /**
   * Les membres qui PEUVENT recevoir ce portefeuille — la règle est calculée
   * côté serveur et voyage, plutôt que d'être refaite par l'écran. Deux chemins
   * qui refont la même dérivation divergent (loi du dépôt) : ici, le second
   * chemin aurait proposé un lecteur seul comme successeur, et l'API l'aurait
   * refusé après le clic.
   */
  eligibleSuccessors: z.array(workspaceTeamMemberSchema),
})
export type MemberPortfolio = z.infer<typeof memberPortfolioSchema>

/** Corps de `POST /workspaces/members/:userId/handover`. */
export const handOverPortfolioSchema = z.object({
  /** Le successeur. Membre de l'espace, distinct du sortant, et porteur d'un
   *  portefeuille (un rôle en lecture seule ne peut pas en recevoir un). */
  toUserId: z.string().guid(),
})
export type HandOverPortfolio = z.infer<typeof handOverPortfolioSchema>

/**
 * Réponse de `POST /workspaces/members/:userId/handover` — ce qui a RÉELLEMENT
 * changé de main.
 *
 * Même discipline que la prévisualisation : `count: null` sur une nature dont
 * l'écriture n'a pas pu être comptée. Un transfert partiel se DIT — le taire
 * ferait croire l'opération complète, et personne ne repasserait derrière.
 */
export const portfolioHandoverResultSchema = z.object({
  fromUserId: z.string().guid(),
  toUserId: z.string().guid(),
  transferred: z.array(portfolioHoldingSchema),
})
export type PortfolioHandoverResult = z.infer<typeof portfolioHandoverResultSchema>

/**
 * #4158.29 — la répartition par LOTS.
 *
 * Un lot = une nature, un destinataire, et (optionnellement) une liste
 * d'identifiants. Sans `ids`, le lot prend TOUT ce que le partant porte encore
 * pour cette nature. Pour une nature donnée, soit un seul lot « tout », soit
 * plusieurs lots avec `ids` (jamais les deux) — vérifié côté serveur AVANT
 * toute écriture.
 *
 * `confirm: false` (défaut) = RÉCAPITULATIF : rien n'est écrit, on compte ce
 * qui bougerait, par nature et par destinataire. `confirm: true` = la
 * validation. Rien n'est supprimé, jamais.
 */
export const handoverAllocationSchema = z.object({
  toUserId: z.string().guid(),
  kind: portfolioHandoverKindSchema,
  ids: z.array(z.string().guid()).min(1).max(500).optional(),
})
export type HandoverAllocation = z.infer<typeof handoverAllocationSchema>

export const handoverPlanSchema = z.object({
  allocations: z.array(handoverAllocationSchema).min(1).max(50),
  confirm: z.boolean().default(false),
})
export type HandoverPlan = z.infer<typeof handoverPlanSchema>

export const handoverPlanLineSchema = z.object({
  kind: portfolioHandoverKindSchema,
  toUserId: z.string().guid(),
  /** `null` = on n'a pas su compter / écrire — jamais « 0 ». */
  count: z.number().int().nonnegative().nullable(),
})
export type HandoverPlanLine = z.infer<typeof handoverPlanLineSchema>

export const handoverPlanResultSchema = z.object({
  fromUserId: z.string().guid(),
  confirmed: z.boolean(),
  lines: z.array(handoverPlanLineSchema),
})
export type HandoverPlanResult = z.infer<typeof handoverPlanResultSchema>
