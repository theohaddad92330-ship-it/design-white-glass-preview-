import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import { HttpError, HttpTimeoutError } from '@bellum/errors'
import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'
import { IaClient } from '../ia/ia.client'
import { addCostToLatestAnalysisRun } from './analysis-run-cost'
import { COMMERCIAL_BRIEF_CONTEXT_SOURCE, type CommercialBriefContextSource } from './commercial-brief-context-source'

/**
 * Chantier « briefs comptes » (01/10/2026) — l'étape 5 du pipeline d'analyse :
 * le BRIEF COMMERCIAL de tout compte payant (`agent_docs/pipeline.md`).
 *
 * Ce que le CEO a fait à la main sur Engie, BPCE et SG : le dossier public
 * (ce que les phases 1-4 ont DÉJÀ écrit dans `raw_analysis` — aucune collecte
 * neuve), croisé avec les faits internes (façade #1618 : mémoire marché,
 * référentiel, siège résolu), interprété ligne à ligne par le service IA
 * (`POST /commercial-brief`), puis CONTRÔLÉ ici :
 *
 * - forme : `commercialBriefSchema` (contrat fermé) ;
 * - métier : `checkCommercialBrief` (France, siège contredit, entité sortie
 *   non marquée, prix moyenné, ESN sans preuve, notre propre activité…) ;
 * - siège du dossier : la ville du brief doit figurer dans le siège RÉSOLU du
 *   compte quand il est connu — l'incident « Strasbourg comme siège de BPCE »
 *   venait d'un fichier brut, pas d'une contradiction interne au brief.
 *
 * 0 violation ⇒ `raw_analysis.commercial_brief` (lu par l'écran « Ce que je
 * sais »). ≥ 1 violation ⇒ RIEN n'est écrit, les CODES sont journalisés —
 * jamais le contenu (il vient du dossier du client) — et le dossier reste sans
 * onglet : on n'affiche pas ce qu'on n'a pas.
 *
 * Entièrement best-effort, comme `recordNeedProposals` : appelé APRÈS
 * `analysis:done`, il ne jette jamais. Le dossier vaut plus que son brief.
 */

/** Ce que rend une exécution — pour le test et la ligne de journal. */
export type CommercialBriefOutcome = 'written' | 'rejected' | 'failed' | 'disabled' | 'skipped' | 'exists'

/** Rattrapage : l'UPDATE lui-même refuse d'écraser un brief apparu entre la
 *  lecture et l'écriture (deux rattrapages concurrents, ou une analyse). */
const KEEP_EXISTING_GUARD = ` AND NOT (COALESCE(raw_analysis, '{}'::jsonb) ? 'commercial_brief')`

/**
 * Les clés de `raw_analysis` qui décrivent le COMPTE (contrat
 * `accountAnalysisSchema`). Liste BLANCHE, à dessein : notre plan, nos angles,
 * nos messages, nos scores, le verdict du juge et la télémétrie ne décrivent
 * pas le compte — « zéro donnée de notre propre performance » — et une clé
 * neuve n'entre pas en silence dans un prompt payant. `pappers_url` reste
 * dehors : nos fournisseurs ne se nomment jamais.
 */
export const DOSSIER_FACT_KEYS = [
  'description',
  'business_description',
  'activity_label',
  'corporate_purpose',
  'legal_form',
  'capital',
  'creation_date',
  'executives',
  'c_level',
  'subsidiaries',
  'branches',
  'entities_exhaustive',
  'sites_france',
  'structural_reading_axes',
  'financials_history',
  'financial_indicators',
  'contract_model',
  'access_barrier',
  'program_names',
  'technology_stack',
  'detected_tech_stack',
  'competitors',
  'ecosystem_third_parties',
  'pains',
  'it_challenges',
  'it_implications_for_esn',
  'opportunity_domains',
  'recent_signals',
  'it_job_signals',
  'public_tenders',
  'awarded_contracts',
  'data_reliability_notes',
  'org',
] as const

/** Code local, en plus de ceux de `checkCommercialBrief` : le siège du brief
 *  ne figure pas dans le siège résolu du compte. */
const HQ_CONTRADICTS_RECORD = 'HQ_CONTRADICTS_RECORD'

/** Minuscules, sans accents, ponctuation → espace (même forme que les contrôles). */
const norm = (value: unknown): string =>
  typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : ''

/** « Paris 13e », « Paris Cedex 07 » → « paris ». */
const normCity = (value: unknown): string =>
  norm(value)
    .replace(/\s+cedex(\s+\d+)?$/, '')
    .replace(/\s+\d{1,5}\s*(e|er|eme)?$/, '')
    .trim()

/**
 * Ce qu'on peut dire d'un échec de l'appel IA sans jamais citer le dossier :
 * `timeout`, ou `status` HTTP + `detail` (le code court de FastAPI, ex.
 * `commercial_brief_failed` — accepté seulement s'il a la forme d'un code).
 */
function describeIaFailure(err: unknown): { status?: number; detail?: string } {
  let current: unknown = err
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (current instanceof HttpTimeoutError) return { detail: 'timeout' }
    if (current instanceof HttpError) {
      let detail: string | undefined
      try {
        const parsed: unknown = JSON.parse(current.body)
        const candidate = (parsed as { detail?: unknown } | null)?.detail
        if (typeof candidate === 'string' && /^[a-z0-9_]{1,80}$/.test(candidate)) detail = candidate
      } catch {
        // corps non JSON : on ne le recopie pas.
      }
      return { status: current.status, ...(detail ? { detail } : {}) }
    }
    current = (current as { cause?: unknown }).cause
  }
  return {}
}

@Injectable()
export class CommercialBriefStep {
  private readonly logger = new Logger(CommercialBriefStep.name)

  constructor(
    private readonly ia: IaClient,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    // `@Optional()` : sans la façade, le brief se fait sur le seul dossier —
    // le module reste retirable (craft rule 7), aucun fait interne inventé.
    @Optional() @Inject(COMMERCIAL_BRIEF_CONTEXT_SOURCE) private readonly context?: CommercialBriefContextSource,
  ) {}

  /** Activé par défaut — voir `COMMERCIAL_BRIEF_ENABLED` dans `agent_docs/env-reference.md`. */
  private enabled(): boolean {
    const raw = String(this.config.get<string>('COMMERCIAL_BRIEF_ENABLED') ?? '')
      .trim()
      .toLowerCase()
    return !['false', '0', 'off', 'no'].includes(raw)
  }

  /**
   * `keepExisting` (rattrapage, point 45) : un brief DÉJÀ écrit reste intact —
   * ni appel modèle, ni écriture, ni coût. Le worker, lui, ne le passe pas : une
   * nouvelle analyse remplace le brief du dossier qu'elle vient de refaire.
   */
  async produceCommercialBrief(
    accountId: string,
    workspaceId: string | null,
    opts: { keepExisting?: boolean } = {},
  ): Promise<CommercialBriefOutcome> {
    if (!this.enabled()) return 'disabled'
    // La façade des faits internes exige un espace, et la lecture du dossier
    // se scope dessus (`where: { id, workspace_id }`, jamais `id` seul).
    if (!workspaceId) return 'skipped'
    try {
      const rows: Array<{
        company_name: string | null
        website?: string | null
        raw_analysis: Record<string, unknown> | null
      }> = await this.dataSource.query(
        'SELECT company_name, website, raw_analysis FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1',
        [accountId, workspaceId],
      )
      const row = rows[0]
      const accountName = row?.company_name?.trim()
      if (!row || !accountName) return 'skipped'

      const raw = row.raw_analysis ?? {}
      if (opts.keepExisting && raw.commercial_brief != null) return 'exists'
      const dossier: Record<string, unknown> = {}
      for (const key of DOSSIER_FACT_KEYS) {
        if (raw[key] != null) dossier[key] = raw[key]
      }
      // Le site connu du compte (colonne `accounts.website`, hors `raw_analysis`) :
      // sans lui l'IA ne saurait pas qu'il manque (enrichissement en ligne, point 44).
      const website = row.website?.trim()
      if (website) dossier.website = website
      const internal = (await this.context?.contextFor(accountId, workspaceId)) ?? null

      const result = await this.ia.commercialBrief({
        accountName,
        headquarters: internal?.headquarters ?? null,
        dossier,
        internalFacts: internal?.internalFacts ?? {},
      })

      // Point 46 — l'appel a coûté, quel que soit le sort du brief (rejeté compris).
      await addCostToLatestAnalysisRun(this.dataSource, this.logger, accountId, result.costUsd)

      const parsed = commercialBriefSchema.safeParse(result.brief)
      if (!parsed.success) return this.reject(accountId, ['OFF_CONTRACT'])
      const codes = [
        ...checkCommercialBrief(parsed.data).map(v => v.code),
        ...this.checkAgainstRecord(parsed.data, internal?.headquarters?.value ?? null),
      ]
      if (codes.length > 0) return this.reject(accountId, codes)

      await this.dataSource.query(
        `UPDATE accounts
            SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('commercial_brief', $1::jsonb)
          WHERE id = $2 AND workspace_id = $3${opts.keepExisting ? KEEP_EXISTING_GUARD : ''}`,
        [JSON.stringify(parsed.data), accountId, workspaceId],
      )
      this.logger.log('Brief commercial écrit', {
        accountId,
        inputChars: result.inputChars,
        costUsd: result.costUsd,
      })
      return 'written'
    } catch (err) {
      // Classe d'erreur seulement : un message d'erreur peut citer le dossier.
      // 12/10/2026 — l'échec était muet (« TechnicalError » seul) : on ajoute le
      // statut HTTP et le CODE `detail` de l'IA (ou `timeout`), jamais le corps.
      this.logger.warn('Brief commercial non produit (non bloquant)', {
        accountId,
        error: err instanceof Error ? err.name : 'unknown',
        ...describeIaFailure(err),
      })
      await this.recordFailure(accountId, workspaceId)
      return 'failed'
    }
  }

  /**
   * 15/10/2026 — 0 compte sur 79 avait un brief, sans trace côté dossier : l'échec
   * se COMPTE dans `raw_analysis._api_metrics.commercial_brief_status` (la valeur
   * `failed`). Aucun brief n'est écrit — un onglet absent reste absent. Best-effort :
   * si le compteur échoue à son tour, le step ne jette pas.
   */
  private async recordFailure(accountId: string, workspaceId: string): Promise<void> {
    try {
      await this.dataSource.query(
        `UPDATE accounts
            SET raw_analysis = jsonb_set(
              COALESCE(raw_analysis, '{}'::jsonb),
              '{_api_metrics}',
              (CASE WHEN jsonb_typeof(raw_analysis->'_api_metrics') = 'object' THEN raw_analysis->'_api_metrics' ELSE '{}'::jsonb END)
                || jsonb_build_object('commercial_brief_status', $1::text)
            )
          WHERE id = $2 AND workspace_id = $3`,
        ['failed', accountId, workspaceId],
      )
    } catch (err) {
      this.logger.warn('Compteur d’échec du brief non écrit (non bloquant)', {
        accountId,
        error: err instanceof Error ? err.name : 'unknown',
      })
    }
  }

  /** Le siège du brief doit figurer dans le siège résolu du compte, quand il
   *  est connu. Inconnu ⇒ aucun contrôle inventé (les contrôles du brief
   *  lui-même tiennent toujours). */
  private checkAgainstRecord(brief: CommercialBrief, resolvedHeadquarters: string | null): string[] {
    const record = norm(resolvedHeadquarters)
    const city = normCity(brief.headquarters.city)
    if (!record || !city) return []
    return ` ${record} `.includes(` ${city} `) ? [] : [HQ_CONTRADICTS_RECORD]
  }

  private reject(accountId: string, codes: string[]): CommercialBriefOutcome {
    // Les CODES, jamais le contenu : il vient du dossier du client.
    this.logger.warn('Brief commercial rejeté par ses contrôles — non écrit', {
      accountId,
      codes: [...new Set(codes)],
    })
    return 'rejected'
  }
}
