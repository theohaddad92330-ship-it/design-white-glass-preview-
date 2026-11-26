import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Ce qu'UN fournisseur a coûté sur UNE action (D19).
 *
 * La granularité est volontairement fine — un run d'analyse écrit une ligne par
 * (fournisseur, opération) et par phase. Agréger à l'écriture ferait perdre la
 * seule question qui compte quand la facture monte : *lequel* a monté, et sur
 * *quelle* fonctionnalité. Voir la migration `1788500000000-ProviderCosts`.
 */
@Entity({ name: 'provider_costs' })
@Index('provider_costs_workspace_time_idx', ['workspace_id', 'created_at'])
export class ProviderCostEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid', { nullable: true })
  user_id: string | null

  @Column('uuid', { nullable: true })
  account_id: string | null

  /** Le run d'analyse, quand la consommation en vient. */
  @Column('uuid', { nullable: true })
  run_id: string | null

  /** La fonctionnalité qui a consommé : `analysis`, `enrichment`, `chat`, … */
  @Index()
  @Column('text')
  feature: string

  @Index()
  @Column('text')
  provider: string

  @Column('text')
  operation: string

  @Column('int', { default: 0 })
  calls: number

  /**
   * Pages, requêtes, tokens — l'unité que le fournisseur décompte.
   * #4452 — `numeric` : le service IA décompte des fractions (0,1666… page) ;
   * le driver pg rend une chaîne, le transformer la relit en nombre.
   */
  @Column('numeric', {
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string | null) => (v === null ? 0 : Number(v)) },
  })
  units: number

  /**
   * Coût en dollars. **NULL = fournisseur non tarifé** sur cet environnement,
   * ce qui ne veut PAS dire gratuit : les agrégats excluent ces lignes du total
   * et disent combien il en reste, plutôt que d'annoncer un coût sous-estimé.
   * `numeric` revient en `string` via le driver pg.
   */
  @Column('numeric', { nullable: true })
  cost_usd: string | null

  /**
   * `production` / `development` / `staging`… tel que lu sur le process au
   * moment de l'écriture (Défaut B, n6). **NULL = écrite avant cette colonne**
   * — « environnement inconnu », jamais `production` par défaut : lui poser un
   * défaut gonflerait rétroactivement le coût de production de tout
   * l'historique de développement. Voir la migration
   * `1790900000002-ProviderCostEnvironment`.
   */
  @Index()
  @Column('text', { nullable: true })
  environment: string | null

  /**
   * Détail LLM (#2440.6/.7/.8/.9/.16/.19) — NULL pour un fournisseur de données
   * (Firecrawl, Apollo…), qui n'a ni modèle ni jetons à déclarer. Voir la
   * migration `ProviderCostLlmDetail`.
   */
  @Column('text', { nullable: true })
  model: string | null

  @Column('int', { nullable: true })
  input_tokens: number | null

  @Column('int', { nullable: true })
  output_tokens: number | null

  @Column('int', { nullable: true })
  cache_read_tokens: number | null

  @Column('int', { nullable: true })
  cache_creation_tokens: number | null

  /** Fait immuable de CET appel (« ok » aujourd'hui) — jamais un statut de cycle de vie qui se mettrait à jour après coup. */
  @Column('text', { nullable: true })
  status: string | null

  /** La grille de prix qui a produit `cost_usd` — NULL si l'appel n'est pas tarifé. */
  @Column('text', { nullable: true })
  tariff_version: string | null

  /**
   * #2442.12 (épopée #2879) — l'outil de Laura qui a consommé. NULL = hors
   * outil (génération du tour, analyse) ou ligne d'avant la colonne — jamais
   * un outil deviné. Voir la migration `ProviderCostTool`.
   */
  @Column('text', { nullable: true })
  tool: string | null

  /**
   * #3717.7 / #3777 (DEC-4036 Q10) — le `x-correlation-id` de la requête ou du
   * job qui a consommé : le même que dans les journaux api/ia et Sentry. NULL =
   * ligne d'avant la colonne ou hors contexte — jamais inventé. Voir la
   * migration `ProviderCostCorrelation`.
   */
  @Column('text', { nullable: true })
  correlation_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
