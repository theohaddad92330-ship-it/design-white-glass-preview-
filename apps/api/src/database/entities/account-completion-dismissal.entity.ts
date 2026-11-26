import { Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * #4055.10 (18/10) — UNE PERSONNE DÉTECTÉE ÉCARTÉE sur « Complète ce compte », PAR PERSONNE ET PAR COMPTE.
 *
 * Écrite par le service IA (outil `dismiss_completion_person`), lue au rejeu de `complete_account` pour ne plus
 * reproposer. Une proposition RETENUE n'a pas besoin de ligne : le contact ajouté est en base, il sort déjà de
 * la proposition. `name_key` = nom sans casse ni accents ni blancs (`name_key` côté IA).
 *
 * `workspace_id` ET `user_id` sont deux colonnes de PORTÉE réelles : la table se classe `scoped` par déduction du
 * registre `table-scopes.ts` (GA-65), comme `similar_account_dismissals`.
 */
@Entity({ name: 'account_completion_dismissals' })
export class AccountCompletionDismissalEntity {
  @PrimaryColumn('uuid')
  workspace_id: string

  @PrimaryColumn('uuid')
  user_id: string

  @PrimaryColumn('uuid')
  account_id: string

  @PrimaryColumn('text')
  name_key: string

  @Column('text')
  full_name: string

  @Column({ type: 'timestamptz', default: () => 'now()' })
  dismissed_at: Date
}
