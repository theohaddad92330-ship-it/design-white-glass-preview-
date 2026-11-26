import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #1622 — UN JUGEMENT HUMAIN sur ce que la mémoire marché affirme d'un couple
 * ESN ↔ compte, dans le jeu de vérité terrain (20 comptes connus, 10 ESN
 * connues, 5-10 consultants réels — jugés à la main).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJOUT SEULEMENT — CETTE TABLE N'EST JAMAIS MISE À JOUR NI VIDÉE DE LIGNES
 * ─────────────────────────────────────────────────────────────────────────────
 * « On archive, on ne supprime pas » : un jugement révisé n'écrase pas le
 * précédent, il ajoute une ligne de plus avec un `judged_at` plus récent. Le
 * jugement COURANT d'un cas est la ligne la plus récente pour son `case_key` —
 * calculé en UN seul endroit (`MarketMemoryGroundTruthService`), jamais relu
 * directement par un `UPDATE`. Une correction humaine gagne toujours, quelle
 * que soit sa date : c'est exactement ce que « la plus récente l'emporte »
 * encode, sans jamais perdre la trace de ce qui a été jugé avant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PORTE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * · Aucun `workspace_id` — un jugement sur la QUALITÉ du corpus partagé de
 *   mémoire marché n'appartient à aucun espace client, exactement comme les
 *   cinq tables `market_*` elles-mêmes (GA-16).
 * · Aucune note libre — l'écran de jugement ne montre qu'un cas, la lecture
 *   qu'en fait la mémoire marché, et six boutons ; un champ de texte de plus
 *   serait une décision d'ergonomie que #1622 refuse explicitement.
 * · Aucune clé étrangère vers les tables `market_*` — un jugement porte sur ce
 *   que l'opérateur a VU au moment de juger (`had_reading` / `reading_rank` /
 *   `reading_persons` / `reading_certainty`, snapshotés), jamais une jointure
 *   live qui changerait de valeur après coup si le corpus est réimporté.
 *
 * ⚠️ Cette table n'est PAS l'une des cinq tables `market_*` protégées par
 * GA-258 (`MarketMemoryService` reste l'unique porte VERS elles) : elle
 * n'observe rien du marché, elle enregistre un AVIS humain sur ce que la
 * mémoire en a dit. `MarketMemoryGroundTruthService` ne lit jamais les cinq
 * tables directement non plus — il passe par le port
 * `MARKET_MEMORY_GROUND_TRUTH_READER` (voir `module-tokens.ts`), qui appelle
 * `MarketMemoryService.coverageFor`.
 */
@Entity({ name: 'market_memory_ground_truth_judgments' })
export class MarketMemoryGroundTruthJudgmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /**
   * La clé de regroupement d'UN cas — dérivée UNE fois, à l'écriture, par
   * `buildGroundTruthCaseKey` (`market-memory-ground-truth.service.ts`).
   *
   * ⚠️ Non unique À DESSEIN : plusieurs lignes partagent la même clé quand un
   * cas est jugé plusieurs fois (révision humaine) — c'est justement ce que
   * « on archive, on ne supprime pas » exige de pouvoir stocker.
   */
  @Index()
  @Column({ name: 'case_key', type: 'text' })
  caseKey!: string

  @Column({ name: 'account_name', type: 'text' })
  accountName!: string

  @Column({ name: 'account_website', type: 'text', nullable: true })
  accountWebsite!: string | null

  @Column({ name: 'account_country', type: 'text', nullable: true })
  accountCountry!: string | null

  @Column({ name: 'esn_name', type: 'text' })
  esnName!: string

  /**
   * La lecture que la mémoire marché faisait de ce cas AU MOMENT du jugement —
   * snapshotée, jamais recalculée après coup (#1622 §2a).
   */
  @Column({ name: 'had_reading', type: 'boolean' })
  hadReading!: boolean

  /** Rang 1-indexé dans les ESN observées pour ce compte, triées par nombre de
   *  personnes décroissant. `null` quand `had_reading` est faux. */
  @Column({ name: 'reading_rank', type: 'int', nullable: true })
  readingRank!: number | null

  @Column({ name: 'reading_persons', type: 'int', nullable: true })
  readingPersons!: number | null

  /** `forte` | `moyenne` | `faible` — même contrainte que
   *  `OBSERVED_CERTAINTIES` (`@bellum/contracts`), élargie AVANT le code qui
   *  écrit une nouvelle valeur (GA-11/GA-12) si cette échelle change un jour. */
  @Column({ name: 'reading_certainty', type: 'text', nullable: true })
  readingCertainty!: string | null

  /**
   * Le verdict humain — six valeurs FERMÉES
   * (`MARKET_MEMORY_GROUND_TRUTH_LABELS`, `@bellum/contracts`), dans l'ordre
   * exact posé par la contrainte `CHECK` de la migration. `unknown` EST un
   * jugement : il ne se confond jamais avec l'absence de ligne.
   */
  @Column({ type: 'text' })
  label!: string

  /**
   * QUI a jugé — donnée d'AUDIT légitime (on doit savoir qui a jugé quoi).
   *
   * ⚠️ Ne JAMAIS agréger par cette colonne dans un calcul de métrique :
   * l'analytique produit mesure le produit, jamais la personne. « Ce cas est
   * mal résolu » se dit ; « ce juge se trompe » ne se dit pas — voir la
   * doctrine `c64_analytique_produit`.
   */
  @Column({ name: 'judged_by', type: 'text' })
  judgedBy!: string

  @CreateDateColumn({ name: 'judged_at', type: 'timestamptz' })
  judgedAt!: Date
}
