import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2127.37 — UNE SUGGESTION « COMPTE SIMILAIRE » MASQUÉE, PAR PERSONNE.
 *
 * QCM de Louis du 15/09/2026 : « Masquer cette suggestion » PERSISTANT et PAR
 * PERSONNE (table + migration, archive jamais suppression) — distinct de
 * `UserFavoriteEntity` (qui est aussi personnel) parce qu'ici la ligne se
 * rattache à un COUPLE (compte de référence, entreprise suggérée), jamais à
 * une seule entité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `dismissed_at` NULLABLE PLUTÔT QU'UNE LIGNE PAR ÉVÉNEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Même patron que `AccountPartnerEntity.dismissed_at` (le bouton « Ce n'est pas
 * exact ») : une suggestion masquée SE RETROUVE ET SE DÉMASQUE (doctrine « on
 * archive, on ne supprime pas »). La ligne n'est jamais supprimée — seul
 * `dismissed_at` bascule entre une date et `NULL`. Une correction humaine
 * (démasquer) gagne toujours, quelle que soit sa date : un recalcul des
 * suggestions ne fait jamais revenir ce que la personne a masqué, parce que le
 * filtre lit cette table à CHAQUE réponse, jamais une fois pour toutes.
 *
 * `candidate_siren` — pas un uuid — parce qu'une suggestion n'est PAS une ligne
 * de la base : elle est recalculée à chaque appel depuis le registre (Pappers).
 * Le SIREN est son identité stable, la même clé que `id` de
 * `SimilarAccountSuggestion` (#1632 : « l'identité d'une entreprise est son
 * SIREN, le nom n'en est qu'une étiquette »).
 *
 * `workspace_id` ET `user_id` sont deux colonnes de PORTÉE réelles (pas
 * `owner_user_id`/`created_by`) : la table se classe `scoped` par déduction du
 * registre `table-scopes.ts` (GA-65) sans rien à y écrire.
 */
@Entity({ name: 'similar_account_dismissals' })
export class SimilarAccountDismissalEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @PrimaryColumn('uuid')
  user_id: string

  /** Le compte de référence — le dossier où la carte « comptes similaires » était ouverte. */
  @PrimaryColumn('uuid')
  account_id: string

  @PrimaryColumn('text')
  candidate_siren: string

  /** `NULL` = visible. Une date = masquée depuis cette date. Jamais supprimée. */
  @Column({ type: 'timestamptz', nullable: true })
  dismissed_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
