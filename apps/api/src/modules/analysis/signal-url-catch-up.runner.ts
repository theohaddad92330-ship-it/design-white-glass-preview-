import type { EntityManager } from 'typeorm'
import { returnedRows } from '../../database/returned-rows'
import { backfillRecruitmentUrls } from './recruitment-signal-url.backfill'

/**
 * #4045.1 — LE RATTRAPAGE DES LIENS D'OFFRE (Louis 12/10), cœur testable de
 * `scripts/signal-url-catch-up.ts`.
 *
 * Doctrine « un correctif de collecte rattrape l'existant » : CIBLÉ (comptes dont la collecte des
 * signaux est antérieure à la capacité, qui portent des offres brutes), PAR SEGMENT (le seul
 * champ `url` des signaux de recrutement — jamais une analyse entière, `signals_collected_at` ne
 * bouge pas), jamais au déploiement. SANS RÉSEAU : l'URL est déjà stockée
 * (`raw_analysis.it_job_signals`), on la recopie ; ambiguïté → rien. Les signaux déclarés par un
 * humain (`declared_signals`) sont une autre colonne, jamais lue ici.
 */
export const URL_CAPABILITY_AT = '2026-10-12T00:00:00.000Z'

type SignalUrlCatchUpRow = {
  id: string
  workspace_id: string | null
  recent_signals: unknown
  /** La copie `raw_analysis.recent_signals`, patchée à part : elle peut différer de la colonne. */
  raw_signals?: unknown
  jobs: unknown
}

export type SignalUrlCatchUpPort = {
  /** Page de comptes concernés, triés par id, strictement après `afterId`. */
  listPage(afterId: string | null, pageSize: number, workspaceId?: string): Promise<SignalUrlCatchUpRow[]>
  /** Écrit les signaux patchés ; `false` si le compte a été réécrit entre-temps (rien écrit). */
  save(id: string, previous: unknown, next: unknown, rawNext?: unknown): Promise<boolean>
}

type SignalUrlCatchUpReport = {
  mode: 'simulation' | 'applique'
  accounts: number
  signals: number
  ambiguous: number
  written: number
  skippedConcurrent: number
  byWorkspace: Record<string, number>
  networkCalls: 0
  credits: 0
}

export async function runSignalUrlCatchUp(args: {
  port: SignalUrlCatchUpPort
  apply: boolean
  workspaceId?: string
  limit?: number
  pageSize?: number
}): Promise<SignalUrlCatchUpReport> {
  const pageSize = args.pageSize ?? 200
  const limit = args.limit === undefined ? Infinity : Math.max(0, Math.floor(args.limit))
  const report: SignalUrlCatchUpReport = {
    mode: args.apply ? 'applique' : 'simulation',
    accounts: 0,
    signals: 0,
    ambiguous: 0,
    written: 0,
    skippedConcurrent: 0,
    byWorkspace: {},
    networkCalls: 0,
    credits: 0,
  }
  let after: string | null = null
  while (report.accounts < limit) {
    const page = await args.port.listPage(after, pageSize, args.workspaceId)
    if (page.length === 0) break
    for (const row of page) {
      after = row.id
      if (report.accounts >= limit) break
      if (args.workspaceId && row.workspace_id !== args.workspaceId) continue
      const result = backfillRecruitmentUrls(row.recent_signals, row.jobs)
      report.ambiguous += result.ambiguous
      if (result.patched === 0) continue
      report.accounts += 1
      report.signals += result.patched
      const space = row.workspace_id ?? 'sans-espace'
      report.byWorkspace[space] = (report.byWorkspace[space] ?? 0) + result.patched
      if (!args.apply) continue
      const rawPatched = Array.isArray(row.raw_signals) ? backfillRecruitmentUrls(row.raw_signals, row.jobs) : null
      const rawNext = rawPatched && rawPatched.patched > 0 ? rawPatched.signals : undefined
      if (await args.port.save(row.id, row.recent_signals, result.signals, rawNext)) report.written += 1
      else report.skippedConcurrent += 1
    }
    if (page.length < pageSize) break
  }
  return report
}

export function formatSignalUrlCatchUpReport(report: SignalUrlCatchUpReport): string {
  const head =
    report.mode === 'simulation'
      ? 'SIMULATION — rien n’est écrit (relancer avec --appliquer pour recopier les liens).'
      : `APPLIQUÉ — ${report.written} compte(s) mis à jour.`
  const spaces = Object.entries(report.byWorkspace).map(([space, count]) => `  ${space} : ${count} signal(aux)`)
  return [
    head,
    `Comptes visés : ${report.accounts} · signaux de recrutement à lier : ${report.signals}`,
    ...(spaces.length > 0 ? ['Par espace :', ...spaces] : []),
    `Ambigus (laissés sans lien, jamais devinés) : ${report.ambiguous}`,
    ...(report.skippedConcurrent > 0 ? [`Réécrits entre-temps (relancer) : ${report.skippedConcurrent}`] : []),
    `Appels réseau : ${report.networkCalls}`,
    `Crédits débités : ${report.credits}`,
  ].join('\n')
}

/** Le port SQL : les comptes dont la collecte des signaux précède la capacité ET qui portent des offres. */
export function sqlSignalUrlCatchUpPort(manager: EntityManager): SignalUrlCatchUpPort {
  return {
    async listPage(afterId, pageSize, workspaceId) {
      return manager.query<SignalUrlCatchUpRow[]>(
        `SELECT a.id, a.workspace_id, a.recent_signals,
                a.raw_analysis -> 'recent_signals' AS raw_signals, a.raw_analysis -> 'it_job_signals' AS jobs
           FROM accounts a
          WHERE a.status <> 'deleted'
            AND (a.signals_collected_at IS NULL OR a.signals_collected_at < $1)
            AND jsonb_typeof(a.raw_analysis -> 'it_job_signals') = 'array'
            AND jsonb_array_length(a.raw_analysis -> 'it_job_signals') > 0
            AND jsonb_typeof(a.recent_signals) = 'array'
            AND ($2::uuid IS NULL OR a.id > $2::uuid)
            AND ($3::uuid IS NULL OR a.workspace_id = $3::uuid)
            AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = a.workspace_id AND w.is_demo = true)
          ORDER BY a.id
          LIMIT $4`,
        [URL_CAPABILITY_AT, afterId, workspaceId ?? null, pageSize],
      )
    },
    async save(id, previous, next, rawNext) {
      // Garde optimiste : si une analyse a réécrit `recent_signals` entre la lecture et l'écriture,
      // on n'écrase rien. La copie `raw_analysis.recent_signals` suit, quand elle existe.
      const updated = await manager.query(
        `UPDATE accounts
            SET recent_signals = $3::jsonb,
                raw_analysis = CASE WHEN $4::jsonb IS NOT NULL
                                    THEN jsonb_set(raw_analysis, '{recent_signals}', $4::jsonb)
                                    ELSE raw_analysis END
          WHERE id = $1 AND recent_signals = $2::jsonb
          RETURNING id`,
        [id, JSON.stringify(previous), JSON.stringify(next), rawNext === undefined ? null : JSON.stringify(rawNext)],
      )
      // Forme pg d'un UPDATE … RETURNING : [lignes, nombre] — d'où returnedRows (garde returned-rows.spec).
      return returnedRows<{ id: string }>(updated).length > 0
    },
  }
}
