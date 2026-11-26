import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  AnalysisApolloOrgEnrichment,
  AnalysisResearchData,
  DeclaredSignal,
  DiscoverOriginCriteria,
  ItChallenge,
  OrgDeclaredPerson,
  RecentSignal,
  RelationshipState,
} from '@bellum/contracts'

@Entity({ name: 'accounts' })
export class AccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  // Team scope (multi-user Phase 2). Nullable while the user_id → workspace_id
  // roll-out is mid-flight (see agent_docs/multi-user-workspaces.md): the Phase-1
  // migration backfilled it 1:1 from each row's owner workspace, and it flips to
  // NOT NULL only once every write path stamps it. `user_id` stays as the
  // created-by attribution; `workspace_id` becomes the read scope.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  company_name: string

  /** Nom commercial, quand il diffère de la raison sociale (#2117.9). Aucune
   *  collecte ne le remplit — champ de fiche saisi à la main, même geste que
   *  `phone` / `address` (migration `1796321725100`). */
  @Column('text', { nullable: true })
  trade_name: string | null

  @Column('text', { nullable: true })
  sector: string | null

  @Column('text', { nullable: true })
  employees: string | null

  @Column('text', { nullable: true })
  revenue: string | null

  @Column('text', { nullable: true })
  headquarters: string | null

  @Column('text', { nullable: true })
  website: string | null

  /** Standard du compte. Aucune collecte ne le remplit — c'est un champ de
   *  fiche, saisi par le commercial (socle CRM T0, migration `1789301274613`). */
  @Column('text', { nullable: true })
  phone: string | null

  /** Adresse postale de travail — distincte de `headquarters`, qui porte le
   *  siège légal du registre. Saisie à la main. */
  @Column('text', { nullable: true })
  address: string | null

  // Logo réel renvoyé par Apollo Organizations Enrich (1 crédit Apollo /
  // domaine, cache 30 j côté IA). NULL = pas de logo Apollo → le front peut
  // retomber sur le favicon réel du site (affichage seulement, jamais
  // persisté). Migration 1785930000000.
  @Column('text', { nullable: true })
  logo_url: string | null

  // Bloc firmographique FACTUEL du même appel (employés estimés, industrie,
  // année de fondation, LinkedIn/Twitter, funding, technologies) — stocké
  // AS-IS en camelCase. Champ absent chez Apollo = absent ici.
  @Column('jsonb', { nullable: true })
  apollo_enrichment: AnalysisApolloOrgEnrichment | null

  // Pappers SIREN (9-digit French company id). Persisted from the Phase-1
  // research overlay so the per-company result cache (C1) can key on it.
  // Nullable: non-French companies / legacy rows may not have one.
  @Column('text', { nullable: true })
  siren: string | null

  // Cross-border canonical-account pivot (migration 1785860000000). The national
  // registry identifier resolved by the run's country pack — CIK (US), corp id
  // (CA), UID (CH), BCE (BE), RCS (LU)… — stored CANONICAL (see
  // ``modules/accounts/registry-id.util.ts``) with its 2-letter registry country.
  // FR rows are backfilled from ``siren`` (registry_country='FR') but the live FR
  // write path keeps stamping/deduping on ``siren`` only — strictly unchanged.
  // Nullable: FR rows post-migration / unresolved foreign companies / legacy.
  @Column('text', { nullable: true })
  registry_id: string | null

  @Column('text', { nullable: true })
  registry_country: string | null

  // Registry NAF/APE code (e.g. "62.01Z"), persisted from Phase 1 so "comptes
  // similaires" (Théo p.41) can seed discovery by NAF proximity. Migration
  // 1784900400000-AccountNafCode. Nullable: legacy / non-French rows.
  @Column('text', { nullable: true })
  naf_code: string | null

  // #2265.14 — le MÊME jugement que le badge « intermédiaire, pas client
  // final » de /discover (`classify_actor_type`, apps/ia), calculé sur ce
  // même NAF au moment de la recherche Phase 1. Migration
  // 1796322330000-AccountActorType. Nullable : une ligne jamais rejouée
  // depuis ce lot reste NULL (silence), jamais un `false` deviné.
  @Column('text', { nullable: true })
  actor_type: string | null

  @Column('boolean', { nullable: true })
  is_intermediary: boolean | null

  // #2165.24 / #2166.3 / #2165.16 — lien capitalistique (Pappers cartographie,
  // déjà appelée sans coût supplémentaire par la recherche Phase 1). `null` =
  // non renseigné, jamais un rôle deviné. Migration 1795650000000.
  @Column('text', { nullable: true })
  group_head_siren: string | null

  // Contrainte SQL `accounts_group_role_check` : 'groupe' | 'filiale' | NULL.
  @Column('text', { nullable: true })
  group_role: 'groupe' | 'filiale' | null

  // #219.6 (#3231, lot X50) — CLIENT INTERNE déclaré. Contrainte SQL
  // `accounts_declared_internal_client_mode_check` : 'internal_service' | 'external_buyer' | NULL.
  @Column('text', { nullable: true })
  declared_internal_client_mode: 'internal_service' | 'external_buyer' | null

  // #219.6 (J05) — les QUATRE rôles d'une direction interne, nommés à la main. NULL = non nommé.
  @Column('text', { nullable: true })
  declared_internal_sponsor: string | null

  @Column('text', { nullable: true })
  declared_internal_users: string | null

  @Column('text', { nullable: true })
  declared_legal_entity: string | null

  @Column('text', { nullable: true })
  declared_end_client: string | null

  // #3278.2 (lot M11) — les six critères de route sans source, déclarés à la main. NULL = non déclaré.
  @Column('text', { nullable: true })
  declared_route_scope: string | null

  @Column('text', { nullable: true })
  declared_route_objectives: string | null

  @Column('text', { nullable: true })
  declared_route_available_roles: string | null

  @Column('text', { nullable: true })
  declared_route_partners: string | null

  @Column('text', { nullable: true })
  declared_route_history: string | null

  @Column('text', { nullable: true })
  declared_route_timing: string | null

  // #3278.2b (Louis 15/10) — budget, disponibilité, réseau existant : déclaratifs. NULL = « non renseigné ».
  @Column('text', { nullable: true })
  declared_route_budget: string | null

  @Column('text', { nullable: true })
  declared_route_availability: string | null

  @Column('text', { nullable: true })
  declared_route_network: string | null

  // #3278.1 (décision Louis 11/10/2026) — les deux faits qui portent les routes « événement ou communauté »
  // et « inbound / contenu », déclarés à la main. NULL = non déclaré.
  @Column('text', { nullable: true })
  declared_route_event: string | null

  @Column('text', { nullable: true })
  declared_route_inbound: string | null

  @Column('text', { nullable: true })
  group_link_source: string | null

  // Un fait daté : un lien périmé redevient inconnu, il ne disparaît pas.
  @Column('timestamptz', { nullable: true })
  group_link_observed_at: Date | null

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  subsidiaries: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  it_challenges: ItChallenge[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  recent_signals: RecentSignal[]

  /**
   * #2634.1 — les signaux DÉCLARÉS par un humain (saisie, import) ou reçus
   * d'un futur connecteur officiel — LinkedIn en premier lieu, jamais un
   * scraping. Colonne SÉPARÉE de `recent_signals` (que l'IA réécrit
   * intégralement à chaque analyse) pour que ce qu'un commercial a saisi
   * survive à la prochaine analyse — même principe que `org_declared_people`
   * ci-dessous. Greffé sur `raw_analysis.recent_signals` à la LECTURE
   * (`AccountsService.findOneForWorkspace`), jamais fusionné en base.
   * Migration `1795997906098`. `[]` = comportement d'avant la feature.
   */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  declared_signals: DeclaredSignal[]

  @Column('integer', { nullable: true })
  priority_score: number | null

  @Column('text', { nullable: true })
  priority_justification: string | null

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  raw_analysis: AnalysisResearchData | Record<string, never>

  /**
   * Version du graphe d'organigramme (`raw_analysis.org.orgGraph.graphVersion`),
   * SORTIE du blob parce qu'elle doit lui survivre : chaque run réécrit le blob,
   * or une correction utilisateur doit produire une version qui persiste et sur
   * laquelle l'historique/le recalcul s'accrochent (Annexe Organigramme p30).
   * Migration `1787946118427`. Défaut 1 = comportement d'avant la feature.
   */
  @Column('integer', { default: 1 })
  org_graph_version: number

  /**
   * Ardoise des éléments écartés du graphe — `[{sourceId, reason}]`. Relue au
   * lancement du run SUIVANT pour que l'assembleur ne réinjecte jamais ce qui a
   * été rejeté (bruit, homonyme, contact signalé parti). `[]` = aucune mémoire,
   * assemblage identique à avant.
   */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  org_rejected_items: Array<{ sourceId: string; reason: string }>

  /**
   * Les personnes DÉCLARÉES à la main sur ce compte (#1103) — miroir exact de
   * `org_rejected_items` : l'ardoise mémorise ce qu'un run ne doit jamais
   * réinjecter, celle-ci ce qu'il ne doit jamais perdre. Réappliquée sur le
   * graphe après CHAQUE écriture d'organigramme. Migration `1790104738291`.
   * `[]` = comportement d'avant la feature, à l'octet près.
   */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  org_declared_people: OrgDeclaredPerson[]

  /**
   * Le compte auquel ce dossier a été RATTACHÉ (#1111), ou `null`.
   *
   * Renseigné quand un doublon — « KLESIA ADP » à côté de « KLESIA » — a été
   * absorbé : le dossier passe en `archived`, ses contacts rejoignent le compte
   * gardé, et cette colonne dit lequel. Sans elle, un compte archivé n'aurait
   * aucune explication à l'écran. Migration `1790106284517`.
   */
  @Column('uuid', { nullable: true })
  merged_into_id: string | null

  /**
   * Quand le lien a été posé, et par qui — la PROVENANCE du rattachement
   * (#1111, migration `1790280000001`).
   *
   * Un rattachement est une AFFIRMATION humaine (« ces deux dossiers sont le
   * même groupe »), jamais une inférence du produit. Sans ces deux colonnes,
   * l'écran ne peut que l'énoncer comme un fait établi par la machine.
   */
  @Column('timestamptz', { nullable: true })
  merged_at: Date | null

  @Column('uuid', { nullable: true })
  merged_by: string | null

  /**
   * Ce que le dossier était AVANT d'être rattaché — la condition du retour
   * arrière (#1111).
   *
   * Le rattachement écrase `status` et `commercial_status` par `'archived'`.
   * Sans ces deux colonnes, un « détacher » devrait CHOISIR un statut, donc en
   * inventer un. `NULL` sur un lien posé avant la migration `1790280000001` :
   * ces liens-là ne sont pas réversibles, et le code le dit (refus
   * `link_predates_reversal`) plutôt que de restituer au hasard.
   */
  @Column('text', { nullable: true })
  merged_previous_status: string | null

  @Column('text', { nullable: true })
  merged_previous_commercial_status: string | null

  /**
   * L'entité d'accueil créée sur le compte gardé pour recevoir les contacts.
   *
   * Seul repère fiable de ce qui a bougé : sans elle, un détachement devrait
   * deviner lesquels des contacts du compte gardé venaient de celui-ci.
   */
  @Column('uuid', { nullable: true })
  merged_entity_id: string | null

  @Column('text', { default: 'analyzing' })
  status: string

  /**
   * « Le plan se replanifie après chaque réponse » (annexe méthodo p27).
   * Repère posé quand un événement contact périme le plan (réponse, RDV, bounce,
   * refus — voir `replan-trigger.ts`). Cohérent avec la règle produit « on
   * prépare, l'utilisateur déclenche » : on ne re-lance pas la phase 4
   * automatiquement (elle a un coût), on affiche un nudge et c'est le clic qui
   * replanifie. Effacé au replan. NULL = aucun événement en attente.
   * Migration `1788024531892`. */
  @Column('timestamptz', { nullable: true })
  replan_suggested_at: Date | null

  /**
   * La version PRÉCÉDENTE du dossier, gardée pour qu'il y ait quelque chose à
   * comparer (D213 ; migration `1791550000002`).
   *
   * ⚠️ `null` veut dire « aucune version précédente conservée », JAMAIS « rien
   * n'a changé ». Un dossier analysé une seule fois, ou antérieur à ce
   * chantier, n'a pas de tiroir — et n'en affiche aucun, plutôt qu'un tiroir
   * vide qui se lirait « on a vérifié, tout va bien ».
   */
  @Column('jsonb', { nullable: true })
  previous_raw_analysis: AnalysisResearchData | Record<string, never> | null

  /** Quand la version précédente a été remplacée. NULL = aucune. */
  @Column('timestamptz', { nullable: true })
  previous_analysis_at: Date | null

  /**
   * Mémoire de relation — bloc « Mémoire » de la couche zéro (annexe méthodo p8) :
   * relation, dernier contact, owner, prochaine revue, issue, source. Ce que l'ESN
   * SAIT déjà du compte, éditable et relu au run suivant. NULL = aucune mémoire.
   * Migration `1788028441107`. */
  @Column('jsonb', { nullable: true })
  relationship_memory: {
    relation?: string | null
    /** #3246.relation — stade SAISI dans la liste fermée `relationshipStateSchema` (jamais parsé de `relation`). */
    relationStage?: RelationshipState | null
    lastContactAt?: string | null
    owner?: string | null
    nextReviewAt?: string | null
    issue?: string | null
    source?: string | null
  } | null

  /**
   * Portefeuille — the workspace member this account is assigned to, i.e. the
   * "responsable compte". `null` = non attribué (the manager's to-assign
   * queue). Distinct from `user_id`, which stays created-by attribution:
   * creating an account is not the same act as owning it.
   * Migration `1786958241077-AccountAssignment`.
   */
  @Column('uuid', { nullable: true })
  assigned_to: string | null

  /**
   * Le PÉRIMÈTRE qui porte ce compte (#2081.10) — la BU / agence de NOTRE
   * espace, pas une subdivision du prospect (celle-là vit dans
   * `account_entities`, et l'homonymie est expliquée dans `business-unit.entity.ts`).
   *
   * ⚠️ NULLABLE, et c'est la moitié qui compte : tout le portefeuille existant
   * n'a pas de BU, et reste visible de qui le voyait avant. La dimension AJOUTE
   * une borne, elle ne fait disparaître personne.
   * Migration `1793710000000-BusinessUnits`.
   */
  @Column('uuid', { nullable: true })
  business_unit_id: string | null

  // Cycle de vie COMMERCIAL (inbox/watching/opportunity/customer/archived),
  // orthogonal au `status` d'analyse ci-dessus (Théo p.39). Piloté par le
  // commercial + pré-classé au run selon le score. Migration
  // 1784900100000-CommercialStatus (défaut 'inbox', backfill par statut+score).
  @Index()
  @Column('text', { default: 'inbox' })
  commercial_status: string

  /**
   * #2165.13 — CE compte-CLIENT sert de référence pour « Proches de mes
   * meilleures références » dans Découvrir. Le commercial la marque
   * lui-même — jamais déduite d'un score, une référence est un choix, pas
   * un calcul. Migration 1795620000001-AccountBestReference.
   */
  @Column('boolean', { default: false })
  is_best_reference: boolean

  /**
   * #3245 (#3209.6) — le PROFIL DE PARI, DÉCLARÉ (jamais déduit) ; `null` =
   * non déclaré. Migration 1796413395732-AccountBetProfile.
   */
  @Column('text', { nullable: true })
  bet_horizon: string | null

  @Column('text', { nullable: true })
  bet_size: string | null

  @Column('text', { nullable: true })
  bet_access: string | null

  @Column('text', { nullable: true })
  bet_resource: string | null

  /**
   * #3282 / #3263.30 — l'échelon où l'offre se vend (`c_level` | `direction` |
   * `manager` | `operational`), SAISI par le commercial, jamais déduit ; `null`
   * = non déclaré. Migration 1796438000011-AccountCommitteeEntryLevel.
   */
  @Column('text', { nullable: true })
  committee_entry_level: string | null

  /**
   * La porte G1 (PDF 2 §4.4 B2) : `pending` | `prioritised` | `parked`.
   *
   * ⚠️ DEUX AXES DIFFÉRENTS. Celui-ci dit « est-ce que je travaille ce compte » ;
   * `commercial_status` juste au-dessus dit « où en est la relation ». Un client
   * peut être mis en veille sans cesser d'être client — les fusionner le ferait
   * disparaître de la facturation le jour où quelqu'un l'écarte.
   */
  @Column('text', { default: 'pending' })
  priority_gate: string

  /**
   * Le niveau d'EFFORT (tome 5 §28) — un TROISIÈME axe, à ne fondre ni avec
   * `priority_gate` (ai-je décidé de travailler ce compte ?) ni avec
   * `commercial_status` (où en est la relation ?). Il dit combien d'énergie on
   * met, cette semaine. `null` = le compte n'est dans aucun sprint, ce qui est
   * l'état normal de la plupart d'entre eux.
   */
  @Column('text', { nullable: true })
  sprint: string | null

  @Column('timestamptz', { nullable: true })
  sprint_entered_at: Date | null

  /** Le motif de SORTIE, obligatoire vers `no_go`. Effacé en remontant : le
   *  garder ferait réapparaître « pas de budget » sur un compte rouvert. */
  @Column('text', { nullable: true })
  sprint_exit_reason: string | null

  /**
   * BEL-SC-228 (#3257) — la DÉCISION qui accompagne le niveau d'effort,
   * générique aux six niveaux (doctrine c75, `SprintDecisionFields`).
   *
   * `sprint_reason` : pourquoi ce compte est à ce niveau — distinct de
   * `sprint_exit_reason` ci-dessus, qui ne porte que le motif de SORTIE.
   * `sprint_promotion_condition` porte AUSSI la condition de réveil de
   * `watch` (`sprintDecisionProblems`, obligatoire pour entrer en veille) :
   * ce n'est pas un second champ, la question est la même — qu'est-ce qui
   * ferait monter ce compte ?
   *
   * Cinq colonnes NULLABLES, aucun backfill (migration
   * `1796373242104-SprintPortfolioDecision.ts`) : une décision jamais écrite
   * reste absente, jamais devinée.
   */
  @Column('text', { nullable: true })
  sprint_reason: string | null

  @Column('text', { nullable: true })
  sprint_effort_estimate: string | null

  @Column('timestamptz', { nullable: true })
  sprint_review_at: Date | null

  @Column('text', { nullable: true })
  sprint_promotion_condition: string | null

  @Column('text', { nullable: true })
  sprint_demotion_condition: string | null
  /** Qui a posé ce niveau de sprint — #3262 (BEL-SC-233) : une raison et une
   *  date sans auteur ne disent pas QUI a décidé de sortir ce compte du
   *  Focus, sur un espace à plusieurs commerciaux. `null` = mouvement
   *  automatique (`SprintsService.applyEvent`) ou compte antérieur à la
   *  colonne — jamais deviné. Migration `1796373379395`. */
  @Column('uuid', { nullable: true })
  sprint_decided_by: string | null

  /** Obligatoire pour écarter, absent ailleurs. C'est le seul apprentissage
   *  que produit un « non ». */
  @Column('text', { nullable: true })
  gate_reason: string | null

  @Column('timestamptz', { nullable: true })
  gate_decided_at: Date | null

  /** Qui a franchi la porte G1 — #3262 (BEL-SC-233), même raison que
   *  `sprint_decided_by`. `null` = compte antérieur à la colonne.
   *  Migration `1796373379395`. */
  @Column('uuid', { nullable: true })
  gate_decided_by: string | null

  @Column('text', { nullable: true })
  error_message: string | null

  @Column('text', { nullable: true })
  user_context: string | null

  @Column('numeric', { precision: 10, scale: 4, nullable: true })
  api_cost_euros: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date

  /**
   * Quand CHAQUE dimension a été rafraîchie pour la dernière fois.
   *
   * ⚠️ `updated_at` ne dit la fraîcheur de rien : un refresh de signaux
   * l'incrémente, et l'écran annonce alors « actualisé il y a 2 jours » au-dessus
   * d'un organigramme de mars. Le commercial part en rendez-vous avec des
   * interlocuteurs périmés en croyant le dossier à jour.
   *
   * `null` = cette dimension n'a jamais été rafraîchie séparément — l'état de
   * tous les dossiers antérieurs. Ce n'est PAS « rafraîchie à l'époque zéro » :
   * la règle de non-rerun ne se déclenche sur aucun d'eux, parce qu'on ne refuse
   * pas un geste sur une date qu'on n'a pas. Migration `1790040000002`.
   */
  @Column('timestamptz', { nullable: true })
  signals_refreshed_at: Date | null

  @Column('timestamptz', { nullable: true })
  contacts_refreshed_at: Date | null

  @Column('timestamptz', { nullable: true })
  entities_refreshed_at: Date | null

  @Column('timestamptz', { nullable: true })
  strategy_refreshed_at: Date | null

  /**
   * #2650.1 (18/09/2026) — verrou de rafraîchissement PAR AXE, DÉDIÉ, jamais lu
   * par l'écran (contrairement aux quatre colonnes ci-dessus). `NULL` = axe
   * libre. Écrit AU DÉBUT de la phase par `AnalysisRefreshService
   * .reserveDimension` (CAS Postgres), relâché en fin de phase — succès, échec
   * ou course de crédit perdue — par `releaseDimension`. Ferme le trou que
   * `*_refreshed_at` ne pouvait pas fermer : cette dernière n'est écrite
   * qu'APRÈS la phase, donc un second appel PENDANT la phase (≈1 min) la
   * traversait sans obstacle — mesuré en production le 18/09/2026, deux clics
   * à 50 s d'écart, deux débits. Migration `1789756084245`.
   */
  @Column('timestamptz', { nullable: true })
  signals_refresh_lock_at: Date | null

  @Column('timestamptz', { nullable: true })
  contacts_refresh_lock_at: Date | null

  @Column('timestamptz', { nullable: true })
  entities_refresh_lock_at: Date | null

  @Column('timestamptz', { nullable: true })
  strategy_refresh_lock_at: Date | null

  /**
   * #AF.2 (18/09/2026) — quand le segment CONTACTS a été RÉELLEMENT collecté
   * (pipeline complet Phase 2 OU rafraîchissement ciblé), distinct de
   * `contacts_refreshed_at` qui ne porte que le geste « Rafraîchir ». Seul
   * écrivain : `AnalysisPersistenceService.saveContacts`. `null` = jamais daté
   * (tous les dossiers antérieurs à ce lot) — traité comme CONCERNÉ par un
   * rattrapage, jamais présumé à jour. Migration `1795670000000`.
   */
  @Column('timestamptz', { nullable: true })
  contacts_collected_at: Date | null

  /**
   * LUDOVIC-C LC.1 — quand les règles ACTUELLES de contacts (homonymes, LUDB.5) ont été
   * repassées sur l'existant, sans recollecte. Seul écrivain :
   * `ContactsService.applyCurrentContactRules`. Migration `1796560598667`.
   */
  @Column('timestamptz', { nullable: true })
  contacts_rules_applied_at: Date | null

  /**
   * #2543.7 (18/09/2026) — même rôle que `contacts_collected_at`, pour les
   * trois autres segments rejouables séparément. `null` = jamais daté (tous
   * les dossiers antérieurs à ce lot) — CONCERNÉ par un rattrapage futur,
   * jamais présumé à jour. Migration `1795712345678`.
   *
   * `entities_collected_at` ← `AnalysisPersistenceService.saveOrgChart` (seul
   * écrivain, Phase 3 organigramme, pipeline complet ET rafraîchissement
   * ciblé « Enrichir organigramme »).
   */
  @Column('timestamptz', { nullable: true })
  entities_collected_at: Date | null

  /**
   * `signals_collected_at` ← `AccountsService.applyResearch` (seul écrivain —
   * son propre docblock le nomme « le dernier point de passage commun à TOUS
   * les chemins de rafraîchissement » de la recherche Phase 1 : pipeline
   * complet, « Actualiser », relance, reprise). Migration `1795712345678`.
   */
  @Column('timestamptz', { nullable: true })
  signals_collected_at: Date | null

  /**
   * `strategy_collected_at` ← `AnalysisPersistenceService.savePlan` (seul
   * écrivain, Phase 4 plan, pipeline complet ET « Changer de stratégie »).
   * Migration `1795712345678`.
   */
  @Column('timestamptz', { nullable: true })
  strategy_collected_at: Date | null

  /**
   * #2118.51 (18/09/2026) — même rôle que `strategy_collected_at`, pour le
   * CINQUIÈME segment : la lecture du dossier en sept axes (`evaluation.
   * dossier_read`, #2118). `null` = jamais datée (tout dossier antérieur à ce
   * lot) — CONCERNÉ par un rattrapage, jamais présumé à jour. Seul écrivain :
   * `AnalysisPersistenceService.savePlan`, au MÊME point que
   * `applyStrategyCollectedAt` — c'est Phase 4 qui écrit `dossier_read`.
   * Migration `1795713579246`.
   */
  @Column('timestamptz', { nullable: true })
  dossier_read_collected_at: Date | null

  /**
   * #2298.4 (19/09/2026, lot I3) — la date du REJEU GRATUIT de l'axe relation
   * seul (`AnalysisOnDemandService.recalculateRelationAxis`), DISTINCTE de
   * `signals_collected_at` : celle-ci ne bouge QUE sur une recherche Phase 1
   * complète (payante), celle-là sur le geste « Recalculer la relation
   * (gratuit) » — les deux peuvent désormais diverger, réutiliser
   * `signals_collected_at` ici ferait croire à une recherche complète qui n'a
   * pas eu lieu (GA-26). `null` = jamais recalculée gratuitement — l'écran
   * retombe alors sur `signals_collected_at` seul. Seul écrivain :
   * `AccountsService.applyAddressabilityRelationRecalc`. Migration
   * `1795716734279`.
   */
  @Column('timestamptz', { nullable: true })
  addressability_relation_collected_at: Date | null

  /**
   * #4078 (14/10/2026) — la date de collecte du SEPTIÈME segment : les cinq blocs
   * du dossier complet (`structural_reading_axes`, `ecosystem_third_parties`,
   * `opportunity_domains`, `financial_indicators`, `data_reliability_notes`).
   * `null` = jamais datée (tout compte analysé avant la capacité) — CONCERNÉE par
   * le rattrapage, jamais présumée à jour. Seul écrivain :
   * `DossierBlocksStep.produceDossierBlocks`. Migration `1796530330276`.
   */
  @Column('timestamptz', { nullable: true })
  dossier_blocks_collected_at: Date | null

  /**
   * #2637.1 (21/09/2026) — quand ce compte a été rattrapé pour la DERNIÈRE
   * fois par `MissingRolesCatchupService` (rattrapage AUTOMATIQUE, en lot,
   * du mode payant `missing_roles` — voir le docblock de
   * `packages/contracts/src/schemas/missing-roles-catchup.ts`). `null` =
   * jamais rattrapé — CONCERNÉ, jamais présumé à jour. Seul écrivain :
   * `MissingRolesCatchupService.markAttempt`. Le bouton manuel « Enrichir les
   * rôles manquants » (`enrich-gaps`) ne lit ni n'écrit cette colonne : un
   * compte « épuisé » ici reste cliquable à la main, sans aucune limite
   * héritée. Migration `1795996487602`.
   */
  @Column('timestamptz', { nullable: true })
  missing_roles_catchup_at: Date | null

  /**
   * #2637.1 — le nombre de passages automatiques déjà reçus. Distinct de la
   * date ci-dessus : c'est ce compteur qui borne les REPRISES d'un job resté
   * `partial`/`failed` après `MISSING_ROLES_CATCHUP_MAX_ATTEMPTS` passages,
   * même si la date de la capacité, elle, ne change jamais. Migration
   * `1795996487602`.
   */
  @Column('integer', { default: 0 })
  missing_roles_catchup_attempts: number
  /**
   * D'où vient ce compte : `discover` | `search` | `import` | `crm` | `manual`.
   *
   * `null` sur tout compte antérieur au 22/08, et ça le reste : lui attribuer
   * une origine rétroactivement inventerait son histoire. Le compteur de
   * contribution les exclut et DIT combien il en exclut.
   * Migration `1789993128471`.
   */
  @Column('text', { nullable: true })
  origin: string | null

  /**
   * #3914 — la raison CALCULÉE qui a fait remonter ce compte dans Découvrir
   * (angle, signal daté ou facteurs de score — `suggestionReason`,
   * `discover-analyze.ts`), quand `origin` vaut `discover`. `null` sur tout
   * compte venu autrement, ou antérieur à ce lot : jamais une raison devinée.
   * C'est elle que l'écran de compte cite quand l'analyse conclut
   * différemment de ce que Découvrir avait dit (`AccountVerdictSummary`).
   * Migration `1796437712847`.
   */
  @Column('text', { nullable: true })
  discover_origin_reason: string | null

  /**
   * #3819 (lot RBB) — les critères de Découvrir (secteur, zone, effectif,
   * signal) posés ET satisfaits quand le compte a été ajouté
   * (`discoverOriginCriteriaSchema`). `null` = rien à nommer. Migration
   * `1796438071493`, contrainte `accounts_discover_origin_criteria_shape_check`.
   */
  @Column('jsonb', { nullable: true })
  discover_origin_criteria: DiscoverOriginCriteria | null

  /**
   * #2159.26 — les ÉTIQUETTES, normalisées par `normalizeTags` (contrat) et
   * tenues en base par `accounts_tags_check`. `{}` = aucune, jamais `NULL`.
   * Migration `1795725274971`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  tags: string[]

  /**
   * Import universel (Louis 27/09/2026, migration `1796322824816`) — les
   * colonnes d'un fichier importé qui n'ont AUCUN champ d'accueil, sous leur
   * en-tête d'origine. On n'écrase ni ne jette rien : `{}` = rien d'importé en plus.
   */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  extra: Record<string, string>

  /**
   * #4597.3 — l'import universel qui a CRÉÉ cette fiche (`universal_import_jobs.id`). `null` : fiche non née d'un
   * import, ou importée avant la colonne — jamais devinée d'après une date. Migration `1796575257285`.
   */
  @Column('uuid', { nullable: true })
  import_job_id: string | null
}
