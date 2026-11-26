import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une ESN présente sur un compte : rang 1, rang 2, partenaire ou concurrent
 * (PDF 2 §4.1, décision D11).
 */
@Entity('account_partners')
@Index(['account_id'])
export class AccountPartnerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  account_id: string

  /** Le périmètre concerné, quand on le connaît. Le §2 R5 place le rang 1 sur
   *  l'ENTITÉ : on ne traite pas avec « EDF », on traite avec une DSI. */
  @Column('uuid', { nullable: true })
  entity_id: string | null

  @Column('text')
  name: string

  /** `rank1` | `rank2` | `unknown`. */
  @Column('text', { default: 'unknown' })
  rank: string

  /** `partner` | `competitor` | `unknown`. */
  @Column('text', { default: 'unknown' })
  relationship: string

  @Column('text', { nullable: true })
  note: string | null

  /** `declared` (quelqu'un l'a saisi) | `analysis` (le pipeline l'a détecté et
   *  personne ne l'a confirmé). L'écran fait la différence. */
  @Column('text', { default: 'declared' })
  source: string

  /** Combien de consultants on a déjà placés via ce partenaire. La seule preuve
   *  qu'une relation existe vraiment. */
  @Column('integer', { default: 0 })
  placements: number

  /** `forte` | `moyenne` | `faible`, ou `null` pour une ligne saisie à la main.
   *  NULL n'est pas « faible » : « personne n'a évalué » et « on a évalué et
   *  c'est douteux » sont deux affirmations différentes. */
  @Column('text', { nullable: true })
  certainty: string | null

  /** Le périmètre estimé chez ce client (« TMA SAP sur la DSI groupe »). */
  @Column('text', { nullable: true })
  scope: string | null

  /** Quand l'analyse l'a détectée. `null` sur une ligne déclarée à la main —
   *  jamais la date d'affichage, qui rajeunirait l'information à chaque lecture. */
  @Column('timestamptz', { nullable: true })
  detected_at: Date | null

  /** La pierre tombale du bouton « Ce n'est pas exact ».
   *
   *  Supprimer la ligne ne suffirait pas : le run suivant la recréerait, et la
   *  correction se perdrait à chaque analyse. Marquée écartée, elle survit —
   *  et l'écriture du pipeline sait ne pas y revenir. */
  @Column('timestamptz', { nullable: true })
  dismissed_at: Date | null

  @Column('text', { nullable: true })
  dismissed_reason: string | null

  /** #2298.7 — QUI a déclaré cette relation, quand `source = 'declared'`.
   *  Renseigné à l'écriture par `PartnersService.create` (`user.userId` du
   *  contrôleur), jamais deviné a posteriori. `null` sur toute ligne écrite
   *  par le pipeline (`source = 'analysis'`), et sur toute ligne déclarée
   *  AVANT cette migration — cette colonne n'a jamais existé sous aucun nom,
   *  et aucune trace ne permet de la reconstituer. L'écran dit alors « auteur
   *  inconnu (déclarée avant le `<created_at>`) », jamais un nom deviné. */
  @Column('uuid', { nullable: true })
  declared_by: string | null

  /** #2316.22-.27 — les cinq critères de qualification d'un rang 2. `null` =
   *  non mesuré, jamais `false` par défaut (voir la migration). */
  @Column('boolean', { nullable: true })
  rank2_scope_accessible: boolean | null

  @Column('boolean', { nullable: true })
  rank2_brief_precise: boolean | null

  @Column('boolean', { nullable: true })
  rank2_contact_accountable: boolean | null

  @Column('boolean', { nullable: true })
  rank2_economics_clear: boolean | null

  @Column('boolean', { nullable: true })
  rank2_next_steps_ready: boolean | null

  /** #3205.4 (épopée #3239) — le risque concurrentiel, nommé SÉPARÉMENT de
   *  `relationship` : une ESN `partner` sur ce compte peut porter un risque
   *  concurrentiel ailleurs dans le groupe, les deux ne se déduisent pas
   *  l'un de l'autre. `null` = non évalué, jamais un risque par défaut. */
  @Column('text', { nullable: true })
  competitive_risk: string | null

  /** #3205.4 — comment ce prestataire COMPLÈTE le périmètre déjà couvert
   *  (texte libre porté par un humain, jamais un score calculé). */
  @Column('text', { nullable: true })
  complementarity: string | null

  /** #3205.4 — quand REVÉRIFIER cette ligne. Jamais calculé : posé par un
   *  geste humain (`qualify`), comme `rank2_*` ci-dessus. */
  @Column('timestamptz', { nullable: true })
  next_verification_at: Date | null

  /** #3404.5 — le lien vers MA relation gouvernée avec cette ESN
   *  (`partner_relations.id`, module `partner-pipeline`, tome 4 D61). `null` =
   *  présence non rapprochée : le rapprochement par nom seul a été écarté
   *  (`partner-pipeline.service.ts`, docblock de `UNCOLLECTED_ON_PARTNER_RELATIONS`),
   *  ce lien se pose donc par un geste humain, jamais deviné. Pas de contrainte
   *  FK SQL : `account_partners` ne porte aucune clé étrangère (voir le reste de
   *  cette entité), et `partner_relations` appartient à un module qui doit
   *  rester retirable (règle #7) sans casser cette table. */
  @Column('uuid', { nullable: true })
  partner_relation_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
