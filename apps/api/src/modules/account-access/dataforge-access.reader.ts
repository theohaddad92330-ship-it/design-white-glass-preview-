import {
  dataforgeAccountAccessSchema,
  dataforgeAccountAccessView,
  type DataforgeAccountAccess,
} from '@bellum/contracts'
import { grappeOf, sirenOf } from '../../common/dataforge-grappe'

type Query = <T>(sql: string, params: unknown[]) => Promise<T[]>

type StatusRow = {
  source_id: string
  siren_siret: string | null
  group_name: string | null
  cluster_id: string | null
  sales_accessibility_level: string | null
  barriere_plateforme: boolean | null
  barriere_publique: boolean | null
  referencing_process_found: string | null
  supplier_portal: string | null
  priority_level: string | null
  updated_at: Date | string | null
}

const isoOf = (value: Date | string | null): string | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Lot 776 — « Accès au compte · Base commune » : les statuts d'accès d'une fiche de la base commune, par SIREN seulement
 * (jamais par nom), via la MÊME règle de grappe que l'Historique (`common/dataforge-grappe`, GA-26). Une fiche doublon
 * n'est jamais lue ; des fiches de groupes différents, ou d'une grappe qui se contredit, ne se devinent pas : `null`.
 * Aucune donnée de personne n'est lue ici — les colonnes sont énumérées, ni nom, ni e-mail, ni téléphone, ni lien.
 *
 * `null` = pas de bloc (jamais « 0 »). Repli : `raw_analysis.dataforge_access`, le bloc que la démo sème.
 */
export async function readDataforgeAccess(
  query: Query,
  input: { siren: string | null; groupHeadSiren: string | null; rawAnalysis: unknown },
): Promise<DataforgeAccountAccess | null> {
  const sirens = [input.siren, input.groupHeadSiren]
    .map(value => sirenOf(value))
    .filter((value): value is string => !!value)
  const seeded = (): DataforgeAccountAccess | null => {
    const candidate = (input.rawAnalysis as Record<string, unknown> | null)?.['dataforge_access']
    const parsed = dataforgeAccountAccessSchema.safeParse(candidate)
    return parsed.success ? parsed.data : null
  }
  if (sirens.length === 0) return seeded()
  let rows: StatusRow[]
  try {
    rows = await query<StatusRow>(
      `SELECT source_id, siren_siret, group_name, v10_cluster_id AS cluster_id, sales_accessibility_level,
              barriere_plateforme, barriere_publique, referencing_process_found, supplier_portal, priority_level, updated_at
         FROM dataforge_account_statuses
        WHERE left(regexp_replace(coalesce(siren_siret, ''), '\\D', '', 'g'), 9) = ANY($1::text[])
          AND NOT COALESCE(est_doublon, false)
        ORDER BY source_id`,
      [sirens],
    )
  } catch {
    return seeded()
  }
  // Le SIREN du compte d'abord ; celui de la tête de groupe seulement à défaut.
  for (const siren of sirens) {
    const ofSiren = rows.filter(row => sirenOf(row.siren_siret) === siren)
    if (ofSiren.length === 0) continue
    const grappe = grappeOf(ofSiren)
    if (!grappe) return null
    const views = grappe.map(row =>
      dataforgeAccountAccessView({
        salesAccessibilityLevel: row.sales_accessibility_level,
        barrierePlateforme: row.barriere_plateforme === true,
        barrierePublique: row.barriere_publique === true,
        referencingProcessFound: row.referencing_process_found,
        supplierPortal: row.supplier_portal,
        priorityLevel: row.priority_level,
        observedAt: isoOf(row.updated_at),
      }),
    )
    const distinct = new Set(views.map(view => JSON.stringify({ ...view, observedAt: null })))
    if (distinct.size !== 1) return null
    return views[0] ?? null
  }
  return seeded()
}
