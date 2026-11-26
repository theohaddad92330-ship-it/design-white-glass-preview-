import { splitCsvLine } from '../contacts/csv-import'
import { boolFrom, intOrNull, numberOrNull, textOrNull } from './dataforge-csv'
import { ORION_ACCOUNT_STATUT_CODES, ORION_ANOMALY_SEVERITIES, ORION_RAG_PRIORITIES } from './orion-v12-headers.fixture'

/**
 * Parseurs PURS des trois CSV ORION_DATAPACK_V12 retenus dans ce lot — même
 * discipline que `dataforge-csv.ts`, dont ils réutilisent l'assembleur
 * d'enregistrements et les convertisseurs `textOrNull` / `numberOrNull` /
 * `intOrNull` / `boolFrom` : deux définitions de « vide » divergeraient tôt
 * ou tard.
 *
 * Refus NOMMÉS, jamais devinés — même politique que `parseDataforgeRecord` :
 * nombre de colonnes différent de l'en-tête, identifiant absent, valeur
 * fermée (statut, sévérité, priorité) hors de la liste mesurée.
 */

type OrionParsedRow<T> = { kind: 'row'; row: T } | { kind: 'rejected'; reason: string }

/**
 * Une valeur ENTIÈREMENT entre crochets est un marque-place du pack —
 * `[à compléter lot 2 — Pappers/Sirene]`, `[non trouvé publiquement — liste
 * non publiée]`, `[non recherché lot 1]` — jamais une valeur (avertissement 5
 * du pack, généralisé : `[à rechercher V6]` n'était qu'un exemple parmi
 * d'autres marque-places de la même forme).
 *
 * Le champ TYPÉ devient `null` ; le texte brut du marque-place reste dans
 * `payload` côté compte, pour que la RAISON du `null` ne se perde pas.
 */
export function valueOrPlaceholderNull(value: string | undefined): string | null {
  const trimmed = textOrNull(value)
  if (trimmed === null) return null
  return /^\[.*\]$/.test(trimmed) ? null : trimmed
}

// ─────────────────────────────────────────────────────────────────────────
// 5_RAG/50_CHUNKS_INDEXABLES.csv
// ─────────────────────────────────────────────────────────────────────────

export interface OrionRagChunkRecord {
  chunkId: string
  /** `null` par CONSTRUCTION pour les 20 chunks `GARDE_FOU_QUALITE` — jamais un
   *  oubli d'ingestion (avertissement 1 de la tâche). */
  accountId: string | null
  entreprise: string | null
  typeChunk: string
  titre: string | null
  texte: string
  source: string | null
  niveauConfiance: string | null
  dateVerification: string | null
  /** 0 | 1 | 2 — liste FERMÉE, voir `ORION_RAG_PRIORITIES`. */
  prioriteIndexation: number
  longueur: number | null
}

export function parseOrionRagChunkRecord(
  header: readonly string[],
  record: string,
): OrionParsedRow<OrionRagChunkRecord> {
  const cells = splitCsvLine(record, ';')
  if (cells.length !== header.length) {
    return { kind: 'rejected', reason: `colonnes: ${cells.length} au lieu de ${header.length}` }
  }
  const row: Record<string, string> = {}
  header.forEach((column, index) => {
    row[column] = cells[index] ?? ''
  })

  const chunkId = textOrNull(row['chunk_id'])
  const typeChunk = textOrNull(row['type_chunk'])
  const texte = textOrNull(row['texte'])
  if (!chunkId) return { kind: 'rejected', reason: 'chunk sans identifiant' }
  if (!typeChunk) return { kind: 'rejected', reason: `type de chunk absent (${chunkId})` }
  if (!texte) return { kind: 'rejected', reason: `texte absent (${chunkId})` }

  const prioriteRaw = intOrNull(row['priorite_indexation'])
  if (prioriteRaw === null || !(ORION_RAG_PRIORITIES as readonly number[]).includes(prioriteRaw)) {
    return {
      kind: 'rejected',
      reason: `priorité d'indexation inconnue « ${row['priorite_indexation'] ?? ''} » (${chunkId})`,
    }
  }

  return {
    kind: 'row',
    row: {
      chunkId,
      // Vide par construction sur les GARDE_FOU_QUALITE — jamais rejeté pour ça.
      accountId: textOrNull(row['account_id']),
      entreprise: textOrNull(row['entreprise']),
      typeChunk,
      titre: textOrNull(row['titre']),
      texte,
      source: textOrNull(row['source']),
      niveauConfiance: textOrNull(row['niveau_confiance']),
      dateVerification: textOrNull(row['date_verification']),
      prioriteIndexation: prioriteRaw,
      longueur: intOrNull(row['longueur']),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 1_COMPTES/10_COMPTES_MASTER.csv
// ─────────────────────────────────────────────────────────────────────────

export interface OrionAccountStatusRecord {
  accountId: string
  dataVersion: string
  snapshot: string | null
  entreprise: string | null
  companyNormalizedName: string | null
  legalName: string | null
  sirenSiret: string | null
  groupName: string | null
  sector: string | null
  city: string | null
  headquarters: string | null
  sizeCategory: string | null
  website: string | null
  accountMarketRole: string | null
  /** Liste FERMÉE — voir `ORION_ACCOUNT_STATUT_CODES` (9 valeurs mesurées). */
  statutCode: string
  statutCible: string | null
  /**
   * 0-100, « ordre de passage, pas verdict » (avertissement 7). NE JAMAIS la
   * rendre seule : `couvertureTotale` doit toujours l'accompagner — un score
   * élevé sur une couverture ≤ 1 champ sur 24 ne veut rien dire de plus que
   * « la donnée manque ». Gardée par `orion-penetrabilite-jamais-nue.spec.ts`.
   */
  penetrabiliteScore: number | null
  platformConsolidated: string | null
  platformSource: string | null
  barrierePlateforme: boolean
  barrierePublique: boolean
  procurementPage: string | null
  supplierPortal: string | null
  referencingName: string | null
  referencingProcessFound: string | null
  salesAccessibilityLevel: string | null
  salesAccessibilityScore: number | null
  accountPotentialScore: number | null
  itSignalScore: number | null
  procurementVisibilityScore: number | null
  dataConfidenceScore: number | null
  priorityLevel: string | null
  recommendedEntryPoint: string | null
  recommendedPersona: string | null
  recommendedStrategy: string | null
  nextAction: string | null
  mainRisk: string | null
  /** ⚠️ Ne JAMAIS sommer sur plusieurs comptes (avertissement 4) : héritage
   *  groupe → entité, facteur ~6,4 mesuré sur le pack. */
  internalContactsCount: number | null
  internalMissionsCount: number | null
  internalDecideursCount: number | null
  chaleurInterne: number | null
  couvertureV9: number | null
  couvertureOrion: number | null
  /** Champs renseignés sur 24 — la mesure de profondeur qui accompagne `penetrabiliteScore`. */
  couvertureTotale: number | null
  jamaisEnrichi: boolean
  estDoublon: boolean
  doublonDe: string | null
  v10ClusterId: string | null
  v10ClusterPrimaryId: string | null
  v10ClusterSize: number | null
  enrichmentStatus: string | null
  enrichmentBatch: string | null
  lastChecked: string | null
  sourceQuality: string | null
  /** Le reste des 80 colonnes, brut — jamais perdu, jamais dupliqué en champ typé. */
  payload: Record<string, string>
}

const ACCOUNT_STATUS_TYPED_COLUMNS = new Set([
  'pack_version',
  'snapshot',
  'account_id',
  'Entreprise',
  'company_normalized_name',
  'legal_name',
  'siren_siret',
  'group_name',
  'Secteur',
  'Ville',
  'headquarters',
  'taille_categorie',
  'website',
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
  'chaleur_interne',
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
  'source_quality',
  'last_checked',
])

export function parseOrionAccountStatusRecord(
  header: readonly string[],
  record: string,
): OrionParsedRow<OrionAccountStatusRecord> {
  const cells = splitCsvLine(record, ';')
  if (cells.length !== header.length) {
    return { kind: 'rejected', reason: `colonnes: ${cells.length} au lieu de ${header.length}` }
  }
  const row: Record<string, string> = {}
  header.forEach((column, index) => {
    row[column] = cells[index] ?? ''
  })

  const accountId = textOrNull(row['account_id'])
  if (!accountId) return { kind: 'rejected', reason: 'compte sans identifiant' }

  const statutCode = textOrNull(row['statut_code'])
  if (!statutCode || !(ORION_ACCOUNT_STATUT_CODES as readonly string[]).includes(statutCode)) {
    return { kind: 'rejected', reason: `statut_code inconnu « ${statutCode ?? ''} » (${accountId})` }
  }

  const payload: Record<string, string> = {}
  for (const [column, value] of Object.entries(row)) {
    if (value.trim().length === 0) continue
    if (!ACCOUNT_STATUS_TYPED_COLUMNS.has(column)) payload[column] = value
  }

  /**
   * Un champ typé passé par `valueOrPlaceholderNull` : si le marque-place a
   * effacé la valeur, le texte brut rejoint quand même `payload` — sous le
   * MÊME nom de colonne, qu'aucune boucle ci-dessus ne peut atteindre puisque
   * ces colonnes sont TYPÉES. Sans ce filet, un `null` ne dirait plus POURQUOI
   * (avertissement 5 : « [à rechercher V6] n'est pas une valeur », généralisé
   * à tout marque-place entre crochets).
   */
  function placeholderAware(column: string): string | null {
    const value = valueOrPlaceholderNull(row[column])
    if (value === null && textOrNull(row[column]) !== null) payload[column] = row[column] ?? ''
    return value
  }

  return {
    kind: 'row',
    row: {
      accountId,
      dataVersion: textOrNull(row['pack_version']) ?? 'ORION_V12',
      snapshot: textOrNull(row['snapshot']),
      entreprise: textOrNull(row['Entreprise']),
      companyNormalizedName: textOrNull(row['company_normalized_name']),
      legalName: textOrNull(row['legal_name']),
      sirenSiret: placeholderAware('siren_siret'),
      groupName: textOrNull(row['group_name']),
      sector: textOrNull(row['Secteur']),
      city: textOrNull(row['Ville']),
      headquarters: textOrNull(row['headquarters']),
      sizeCategory: textOrNull(row['taille_categorie']),
      website: textOrNull(row['website']),
      accountMarketRole: textOrNull(row['account_market_role']),
      statutCode,
      statutCible: textOrNull(row['statut_cible']),
      penetrabiliteScore: numberOrNull(row['penetrabilite']),
      platformConsolidated: placeholderAware('pf_consolide'),
      platformSource: textOrNull(row['pf_source']),
      barrierePlateforme: boolFrom(row['barriere_plateforme']),
      barrierePublique: boolFrom(row['barriere_publique']),
      procurementPage: placeholderAware('procurement_page'),
      supplierPortal: placeholderAware('supplier_portal'),
      referencingName: textOrNull(row['referencing_name']),
      referencingProcessFound: textOrNull(row['referencing_process_found']),
      salesAccessibilityLevel: textOrNull(row['sales_accessibility_level']),
      salesAccessibilityScore: numberOrNull(row['sales_accessibility_score']),
      accountPotentialScore: numberOrNull(row['account_potential_score']),
      itSignalScore: numberOrNull(row['it_signal_score']),
      procurementVisibilityScore: numberOrNull(row['procurement_visibility_score']),
      dataConfidenceScore: numberOrNull(row['data_confidence_score']),
      priorityLevel: textOrNull(row['priority_level']),
      recommendedEntryPoint: placeholderAware('recommended_entry_point'),
      recommendedPersona: placeholderAware('recommended_persona'),
      recommendedStrategy: placeholderAware('recommended_strategy'),
      nextAction: placeholderAware('next_action'),
      mainRisk: placeholderAware('main_risk'),
      internalContactsCount: intOrNull(row['internal_contacts_count']),
      internalMissionsCount: intOrNull(row['internal_missions_count']),
      internalDecideursCount: intOrNull(row['internal_decideurs_count']),
      chaleurInterne: intOrNull(row['chaleur_interne']),
      couvertureV9: intOrNull(row['couverture_v9']),
      couvertureOrion: intOrNull(row['couverture_orion']),
      couvertureTotale: intOrNull(row['couverture_totale']),
      jamaisEnrichi: boolFrom(row['jamais_enrichi']),
      estDoublon: boolFrom(row['est_doublon']),
      doublonDe: textOrNull(row['doublon_de']),
      v10ClusterId: textOrNull(row['v10_account_cluster_id']),
      v10ClusterPrimaryId: textOrNull(row['v10_cluster_primary_account_id']),
      v10ClusterSize: intOrNull(row['v10_cluster_size']),
      enrichmentStatus: textOrNull(row['enrichment_status']),
      enrichmentBatch: textOrNull(row['enrichment_batch']),
      lastChecked: textOrNull(row['last_checked']),
      sourceQuality: placeholderAware('source_quality'),
      payload,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 6_QUALITE/60_ANOMALIES_ET_CORRECTIONS.csv
// ─────────────────────────────────────────────────────────────────────────

export interface OrionAnomalyRecord {
  anomalieId: string
  code: string
  portee: string | null
  objet: string | null
  constat: string | null
  impactCommercial: string | null
  actionRecommandee: string | null
  /** CRITIQUE | MAJEUR | MINEUR — voir `ORION_ANOMALY_SEVERITIES`. */
  severite: string
  source: string | null
  detecteLe: string | null
}

export function parseOrionAnomalyRecord(header: readonly string[], record: string): OrionParsedRow<OrionAnomalyRecord> {
  const cells = splitCsvLine(record, ';')
  if (cells.length !== header.length) {
    return { kind: 'rejected', reason: `colonnes: ${cells.length} au lieu de ${header.length}` }
  }
  const row: Record<string, string> = {}
  header.forEach((column, index) => {
    row[column] = cells[index] ?? ''
  })

  const anomalieId = textOrNull(row['anomalie_id'])
  const code = textOrNull(row['code'])
  if (!anomalieId) return { kind: 'rejected', reason: 'anomalie sans identifiant' }
  if (!code) return { kind: 'rejected', reason: `code absent (${anomalieId})` }

  const severite = textOrNull(row['severite'])
  if (!severite || !(ORION_ANOMALY_SEVERITIES as readonly string[]).includes(severite)) {
    return { kind: 'rejected', reason: `sévérité inconnue « ${severite ?? ''} » (${anomalieId})` }
  }

  return {
    kind: 'row',
    row: {
      anomalieId,
      code,
      portee: textOrNull(row['portee']),
      objet: textOrNull(row['objet']),
      constat: textOrNull(row['constat']),
      impactCommercial: textOrNull(row['impact_commercial']),
      actionRecommandee: textOrNull(row['action_recommandee']),
      severite,
      source: textOrNull(row['source']),
      detecteLe: textOrNull(row['detecte_le']),
    },
  }
}

/**
 * Les anomalies dont AUCUN chunk RAG ne porte le code dans son titre.
 *
 * Le registre `dataforge_data_anomalies` n'est pas de la documentation : une
 * anomalie qui n'a pas de miroir `GARDE_FOU_QUALITE` côté RAG ne remontera
 * jamais dans une réponse — elle est repassée en documentation malgré elle.
 * Un résultat non vide dit précisément QUELS codes manquent, jamais un simple
 * « ça ne correspond pas ».
 */
export function findAnomalyCodesMissingFromChunkTitles(
  anomalyCodes: readonly string[],
  chunkTitles: readonly string[],
): string[] {
  return anomalyCodes.filter(code => !chunkTitles.some(titre => titre.includes(code)))
}

/**
 * La ligne à écrire dans `dataforge_account_statuses` : l'`account_id` du pack (`DF-XXXX`) devient `source_id`, la clé
 * d'idempotence (`ON CONFLICT (source_id)`). Sans ce renommage, l'upsert laisse `source_id` à DEFAULT et Postgres refuse
 * la ligne (NOT NULL) — import prod du 04/11 arrêté sur la première tranche.
 */
export function toAccountStatusUpsertRow(
  record: OrionAccountStatusRecord,
): Omit<OrionAccountStatusRecord, 'accountId'> & { sourceId: string } {
  const { accountId, ...rest } = record
  return { ...rest, sourceId: accountId }
}
