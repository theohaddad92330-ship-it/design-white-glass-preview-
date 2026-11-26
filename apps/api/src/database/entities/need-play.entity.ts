import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'
import type { NeedPlay } from '../../modules/accounts/need-play-guard'

/**
 * Un plan d'attaque généré pour UN besoin (décision Louis 31/07, D9 option A).
 *
 * Ce que le crédit achète : les besoins eux-mêmes viennent de `raw_analysis`,
 * déjà facturée — les refacturer serait vendre deux fois la même chose. La ligne
 * ici est la GÉNÉRATION, elle n'existait pas avant le clic.
 *
 * Unique par `(workspace_id, need_key)` : le plan appartient à l'ÉQUIPE. Trois
 * sièges ne paient pas trois fois le même besoin, et la relecture est gratuite.
 * Voir la migration `1788400000000-NeedPlays`.
 */
@Entity({ name: 'need_plays' })
@Unique('need_plays_workspace_key_unique', ['workspace_id', 'need_key'])
export class NeedPlayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  account_id: string

  /** Clé stable du besoin (voir `needKey`) — survit à une reformulation. */
  @Column('text')
  need_key: string

  /** Le besoin tel qu'il était au moment de la génération, pour l'affichage. */
  @Column('text')
  need_label: string

  /** Le plan, après passage du garde anti-invention. */
  @Column('jsonb')
  content: NeedPlay

  /** Qui a payé la génération — l'information sert au suivi des coûts, pas à
   *  restreindre la lecture (le plan est à l'équipe). */
  @Column('uuid')
  generated_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  generated_at: Date
}
