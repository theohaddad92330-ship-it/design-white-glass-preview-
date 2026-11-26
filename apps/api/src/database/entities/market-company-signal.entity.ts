import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * L'agrégat par ENTREPRISE de la mémoire marché — PARTAGÉ entre tous les espaces.
 *
 * ⚠️ Pas de `workspace_id`, et ce n'est pas un oubli (GA-16, déclaré dans
 * `table-scopes.ts`) : ce que cette table porte est un fait de MARCHÉ, identique
 * pour tous les clients. Ce qu'un espace pense d'un compte — sa relation, ses
 * faits d'accès, ses corrections — vit dans `accounts` et `access_facts`, qui
 * sont scopées. Une correction d'espace PRIME sur l'observation partagée, et ne
 * la réécrit jamais : on ne modifie pas une mémoire commune depuis un seul espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA TABLE NE PORTE PAS, EXPRÈS
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Aucune identité de personne.** Que des comptages. Le fichier d'identités
 *   et de coordonnées livré avec le corpus est resté DEHORS de l'import — base
 *   légale de la collecte, information des personnes et finalité n'ont pas été
 *   tranchées, et aucun usage produit n'en a besoin.
 * · **Aucune date exposable.** `corpus_label` existe pour l'AUDIT et rien
 *   d'autre : aucune lecture produit ne la rend. Une date de corpus n'apporte
 *   rien à l'utilisateur et fait douter d'un signal qui est frais.
 * · **Aucun `account_id`.** Le rattachement à un compte de portefeuille se fait
 *   à la LECTURE, par clé d'entreprise résolue. Écrire l'identifiant ici
 *   créerait un second chemin d'écriture vers `accounts` — et l'invariant du
 *   dépôt est qu'aucun account n'est créé ni fusionné par un import de marché.
 * · **Aucun secteur/NAF, aucun département, aucune « famille de compétences »
 *   distincte de `role_families`** (#2287.4/.7/.11, épopée #2991 — DOCTRINE
 *   écrite et datée le 27/09/2026, après cinq vérifications indépendantes du
 *   corpus source les 25/09, 26/09 ×2 et 27/09, toutes concordantes). Colonnes
 *   RÉELLEMENT lues à l'ingestion (`market-memory-import.ts`) : `cle, nom,
 *   site_web, est_esn, freelances_*, score_externalisation, familles_de_roles,
 *   tranche_effectif, effectif_min/max, ville, region, pays, esn_observees,
 *   technos_observees, anciens_esn_presents`. Aucune des trois ne s'y trouve,
 *   ni sous ce nom ni sous un nom dérivable sans deviner : pas de code postal
 *   à décomposer en département (seuls `city`/`region`/`country`, du texte
 *   libre, sont ici), pas de code NAF, et `familles_de_roles` est déjà exposé
 *   sous son propre nom (`role_family`, #2287.12) — une « famille de
 *   compétences » en est distincte et n'a pas de colonne à elle. Les ajouter
 *   inventerait la valeur qu'elles filtrent (`agent_docs/doctrine.md` —
 *   jamais de donnée fictive) : `02_entreprises.csv` est un corpus PARTAGÉ en
 *   LECTURE SEULE (60k lignes), sans chemin de saisie manuelle par ligne dans
 *   le produit. Rouvrir ce chantier suppose une nouvelle SOURCE d'ingestion,
 *   jamais un branchement sur une donnée déjà là.
 * · **28/09/2026 — la piste « joindre une donnée déjà en base » a été
 *   vérifiée et écartée, pas ignorée.** Décision Louis du jour : toute
 *   ingestion part de données DÉJÀ collectées, sans nouveau fournisseur.
 *   `accounts.sector`/`accounts.naf_code` existent bien (Registry NAF/APE,
 *   Phase 1) — mais `accounts` est SCOPÉ ESPACE, et cette table est PARTAGÉE :
 *   y écrire un secteur d'espace romprait l'invariant juste au-dessus
 *   (« une correction d'espace […] ne modifie pas une mémoire commune depuis
 *   un seul espace »). `esn_directory.naf_code`/`.headquarters_department`
 *   existent aussi et SONT partagés (pas de conflit d'espace) — mais ne
 *   couvrent que les entreprises qui SONT des ESN, une fraction du corpus, pas
 *   la dimension générale demandée par #2287.4/.7, sur une clé de
 *   rapprochement distincte de celle, déjà fragile, de
 *   `market-company-resolution.ts`. Gardé par
 *   `market-memory-search.spec.ts` (« ne porte, et ne pourra jamais porter,
 *   de colonne SCOPÉE ESPACE »).
 *
 * `externalization_score` est NULLABLE et l'est vraiment : le corpus ne note pas
 * une entreprise sur moins de trois observations. `0` y serait faux — ce serait
 * affirmer qu'on a mesuré et trouvé zéro.
 */
@Entity({ name: 'market_company_signal' })
export class MarketCompanySignalEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  /** Clé d'entreprise normalisée — la jointure de tout le corpus. */
  @Index({ unique: true })
  @Column({ name: 'company_key', type: 'text' })
  companyKey!: string

  /** Le nom tel qu'il est écrit le plus souvent dans le corpus. */
  @Column({ name: 'company_name', type: 'text' })
  companyName!: string

  /** Vrai quand l'entreprise est elle-même une société de services. */
  @Column({ name: 'is_service_company', type: 'boolean', default: false })
  isServiceCompany!: boolean

  /** Parcours distincts observés vers cette entreprise, tous slots confondus. */
  @Column({ name: 'paths_total', type: 'int', default: 0 })
  pathsTotal!: number

  @Column({ name: 'paths_current', type: 'int', default: 0 })
  pathsCurrent!: number

  @Column({ name: 'paths_past', type: 'int', default: 0 })
  pathsPast!: number

  /** 0-100. `null` sous le seuil du corpus — jamais `0`. */
  @Column({ name: 'externalization_score', type: 'numeric', nullable: true })
  externalizationScore!: string | null

  /** `[{ family, persons }]` — les familles de rôles les plus fréquentes. */
  @Column({ name: 'role_families', type: 'jsonb', default: () => "'[]'::jsonb" })
  roleFamilies!: ReadonlyArray<{ family: string; persons: number }>

  @Column({ name: 'headcount_bracket', type: 'text', nullable: true })
  headcountBracket!: string | null

  @Column({ name: 'headcount_min', type: 'int', nullable: true })
  headcountMin!: number | null

  @Column({ name: 'headcount_max', type: 'int', nullable: true })
  headcountMax!: number | null

  @Column({ type: 'text', nullable: true })
  city!: string | null

  @Column({ type: 'text', nullable: true })
  region!: string | null

  @Column({ type: 'text', nullable: true })
  country!: string | null

  @Column({ type: 'text', nullable: true })
  website!: string | null

  /**
   * Le domaine RACINE du site, dérivé à l'import — le rapprochement FORT.
   *
   * La doctrine du dépôt interdit de rattacher deux entreprises par leur nom
   * seul : « Orange » désigne trois sociétés, et un mauvais rattachement colle
   * la mémoire d'un compte sur un autre — pire que pas de mémoire du tout. Le
   * domaine tranche là où le nom hésite. `null` quand le corpus n'a pas de site.
   */
  @Index()
  @Column({ name: 'website_domain', type: 'text', nullable: true })
  websiteDomain!: string | null

  /**
   * Le nom passé par NOTRE normalisation — le rapprochement FAIBLE, de repli.
   *
   * ⚠️ Distinct de `company_key`, qui est la clé du CORPUS et sert à joindre ses
   * fichiers entre eux. Réutiliser `company_key` pour se rapprocher d'un compte
   * Bellum reviendrait à faire confiance à une normalisation qu'on n'a pas
   * écrite et dont on ne connaît pas les règles (elle supprime certains mots
   * outils, pas tous). Deux normalisations différentes ne se rencontrent jamais.
   */
  @Index()
  @Column({ name: 'match_key', type: 'text' })
  matchKey!: string

  /** Nombre de sociétés de services distinctes observées autour de ce compte. */
  @Column({ name: 'esn_observed_count', type: 'int', default: 0 })
  esnObservedCount!: number

  /** Nombre de technologies distinctes citées par au moins deux parcours. */
  @Column({ name: 'technos_observed_count', type: 'int', default: 0 })
  technosObservedCount!: number

  /** Personnes passées par une société de services et aujourd'hui chez ce compte. */
  @Column({ name: 'ex_esn_present', type: 'int', default: 0 })
  exEsnPresent!: number

  /**
   * Ratio parcours passés / total. `null` sous le volume où il veut dire quelque
   * chose. Il se LIT « rotation forte » / « fidélisation », jamais en durée
   * chiffrée : le corpus n'a pas de dates, et inventer « missions de 6 mois »
   * serait une donnée fabriquée.
   */
  @Column({ name: 'rotation_ratio', type: 'numeric', nullable: true })
  rotationRatio!: string | null

  /**
   * Vrai quand l'entreprise avait des parcours passés et aucun en cours — signal
   * de fermeture ou d'internalisation. ⚠️ Ne se rend JAMAIS « n'externalise
   * pas » : c'est un changement observé, pas une politique d'achat connue.
   */
  @Column({ name: 'has_ceased', type: 'boolean', default: false })
  hasCeased!: boolean

  /** Parcours passés par trois clients ou plus — des portes multiples. */
  @Column({ name: 'connector_count', type: 'int', default: 0 })
  connectorCount!: number

  /**
   * L'étiquette du corpus d'origine — POUR L'AUDIT SEULEMENT.
   * Aucune lecture produit ne la rend, et aucune n'a le droit de la rendre.
   */
  @Column({ name: 'corpus_label', type: 'text' })
  corpusLabel!: string

  /**
   * #1615/#1616 — PROVENANCE DU PACK, ajoutée par
   * `1791940000000-MarketMemoryVersioning`. NULLABLE : les lignes déjà en base
   * avant cette migration n'en portent aucune, et ça se lit « pack d'origine
   * inconnu », jamais une valeur inventée. Aucune de ces cinq colonnes ne sort
   * d'une lecture produit — même statut que `corpus_label`.
   */
  @Column({ name: 'dataset_version', type: 'text', nullable: true })
  datasetVersion!: string | null

  /** Sha256 hex de `02_entreprises.csv` — le fichier ANCRE de cette ligne. Les
   *  trois fichiers de complétion (rotation/cessation/connecteurs) ne sont pas
   *  repris ici : voir le commentaire de `ingest-market-memory.ts`. */
  @Column({ name: 'source_checksum', type: 'text', nullable: true })
  sourceChecksum!: string | null

  /**
   * Période COUVERTE par le corpus (`YYYY-MM-DD`) — jamais une date
   * d'observation individuelle. En TEXTE et non en type `date` Postgres : une
   * colonne `date` lue en SQL brut rend un OBJET JavaScript, pas une chaîne.
   */
  @Column({ name: 'period_start', type: 'text', nullable: true })
  periodStart!: string | null

  @Column({ name: 'period_end', type: 'text', nullable: true })
  periodEnd!: string | null

  /** Dernière ÉCRITURE par un run d'ingestion (insertion ou changement réel de
   *  valeur) — distincte de `updated_at` : ne bouge pas pour une ligne que le
   *  même pack réimporte à l'identique (voir `classifyUpserts`). */
  @Column({ name: 'imported_at', type: 'timestamptz', nullable: true })
  importedAt!: Date | null

  /**
   * #1615.4/#1616.3 — TROIS COLONNES DE PLUS, ajoutées par
   * `1791941000000-MarketMemoryProvenance`. NULLABLE pour la même raison que
   * les cinq colonnes ci-dessus. `evidence_count` n'a PAS de colonne dédiée —
   * `paths_total` la porte déjà ; `coverage` non plus — un taux se calcule à
   * la LECTURE (doctrine c65), il ne se fige pas à l'import. Voir le
   * commentaire de la migration.
   */
  @Column({ name: 'methodology_version', type: 'text', nullable: true })
  methodologyVersion!: string | null

  /** Constante `MARKET_MEMORY_SOURCE_FAMILY` — une seule famille de source
   *  existe aujourd'hui ; `null` pour les lignes écrites avant #1616.3. */
  @Column({ name: 'source_family', type: 'text', nullable: true })
  sourceFamily!: string | null

  /** L'URI de l'artefact source déclarée par `manifest.json` (ex. un lien
   *  Drive) — distincte de `source_checksum`, qui est l'empreinte du fichier. */
  @Column({ name: 'source_artifact_uri', type: 'text', nullable: true })
  sourceArtifactUri!: string | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
