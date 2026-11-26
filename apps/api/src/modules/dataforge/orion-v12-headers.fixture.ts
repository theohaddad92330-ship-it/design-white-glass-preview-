/**
 * Les en-têtes RÉELS de trois CSV du pack ORION_DATAPACK_V12 (snapshot
 * 2026-08-27), relevés le 31/08/2026 par lecture directe des fichiers sous
 * `agent_docs/sources/orion-v12/` (gitignoré — 172 Mo, jamais commité).
 *
 * Comme `dataforge-v10-header.fixture.ts` : c'est le CORPUS des parseurs et de
 * leurs gardes. Un en-tête qui change sans que cette liste bouge doit faire
 * échouer un test, pas passer inaperçu — c'est exactement le défaut qui a fait
 * tomber 18 colonnes de la V10 en silence.
 *
 * ⚠️ Colonnes seulement, jamais de contenu de ligne : le pack décrit des
 * entreprises réelles (comptes cibles, anomalies nominatives) et n'est jamais
 * committé, en-tête compris ou non.
 */

/** `5_RAG/50_CHUNKS_INDEXABLES.csv` — 3 849 lignes, 11 colonnes, mesuré le 31/08/2026. */
export const ORION_RAG_CHUNKS_HEADER: readonly string[] = [
  'chunk_id',
  'account_id',
  'entreprise',
  'type_chunk',
  'titre',
  'texte',
  'source',
  'niveau_confiance',
  'date_verification',
  'priorite_indexation',
  'longueur',
]

/** `1_COMPTES/10_COMPTES_MASTER.csv` — 1 195 lignes, 80 colonnes, mesuré le 31/08/2026. */
export const ORION_ACCOUNTS_MASTER_HEADER: readonly string[] = [
  'pack_version',
  'snapshot',
  'account_id',
  'Entreprise',
  'company_normalized_name',
  'legal_name',
  'siren_siret',
  'group_name',
  'parent_group_current',
  'Secteur',
  'sub_sector',
  'Ville',
  'headquarters',
  'france_locations',
  'taille_categorie',
  'Taille',
  'website',
  'careers_page',
  'account_market_role',
  'statut_code',
  'statut_cible',
  'penetrabilite',
  'pf_consolide',
  'pf_source',
  'barriere_plateforme',
  'barriere_publique',
  'procurement_page',
  'supplier_portal',
  'referencing_name',
  'referencing_process_found',
  'referencing_evidence',
  'referenced_esn_or_partners',
  'known_it_partners',
  'subsidiaries',
  'business_units',
  'internal_startups_labs',
  'recent_it_projects',
  'recent_hiring_signals',
  'public_tenders',
  'sales_accessibility_level',
  'sales_accessibility_score',
  'account_potential_score',
  'it_signal_score',
  'procurement_visibility_score',
  'data_confidence_score',
  'priority_level',
  'recommended_entry_point',
  'recommended_persona',
  'recommended_strategy',
  'next_action',
  'main_risk',
  'internal_contacts_count',
  'internal_missions_count',
  'internal_decideurs_count',
  'internal_owners',
  'chaleur_interne',
  'recent_opportunity_present',
  'couverture_v9',
  'couverture_orion',
  'couverture_totale',
  'jamais_enrichi',
  'est_doublon',
  'doublon_de',
  'v10_account_cluster_id',
  'v10_cluster_primary_account_id',
  'v10_cluster_size',
  'enrichment_status',
  'enrichment_batch',
  'source_1',
  'source_2',
  'source_3',
  'source_quality',
  'last_checked',
  'notes_enrichissement',
  'to_verify',
  'Déclencheur',
  'Douleur',
  'Angle',
  'Notes',
  'enrichi_web_2026_08_27',
]

/** `6_QUALITE/60_ANOMALIES_ET_CORRECTIONS.csv` — 20 lignes, 10 colonnes, mesuré le 31/08/2026. */
export const ORION_ANOMALIES_HEADER: readonly string[] = [
  'anomalie_id',
  'code',
  'portee',
  'objet',
  'constat',
  'impact_commercial',
  'action_recommandee',
  'severite',
  'source',
  'detecte_le',
]

/**
 * Les 20 codes d'anomalie réellement présents dans le pack (mesuré le
 * 31/08/2026 sur `60_ANOMALIES_ET_CORRECTIONS.csv` ET recoupé, INDÉPENDAMMENT,
 * sur le préfixe `[SÉVÉRITÉ]` de chacun des 20 chunks `GARDE_FOU_QUALITE` de
 * `50_CHUNKS_INDEXABLES.csv` — les deux mesures s'accordent à la lettre.
 *
 * ⚠️ Le pack lui-même (README) et la demande initiale annoncent « 7 critiques » ;
 * la mesure directe en trouve **6** (AN-004 PLACEHOLDERS_TROMPEURS est MAJEUR,
 * pas critique, contrairement à ce que le compte de tête laissait supposer).
 * Liste FERMÉE : un code hors de cette liste à l'ingestion est une anomalie du
 * PACK LUI-MÊME (une V13 qui en ajoute une) — la ligne est acceptée (staging),
 * mais le compte de sévérité doit être recompté, jamais supposé.
 */
export const ORION_KNOWN_ANOMALY_CODES: readonly string[] = [
  'CORRECTIONS_NON_PROPAGEES',
  'TAXONOMIE_INCOMPATIBLE',
  'AGREGAT_GONFLE',
  'PLACEHOLDERS_TROMPEURS',
  'PREUVE_QUASI_INEXISTANTE',
  'SEMANTIQUE_COLONNE',
  'HERITAGE_NON_TAGUE',
  'RAISONNEMENT_RESIDUEL',
  'METADONNEES_ABSENTES',
  'SOURCE_FAIBLE_DOMINANTE',
  'DONNEE_FAUSSE',
  'SCORE_INVALIDE_PAR_ENRICHISSEMENT',
  'ROLE_MARCHE_ERRONE',
  'COUVERTURE_PARTIELLE_ASSUMEE',
  'OCR_CORROMPU',
  'FICHIER_DEGRADE',
  'DOUBLONS_NON_FUSIONNES',
  'ZONES_SOUS_COUVERTES',
  'ENRICHISSEMENT_MARGINAL',
  'DEPENDANCE_SOURCE_UNIQUE',
]

/**
 * `ORION_ACCOUNT_STATUT_CODES`, `ORION_ANOMALY_SEVERITIES` et
 * `ORION_RAG_PRIORITIES` vivent dans `@bellum/contracts`
 * (`schemas/dataforge-orion.ts`), pas ici : c'est le seul endroit que lit la
 * garde GA-12 (`check-constraints-cover-enums.spec.ts`) pour vérifier qu'une
 * contrainte SQL `CHECK` couvre bien son énumération TypeScript. Réexportées
 * ici pour que le reste du module `dataforge` n'ait qu'un seul import à faire. */
export { ORION_ACCOUNT_STATUT_CODES, ORION_ANOMALY_SEVERITIES, ORION_RAG_PRIORITIES } from '@bellum/contracts'

/** Le type de chunk qui porte une alerte qualité GLOBALE — `account_id` VIDE
 *  par construction (mesuré : les 20/20 lignes `GARDE_FOU_QUALITE` du pack ont
 *  `account_id = ''`). Ce n'est jamais un oubli à ingérer : c'est parce que
 *  l'anomalie porte sur le PACK, pas sur un compte précis. */
export const ORION_QUALITY_GUARD_CHUNK_TYPE = 'GARDE_FOU_QUALITE'
