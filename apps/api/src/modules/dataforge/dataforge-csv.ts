import { splitCsvLine } from '../contacts/csv-import'
import { classifyDataforgeColumn } from './dataforge-columns'

/**
 * Parseur PUR du CSV canonique DATAFORGE V10 — ce qui décide ne parle jamais à
 * la base (règle du moteur d'import), et chaque refus porte sa raison.
 *
 * Le fichier fait 345 Mo (78 870 lignes de données, 158 colonnes, séparateur
 * point-virgule, BOM en tête) : il ne se lit JAMAIS d'un bloc. L'assembleur
 * incrémental ci-dessous reconstitue les enregistrements au fil des chunks —
 * indispensable parce que ~400 champs cités contiennent des retours à la ligne
 * (79 275 lignes physiques pour 78 870 enregistrements, mesuré le 24/08).
 */

/** Les quatre tiers de preuve du pack — liste FERMÉE. Hors liste = ligne écartée. */
export const DATAFORGE_EVIDENCE_TIERS = ['A', 'B', 'C', 'D'] as const
type DataforgeEvidenceTier = (typeof DATAFORGE_EVIDENCE_TIERS)[number]

export interface DataforgeAccountRecord {
  dataVersion: string
  sourceId: string
  name: string
  normalizedName: string
  groupName: string | null
  sector: string | null
  clusterId: string | null
  clusterPrimaryId: string | null
  isClusterPrimary: boolean
  isDuplicateVariant: boolean
  siren: string | null
  sirenSiretRaw: string | null
  website: string | null
  procurementRoute: string | null
  procurementPolicy: string | null
  procurementInheritanceWarning: string | null
  marketRole: string | null
  researchTier: string | null
  tierADomainCount: number | null
  tierBDomainCount: number | null
  accountPayload: Record<string, string>
}

export interface DataforgeDomainRecord {
  dataVersion: string
  sourceId: string
  domainCode: string
  evidenceTier: DataforgeEvidenceTier
  evidenceStatus: string | null
  userClaimPolicy: string | null
  scoringPolicy: string | null
  sectorPriorDemandScore: number | null
  sectorPriorExternalizationScore: number | null
  publicActivitySignalScore: number | null
  demandIntensityScore: number | null
  externalizableDemandScore: number | null
  internalCompetitionScore: number | null
  directAccessScore: number | null
  mediatedAccessScore: number | null
  commercialOpportunityScore: number | null
  dataConfidenceScore: number | null
  evidenceItemCount: number | null
  strongestEvidenceStrength: string | null
  medianObservedTjm: number | null
  buyerPersonas: string | null
  likelyContractModels: string | null
  qualificationOrBarriers: string | null
  evidenceSummary: string | null
  evidenceSources: string | null
  manualVerificationTask: string | null
  domainPayload: Record<string, string>
}

type DataforgeParsedRow =
  | {
      kind: 'row'
      account: DataforgeAccountRecord
      domain: DataforgeDomainRecord
      /**
       * La ligne telle qu'elle est, colonne → cellule. Elle sort d'ici parce
       * que l'audit de colonnes (`createColumnAudit`) doit compter ce qu'on
       * ÉCARTE : la recalculer demanderait de re-découper 345 Mo une seconde
       * fois, et un compteur qu'on n'ose pas payer est un compteur qu'on
       * n'écrit pas. Transitoire — rien ne la stocke.
       */
      raw: Record<string, string>
    }
  | { kind: 'rejected'; reason: string }

/**
 * Reconstitue les ENREGISTREMENTS d'un flux CSV, chunk par chunk : un retour à
 * la ligne à l'intérieur d'un champ cité ne termine pas l'enregistrement. À la
 * fin du flux, appeler `flush()` pour récupérer le dernier.
 */
export function createRecordAssembler(): {
  push(chunk: string): string[]
  flush(): string | null
} {
  let buffer = ''
  let inQuotes = false
  return {
    push(chunk: string): string[] {
      const records: string[] = []
      for (const char of chunk) {
        if (char === '"') inQuotes = !inQuotes
        if ((char === '\n' || char === '\r') && !inQuotes) {
          if (buffer.length > 0) records.push(buffer)
          buffer = ''
          continue
        }
        // Un retour à la ligne CITÉ reste dans le champ, tel quel.
        buffer += char
      }
      return records
    },
    flush(): string | null {
      const last = buffer.length > 0 ? buffer : null
      buffer = ''
      return last
    },
  }
}

/** L'en-tête, BOM retiré (le fichier en porte un, mesuré le 24/08). */
export function parseDataforgeHeader(record: string): string[] {
  return splitCsvLine(record.replace(/^\uFEFF/, ''), ';')
}

/**
 * `''` n'est pas une valeur — une cellule vide vaut `null`, jamais `''` ni 0.
 *
 * Exportée : réutilisée telle quelle par `orion-csv.ts` (mêmes règles
 * d'ingestion, même pack DATAFORGE) — l'écrire deux fois créerait deux
 * définitions de « vide » qui pourraient un jour diverger.
 */
export function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Un nombre illisible vaut `null`, jamais une valeur de remplissage (règle ats-parse). */
export function numberOrNull(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function intOrNull(value: string | undefined): number | null {
  const parsed = numberOrNull(value)
  return parsed === null ? null : Math.trunc(parsed)
}

export function boolFrom(value: string | undefined): boolean {
  const trimmed = (value ?? '').trim().toLowerCase()
  return trimmed === 'true' || trimmed === '1' || trimmed === 'yes'
}

/**
 * Le SIREN à 9 chiffres, dérivé de `account__siren_siret` : un SIRET (14
 * chiffres) porte son SIREN en tête ; toute autre forme rend `null` — on ne
 * devine pas un identifiant légal.
 */
export function sirenFrom(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 9) return digits
  if (digits.length === 14) return digits.slice(0, 9)
  return null
}

/**
 * Le nom, réduit à ce qui permet de le reconnaître d'un fichier à l'autre.
 * (Volontairement identique à `EsnDirectoryService.normalize` — l'importer
 * compterait un import service→service de plus au cliquet GA-07.)
 */
export function normalizeAccountName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Une ligne du CSV → un enregistrement compte + un enregistrement domaine.
 *
 * Refus NOMMÉS, jamais devinés : nombre de colonnes différent de l'en-tête,
 * identifiant ou domaine absent, tier hors de la liste fermée.
 */
export function parseDataforgeRecord(header: string[], record: string): DataforgeParsedRow {
  const cells = splitCsvLine(record, ';')
  if (cells.length !== header.length) {
    return { kind: 'rejected', reason: `colonnes: ${cells.length} au lieu de ${header.length}` }
  }
  const row: Record<string, string> = {}
  header.forEach((column, index) => {
    row[column] = cells[index] ?? ''
  })

  const sourceId = textOrNull(row['bellum_account_source_id'])
  const name = textOrNull(row['bellum_account_name'])
  const domainCode = textOrNull(row['bellum_domain_code'])
  const tier = textOrNull(row['bellum_evidence_tier'])
  if (!sourceId || !name) return { kind: 'rejected', reason: 'compte sans identifiant ou sans nom' }
  if (!domainCode) return { kind: 'rejected', reason: `domaine absent (compte ${sourceId})` }
  if (!tier || !(DATAFORGE_EVIDENCE_TIERS as readonly string[]).includes(tier)) {
    return { kind: 'rejected', reason: `tier inconnu « ${tier ?? ''} » (${sourceId} × ${domainCode})` }
  }

  const dataVersion = textOrNull(row['bellum_data_version']) ?? 'V10'
  const sirenSiretRaw = textOrNull(row['account__siren_siret'])

  // Le REGISTRE décide, plus une liste de préfixes : ce qu'il ne connaît pas
  // ressort en `unknown` (compté par l'audit) au lieu de tomber en silence —
  // c'est exactement ainsi que les 18 colonnes de la V10 avaient disparu.
  const accountPayload: Record<string, string> = {}
  const domainPayload: Record<string, string> = {}
  for (const [column, value] of Object.entries(row)) {
    if (value.trim().length === 0) continue
    const fate = classifyDataforgeColumn(column)
    if (fate.typed || fate.destination === 'discarded' || fate.destination === 'unknown') continue
    if (fate.destination === 'account') accountPayload[column] = value
    else domainPayload[column] = value
  }

  return {
    kind: 'row',
    raw: row,
    account: {
      dataVersion,
      sourceId,
      name,
      normalizedName: normalizeAccountName(name),
      groupName: textOrNull(row['bellum_group_name']),
      sector: textOrNull(row['bellum_sector']),
      clusterId: textOrNull(row['bellum_account_cluster_id']),
      clusterPrimaryId: textOrNull(row['bellum_cluster_primary_account_id']),
      isClusterPrimary: boolFrom(row['bellum_is_cluster_primary']),
      isDuplicateVariant: boolFrom(row['bellum_is_duplicate_variant']),
      siren: sirenFrom(sirenSiretRaw),
      sirenSiretRaw,
      website: textOrNull(row['account__website']),
      // La route achats vit au niveau COMPTE : mesurée identique sur les 66
      // domaines de chacun des 1 195 comptes — un seed, jamais une preuve.
      procurementRoute: textOrNull(row['domain__recommended_procurement_route']),
      procurementPolicy: textOrNull(row['bellum_procurement_policy']),
      procurementInheritanceWarning: textOrNull(row['bellum_procurement_inheritance_warning']),
      marketRole: textOrNull(row['account__account_market_role']),
      researchTier: textOrNull(row['account__v10_research_tier']),
      tierADomainCount: intOrNull(row['account__v10_tier_a_domain_count']),
      tierBDomainCount: intOrNull(row['account__v10_tier_b_domain_count']),
      accountPayload,
    },
    domain: {
      dataVersion,
      sourceId,
      domainCode,
      evidenceTier: tier as DataforgeEvidenceTier,
      evidenceStatus: textOrNull(row['bellum_evidence_status']),
      userClaimPolicy: textOrNull(row['bellum_user_claim_policy']),
      scoringPolicy: textOrNull(row['bellum_scoring_policy']),
      sectorPriorDemandScore: numberOrNull(row['domain__sector_prior_demand_score']),
      sectorPriorExternalizationScore: numberOrNull(row['domain__sector_prior_externalization_score']),
      publicActivitySignalScore: numberOrNull(row['domain__public_activity_signal_score']),
      demandIntensityScore: numberOrNull(row['domain__demand_intensity_score']),
      externalizableDemandScore: numberOrNull(row['domain__externalizable_demand_score']),
      internalCompetitionScore: numberOrNull(row['domain__internal_competition_score']),
      directAccessScore: numberOrNull(row['domain__direct_access_score']),
      mediatedAccessScore: numberOrNull(row['domain__mediated_access_score']),
      commercialOpportunityScore: numberOrNull(row['domain__commercial_opportunity_score']),
      dataConfidenceScore: numberOrNull(row['domain__data_confidence_score']),
      evidenceItemCount: intOrNull(row['domain__evidence_item_count']),
      strongestEvidenceStrength: textOrNull(row['domain__strongest_evidence_strength']),
      medianObservedTjm: numberOrNull(row['domain__median_observed_tjm']),
      buyerPersonas: textOrNull(row['domain__buyer_personas']),
      likelyContractModels: textOrNull(row['domain__likely_contract_models']),
      qualificationOrBarriers: textOrNull(row['domain__qualification_or_barriers']),
      evidenceSummary: textOrNull(row['bellum_evidence_summary']),
      evidenceSources: textOrNull(row['bellum_evidence_sources']),
      manualVerificationTask: textOrNull(row['bellum_manual_verification_task']),
      domainPayload,
    },
  }
}
