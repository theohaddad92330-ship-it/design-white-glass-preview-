import { duplicatePairKey } from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { pickSameCompanyAccount, type SameCompanyCandidate } from './same-company-account'

/**
 * #4603 — le RATTRAPAGE des paires déjà créées : compte venu du CRM ↔ compte créé par l'analyse, même société.
 *
 * ⚠️⚠️ RENVERSEMENT DE DOCTRINE DATÉ — Louis, 26/10/2026, ratifié en connaissance de la règle qui lui a été
 * citée (`c37_fusion_doublons` : « On PROPOSE une fusion de doublons, on ne fusionne JAMAIS »). Pour CE cas
 * seulement, la paire est FUSIONNÉE AUTOMATIQUEMENT, sans demander. Registre :
 * `c142_fusion_auto_compte_crm_compte_analyse` (GA-38). Portée tenue serrée, ici :
 *  - une paire = une fiche venue du CRM (`crmSide`) SANS aucun run, et une fiche qui porte au moins un run
 *    d'analyse. Deux comptes de même nom d'origines quelconques ne forment PAS une paire : ils restent
 *    PROPOSÉS (balayeur des doublons, `absorbAccount`) ;
 *  - la clé est celle de la prévention (`pickSameCompanyAccount` : SIREN d'abord, puis `marketMatchKey`) ;
 *    plus d'un compte analysé possible → ambigu, rien n'est fusionné ;
 *  - une CORRECTION HUMAINE gagne toujours : une paire déjà tranchée par un humain (fusion annulée, paire
 *    écartée au balayeur des doublons) ou une fiche CRM triée à la main (étape commerciale posée, différente
 *    de celle du compte analysé) n'est jamais fusionnée — elle est comptée, nommée, laissée.
 *
 * Ce fichier ne lit ni n'écrit rien : il DÉCIDE. L'écriture (`AccountCrmFusionService`) archive la fiche
 * absorbée (jamais supprimée), déplace l'UNION (contacts, affaires, activités, runs, notes, liens CRM) et
 * journalise la fusion avec les deux identifiants et la clé qui a décidé — réversible.
 */
export type FusionCandidate = SameCompanyCandidate & {
  /** Venue du CRM : `origin` crm/import, statut `imported`, ou une référence externe de compte. */
  crm_side: boolean
  commercial_status: string | null
}

export type CrmFusionPair = {
  keptId: string
  keptName: string
  absorbedId: string
  absorbedName: string
  basis: 'siren' | 'name'
  key: string
}

type CrmFusionPlan = {
  pairs: CrmFusionPair[]
  /** Plus d'un compte analysé pour la même clé : on ne devine pas lequel garder. */
  ambiguous: number
  /** Une décision humaine les tient à l'écart (fusion annulée, paire écartée, tri commercial divergent). */
  humanDecided: number
  /** Paires trouvées au-delà de la borne du passage : elles attendent le suivant, jamais tout le parc d'un coup. */
  deferred: number
}

/** L'étape commerciale de colonne : une fiche qui la porte encore n'a pas été triée à la main. */
const UNTRIAGED_COMMERCIAL_STATUSES: readonly (string | null)[] = [null, 'inbox']

function isCrmShell(row: FusionCandidate): boolean {
  return row.crm_side && !row.has_runs && row.status !== 'deleted'
}

function isAnalysed(row: FusionCandidate): boolean {
  return row.has_runs && row.status !== 'deleted'
}

function triagedDifferently(crm: FusionCandidate, kept: FusionCandidate): boolean {
  if (UNTRIAGED_COMMERCIAL_STATUSES.includes(crm.commercial_status)) return false
  return crm.commercial_status !== kept.commercial_status
}

export function planCrmFusionPairs(
  rows: readonly FusionCandidate[],
  options: { humanDecidedPairKeys: ReadonlySet<string>; limit: number },
): CrmFusionPlan {
  const analysed = rows.filter(isAnalysed)
  const found: CrmFusionPair[] = []
  let ambiguous = 0
  let humanDecided = 0

  for (const crm of rows.filter(isCrmShell)) {
    const query = { companyName: crm.company_name ?? '', siren: crm.siren }
    const matches = analysed
      .map(candidate => pickSameCompanyAccount([candidate], query))
      .filter((pick): pick is NonNullable<typeof pick> => pick !== null)
    if (matches.length === 0) continue
    if (matches.length > 1) {
      ambiguous += 1
      continue
    }
    const { account: kept, basis, key } = matches[0]
    if (options.humanDecidedPairKeys.has(duplicatePairKey(kept.id, crm.id)) || triagedDifferently(crm, kept)) {
      humanDecided += 1
      continue
    }
    found.push({
      keptId: kept.id,
      keptName: kept.company_name ?? '',
      absorbedId: crm.id,
      absorbedName: crm.company_name ?? '',
      basis,
      key,
    })
  }

  const limit = Math.max(0, Math.trunc(options.limit))
  return { pairs: found.slice(0, limit), ambiguous, humanDecided, deferred: Math.max(0, found.length - limit) }
}

/**
 * Les familles que la fusion DÉPLACE vers la fiche gardée — l'union : rien ne se perd. Chacune est
 * bornée à l'espace (`workspace_id`, ou la ligne héritée sans espace quand la colonne est nullable) ET à la
 * fiche absorbée, jamais un `where id` seul. Les identifiants déplacés sont écrits au journal : c'est la
 * condition du retour arrière.
 *
 * Les CONTACTS homonymes d'un contact déjà présent sur la fiche gardée restent sur la fiche archivée (index
 * unique `idx_contacts_account_normalized_name`) : lisibles, jamais écrasés — comme `absorbAccount`.
 */
export const CRM_FUSION_FAMILIES = [
  {
    family: 'contacts',
    table: 'contacts',
    column: 'account_id',
    scope: 't.workspace_id = $1',
    extra: `AND NOT EXISTS (
              SELECT 1 FROM contacts kept
               WHERE kept.account_id = $2
                 AND bellum_normalize_name(kept.full_name) = bellum_normalize_name(t.full_name)
            )`,
  },
  {
    family: 'deals',
    table: 'opportunities',
    column: 'account_id',
    scope: '(t.workspace_id = $1 OR t.workspace_id IS NULL)',
    extra: '',
  },
  { family: 'crm_deals', table: 'crm_deals', column: 'account_id', scope: 't.workspace_id = $1', extra: '' },
  { family: 'crm_deal_facts', table: 'crm_deal_facts', column: 'account_id', scope: 't.workspace_id = $1', extra: '' },
  {
    family: 'activities',
    table: 'activities',
    column: 'account_id',
    scope: '(t.workspace_id = $1 OR t.workspace_id IS NULL)',
    extra: '',
  },
  { family: 'crm_activities', table: 'crm_activities', column: 'account_id', scope: 't.workspace_id = $1', extra: '' },
  {
    family: 'runs',
    table: 'analysis_runs',
    column: 'account_id',
    scope: '(t.workspace_id = $1 OR t.workspace_id IS NULL)',
    extra: '',
  },
  {
    family: 'notes',
    table: 'notes',
    column: 'entity_id',
    scope: "t.workspace_id IS NOT DISTINCT FROM $1 AND t.entity_type = 'account'",
    extra: '',
  },
  {
    family: 'crm_links',
    table: 'sync_links',
    column: 'internal_id',
    scope: "t.workspace_id = $1 AND t.entity_type = 'account'",
    extra: '',
  },
] as const

export type CrmFusionMoved = Partial<Record<(typeof CRM_FUSION_FAMILIES)[number]['family'], string[]>>

type CrmFusionFamily = (typeof CRM_FUSION_FAMILIES)[number]
type CrmFusionQueryRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

/** `$1` espace, `$2` fiche cible, `$3` fiche source. Rend les identifiants déplacés. */
export function crmFusionMoveSql(family: (typeof CRM_FUSION_FAMILIES)[number]): string {
  return `UPDATE ${family.table} t SET ${family.column} = $2
           WHERE ${family.scope} AND t.${family.column} = $3 ${family.extra}
          RETURNING t.id`
}

/** #4783 — les identifiants déplacés, lus par `returnedRows` : un `UPDATE … RETURNING` rend `[lignes, nombre]`. */
export async function moveCrmFusionFamily(
  runner: CrmFusionQueryRunner,
  family: CrmFusionFamily,
  params: [workspaceId: string, keptId: string, absorbedId: string],
): Promise<string[]> {
  return returnedRows<{ id: string }>(await runner.query(crmFusionMoveSql(family), params)).map(row => row.id)
}

/** Le retour arrière d'une famille : seules les lignes JOURNALISÉES et encore sur la fiche gardée reviennent. */
export function crmFusionUndoSql(family: (typeof CRM_FUSION_FAMILIES)[number]): string {
  return `UPDATE ${family.table} t SET ${family.column} = $3
           WHERE ${family.scope} AND t.${family.column} = $2 AND t.id = ANY($4::uuid[])
          RETURNING t.id`
}

/** #4783 — combien de lignes sont réellement revenues, lu par `returnedRows` (jamais `result.length` à la main). */
export async function undoCrmFusionFamily(
  runner: CrmFusionQueryRunner,
  family: CrmFusionFamily,
  params: [workspaceId: string, keptId: string, absorbedId: string, ids: string[]],
): Promise<number> {
  return returnedRows<{ id: string }>(await runner.query(crmFusionUndoSql(family), params)).length
}
