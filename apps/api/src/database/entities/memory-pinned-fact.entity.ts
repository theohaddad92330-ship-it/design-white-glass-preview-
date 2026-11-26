import type { MemoryItemKind, MemoryItemOrigin, MemoryItemScope } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * A fact the user explicitly pinned to the copilot's durable memory ("long
 * memory", Théo P2). One row per fact, keyed by `workspace_id` (team read scope,
 * multi-user Phase 2) with `user_id` as created-by attribution. `account_id` is
 * optional: a fact can be global to the workspace (null) or scoped to one
 * account. RLS scopes rows to their owner (`auth.uid() = user_id`); the API
 * additionally scopes reads by workspace. Migration owned here (NestJS = owner
 * of métier tables).
 *
 * L'objet MemoryItem du rapport (restitution V2 §20) demande en plus la NATURE,
 * l'ORIGINE et l'EXPIRATION — `kind` / `origin` / `expires_at`, migration
 * `1788241633084`. Les défauts (`fact` / `manual` / pas d'échéance) décrivent
 * exactement ce que faisait un épinglage avant : aucune ligne existante ne
 * change de sens.
 */
@Entity({ name: 'memory_pinned_facts' })
@Index('memory_pinned_facts_scope_idx', ['workspace_id', 'account_id', 'created_at'])
export class MemoryPinnedFactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * Qui a épinglé ce fait (attribution created-by). La LECTURE, elle, ne
   * porte jamais sur cette colonne : `MemoryService.listFacts` — l'UNIQUE
   * lecture de la mémoire, carte « Mémoire » ET `ChatContextService.loadMemory`
   * — filtre par `workspace_id` seul (mémoire PARTAGÉE de l'espace, geste
   * délibéré vers l'équipe).
   *
   * `null` = compte supprimé (#1939, RGPD art. 17) :
   * `PrivacyDeletionService.anonymizeMemoryFacts` retire ce lien, JAMAIS le
   * TEXTE — vider `fact` ferait dire « [supprimé] » à un collègue qui lit
   * encore ce fait, et l'enverrait ainsi au modèle. Même geste que
   * `chat_messages` (fil partagé de l'espace) pour la même raison.
   *
   * Posée `NOT NULL` par `1784900700000-LongMemory`, relâchée par
   * `1792800032000-MemoryPinnedFactAuthorNullable` — AVANT le code qui écrit
   * `null` (GA-11/GA-12).
   */
  @Column('uuid', { nullable: true })
  user_id: string | null

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  @Column('text')
  fact: string

  /** fact | preference | correction — la nature de ce que le copilote retient. */
  @Column('text', { default: 'fact' })
  kind: MemoryItemKind

  /** manual | copilot | analysis — d'où vient cet élément de mémoire. */
  @Column('text', { default: 'manual' })
  origin: MemoryItemOrigin

  /**
   * #1918.1 — user | workspace : pour qui l'élément vaut. `user` = celui qui l'a
   * épinglé (`user_id`, le PROPRIÉTAIRE) et lui seul ; `workspace` = tout
   * l'espace. Défaut `workspace` = ce qu'était toute ligne avant la migration
   * `1792800070000` : aucune visibilité existante ne change.
   *
   * ⚠️ TOUTE lecture de cette table filtre `(scope = 'workspace' OR user_id =
   * <appelant>)` — `MemoryService` est la seule porte, et ses lectures prennent
   * l'appelant en paramètre obligatoire.
   */
  @Column('text', { default: 'workspace' })
  scope: MemoryItemScope

  /**
   * #1918.5 — LE FIL VISÉ quand `scope = 'conversation'`, `NULL` sinon
   * (contrainte `memory_pinned_facts_conversation_scope_requires_id_check`,
   * migration `1795204871293`).
   *
   * Un TEXTE, pas un uuid : c'est la MÊME clé que `conversation_summaries`
   * (`general`, `account:<uuid>`, ou l'identifiant envoyé par l'écran de chat),
   * dérivée par `conversationKey` — la seule façon qu'un fil supprimé emporte
   * d'un seul geste tout ce qu'il a fait retenir.
   */
  @Column('text', { nullable: true })
  conversation_id: string | null

  /**
   * #1918.2 — LE PÉRIMÈTRE VISÉ quand `scope = 'business_unit'`, `NULL` sinon.
   *
   * Pointe `business_units.id` (`1793710000000`). ⚠️ Ce n'est PAS un libellé
   * déclaratif recopié d'une réponse de questionnaire : une portée d'équipe qui
   * ne désigne pas un objet à membres ne filtrerait rien. Qui la VOIT se lit
   * dans `business_unit_members`, jamais dans `business_unit_access`.
   */
  @Column('uuid', { nullable: true })
  business_unit_id: string | null

  /**
   * #2260.7 — L'OBJET VISÉ, une colonne par type (migration `1795694318557`).
   * DISTINCT d'`account_id` ci-dessus : celle-ci dit pour quel DOSSIER
   * l'élément vaut, celles-ci désignent une chose PRÉCISE à l'intérieur — ou
   * indépendante d'un dossier pour un consultant du vivier.
   *
   * Au plus UNE des quatre est renseignée à la fois
   * (`memory_pinned_facts_object_single_check`, posée AVANT ce code — GA-11 /
   * GA-12). Aucune clé étrangère : la même convention que `account_id` et
   * `business_unit_id` ci-dessus, l'intégrité vit côté application
   * (`MemoryService`, qui résout et filtre par `workspace_id`).
   */
  @Column('uuid', { nullable: true })
  contact_id: string | null

  @Column('uuid', { nullable: true })
  need_id: string | null

  @Column('uuid', { nullable: true })
  consultant_id: string | null

  @Column('uuid', { nullable: true })
  mission_id: string | null

  /** Jusqu'à quand l'élément vaut. `null` = sans échéance (comportement
   *  historique) ; passé, il n'est plus injecté dans le contexte du copilote. */
  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  /**
   * Q1 (décision de Louis du 13/09) — quand une PERSONNE a confirmé une note de
   * Laura (`origin = 'copilot'`) en réécrivant son texte. `null` = jamais
   * confirmée. L'origine n'est pas réécrite : la note reste « retenue d'une
   * réponse de Laura », et Laura la range désormais avec les faits déclarés.
   * Migration `1792800151274`.
   */
  @Column('timestamptz', { nullable: true })
  confirmed_at: Date | null

  /** Qui l'a confirmée — le dernier à en avoir réécrit le texte. `null` après
   *  l'effacement de son compte : le nom part, la confirmation reste. */
  @Column('uuid', { nullable: true })
  confirmed_by: string | null

  /**
   * #2439.10 — QUAND CETTE MÉMOIRE A ÉTÉ OUBLIÉE. `null` = ligne vivante,
   * l'état de tout l'existant.
   *
   * « Oublier » un élément épinglé posait un DELETE SQL jusqu'au 21/09/2026 —
   * une dérogation à la doctrine du dépôt (« on archive, on ne supprime pas »)
   * qui ne se réclamait d'aucune exception. Même estampille, même nom et même
   * sémantique que `chat_messages.archived_at` (#2430.9) : un seul mécanisme
   * d'archivage (GA-26), migration `1795997101839`.
   *
   * ⚠️ TOUTE lecture de cette table l'exclut — `MemoryService.readVisibleFacts`
   * (écran ET contexte du modèle), `visibleFact`, `isVisibleToViewer`,
   * `findDuplicateFact`, `setFactScope`, `updateFact`, et la jointure de
   * `MemoryReplyUsesService.readForMessage` (où une ligne archivée compte
   * désormais comme « retirée depuis », exactement comme une ligne détruite).
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
