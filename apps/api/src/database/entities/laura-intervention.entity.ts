import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Une intervention proactive de Laura Produit, et ce que la personne en a fait.
 *
 * C'est la TRACE, jamais le catalogue : les trente interventions vivent dans le
 * code (`@bellum/contracts`), comme les workflows et les routines. Ici on garde
 * ce qui est réellement parti, sur quel écran, et la réaction — parce que les
 * deux mécaniques de retrait du §5.3 n'ont rien à compter sans elle.
 *
 * La nuance qui justifie deux colonnes plutôt qu'un booléen : `ignored` et
 * `closed_unread` ne disent pas la même chose. Ignorer, c'est ne pas répondre —
 * la personne était occupée. Fermer sans lire, c'est un geste, et un geste veut
 * dire « pas ça ». Les confondre ferait taire Laura sur quelqu'un qui n'a
 * simplement pas eu le temps.
 */
@Entity('laura_interventions')
@Index(['user_id', 'intervention_key', 'created_at'])
export class LauraInterventionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** La clé du catalogue. Une clé inconnue vient d'une trace ancienne : la
   *  lecture rend `null` plutôt que de lever. */
  @Column('text')
  intervention_key: string

  @Column('text')
  screen: string

  @Column('text')
  format: string

  @Column('int', { default: 0 })
  priority: number

  /**
   * #2403.32 — les clés ÉVINCÉES au moment de CETTE trace : `eligible()`
   * calcule plusieurs candidats, un seul devient `intervention_key`. Le §5.3
   * dit que les autres « restent dans Actions ou le centre de notifications » ;
   * cette colonne est ce qui leur permet d'y arriver un jour, sans que ce
   * service décide de rien de plus qu'aujourd'hui (D48).
   */
  @Column('text', { array: true, default: () => "'{}'" })
  suppressed_candidates: string[]

  /**
   * #2403.38 — la fiche que cette intervention concerne, quand elle en a une
   * (ex. `'account'` pour `ACCOUNT_HIRING_INTERVENTION_KEY`). `null` pour
   * l'immense majorité du catalogue, qui reste portée par sa seule phrase
   * statique — jamais une entité inventée. Migration `1796344210000`.
   */
  @Column('text', { nullable: true })
  entity_type: string | null

  /** `null` tant que `entity_type` l'est aussi. */
  @Column('uuid', { nullable: true })
  entity_id: string | null

  /** `null` tant que la personne n'a rien fait — ce qui n'est PAS « ignoré » :
   *  une intervention de ce matin n'a pas encore été ignorée. Le service ne
   *  requalifie en `ignored` qu'après le délai du §5.3. */
  @Column('text', { nullable: true })
  reaction: string | null

  @Column('timestamptz', { nullable: true })
  reacted_at: Date | null

  /**
   * #2439.10 — QUAND CETTE PERSONNE A OUBLIÉ CETTE TRACE (couche « refusals »
   * de l'écran Réglages › Mémoire de Laura). `null` = ligne vivante.
   *
   * L'oubli était un DELETE SQL jusqu'au 21/09/2026 : la ligne partait, et avec
   * elle la mesure d'acceptation de la surface. L'archivage garde donc la MÊME
   * portée de lecture qu'avant — `LauraService.recentTraces` (ce qui fait taire
   * Laura) comme `LauraAcceptanceService.bySurface` (le taux d'acceptation par
   * surface) excluent les lignes archivées, sans quoi une trace oubliée
   * continuerait de compter. Migration `1795997101839`.
   */
  @Column('timestamptz', { nullable: true })
  archived_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
