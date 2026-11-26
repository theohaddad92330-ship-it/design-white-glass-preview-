import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import {
  ORG_ENRICHMENT_PROMPT_VERSION,
  ORG_ENRICHMENT_WAVE_SIZE,
  creditCostOf,
  deriveOrgEnrichmentJobStatus,
  nextOrgEnrichmentWave,
  sumOrgEnrichmentActualCredits,
  type OrgEnrichmentJob,
  type OrgEnrichmentTargetParams,
  type OrgEnrichmentWave,
} from '@bellum/contracts'
import { OrgEnrichmentJobEntity } from '../../database/entities/org-enrichment-job.entity'
import { OrgEnrichmentPlannerService, type OrgEnrichmentFailure } from './org-enrichment-planner.service'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

/** Ce que les trois portes rendent : le job, et ce que la vague vient de faire. */
type OrgEnrichmentJobStep = {
  job: OrgEnrichmentJob
  /** `null` quand rien n'a été lancé (le job était déjà fini). */
  ranWave: { index: number; matched: number; creditsDebited: number } | null
}

/**
 * Le planificateur d'enrichissement d'organigramme, PERSISTANT (§11 FINAL).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET CE QUE ÇA COÛTAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `OrgEnrichmentPlannerService` savait estimer et lancer UNE vague. Rien
 * n'était écrit : une vague qui tombait au milieu d'un plan complet ne laissait
 * aucune trace, et « reprendre » consistait à recliquer le même mode en
 * espérant que le filtre `family IS NULL` refasse la même sélection. Ça marche
 * tant que rien n'échoue — c'est-à-dire que ce n'est pas une reprise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS, ET CE QUI LES TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Les lots sont FIGÉS à la création** (D813). Un job crée toutes ses vagues
 *    d'un coup, avec leurs `contactIds`. Un « reprendre » relance exactement le
 *    périmètre annoncé — jamais un nouveau tirage, qui ferait dériver le coût
 *    déjà affiché sous les yeux de l'utilisateur.
 * 2. **La reprise est le comportement PAR DÉFAUT.** Rappeler la même porte sur
 *    le même compte ne crée pas un second job : elle reprend celui qui n'est pas
 *    fini. Créer un job par clic aurait produit des plans concurrents sur les
 *    mêmes personnes, chacun payant sa part.
 * 3. **Le débit reste APRÈS le succès**, parce que le lancement passe par
 *    `OrgEnrichmentPlannerService.runWave` — le MÊME code que le bouton déjà
 *    livré. Aucun second chemin de débit n'existe, donc aucun ne peut diverger.
 *
 * ⚠️ **`estimated_credits` et `actual_credits` sont deux colonnes.** Le premier
 * est figé à la création, le second s'accumule vague après vague — et vaut
 * `null` tant que rien n'a abouti, jamais `0`. Une vague `failed` n'a rien
 * débité qu'on sache : elle sort du total et se compte à part
 * (`sumOrgEnrichmentActualCredits`), exactement comme une ligne non tarifée du
 * registre de coûts fournisseurs.
 */
@Injectable()
export class OrgEnrichmentJobService {
  private readonly logger = new Logger(OrgEnrichmentJobService.name)

  /** Les états d'un job qu'on peut encore faire avancer. */
  private static readonly RESUMABLE = ['pending', 'running', 'partial', 'failed'] as const

  constructor(
    @InjectRepository(OrgEnrichmentJobEntity)
    private readonly jobs: Repository<OrgEnrichmentJobEntity>,
    private readonly planner: OrgEnrichmentPlannerService,
  ) {}

  /**
   * Créer OU reprendre le job de ce mode, puis lancer sa prochaine vague.
   *
   * C'est le corps unique des trois portes (`enrich-next`, `enrich-entity`,
   * `enrich-gaps`) : elles ne diffèrent que par les `params` qu'elles
   * composent, jamais par ce qu'elles font ensuite.
   *
   * #2637.1 (21/09/2026, décision Louis) — `opts.free` porte la gratuité du
   * rattrapage AUTOMATIQUE des rôles manquants (`MissingRolesCatchupService`,
   * seul appelant), jamais un réglage du service ni du mode : les trois
   * portes ci-dessus — y compris `enrich-gaps`, MÊME mode `missing_roles` —
   * n'appellent jamais `advance` avec cette option, et continuent donc de
   * vérifier le crédit et de débiter normalement. Voir `create` et `runNext`.
   */
  async advance(
    accountId: string,
    userId: string,
    params: OrgEnrichmentTargetParams,
    batchSize?: number,
    opts?: { free?: boolean },
  ): Promise<Result<OrgEnrichmentJobStep, OrgEnrichmentFailure>> {
    const free = opts?.free ?? false
    const existing = await this.findResumable(accountId, userId, params.mode)
    const jobResult = existing ? success(existing) : await this.create(accountId, userId, params, batchSize, free)
    if (isFailure(jobResult)) return failure(jobResult.problem)

    return this.runNext(jobResult.output, userId, free)
  }

  /** L'historique d'un compte — le plus récent d'abord. */
  async list(accountId: string, userId: string): Promise<Result<OrgEnrichmentJob[], OrgEnrichmentFailure>> {
    const scope = await this.resolveScope(accountId, userId)
    if (isFailure(scope)) return failure(scope.problem)

    const rows = await this.jobs.find({
      where: { account_id: accountId, workspace_id: scope.output.workspaceId },
      order: { created_at: 'DESC' },
      take: 20,
    })
    return success(rows.map(toContract))
  }

  /**
   * Créer le job : estimer, découper en vagues FIGÉES, écrire.
   *
   * Rien n'est lancé ici et rien n'est débité — la création est un engagement
   * de périmètre, pas une dépense. Un périmètre vide REFUSE plutôt que d'écrire
   * un job sans vague : un job qui n'a rien à faire n'est pas un job.
   */
  private async create(
    accountId: string,
    userId: string,
    params: OrgEnrichmentTargetParams,
    batchSize: number | undefined,
    free: boolean,
  ): Promise<Result<OrgEnrichmentJobEntity, OrgEnrichmentFailure>> {
    const resolved = await this.planner.resolveSelection(accountId, userId, params)
    if (isFailure(resolved)) return failure(resolved.problem)
    const { account, selection } = resolved.output

    if (!account.workspace_id) {
      return failure({
        code: 'invalid_params',
        message: "Ce dossier n'appartient à aucun espace : un plan d'enrichissement ne peut pas s'y rattacher.",
      })
    }
    if (selection.candidateIds.length === 0) {
      return failure({ code: 'not_found', message: 'Rien à enrichir dans ce périmètre.' })
    }
    // #2637.1 — gratuit, décision Louis 21/09/2026 : le rattrapage AUTOMATIQUE
    // ne vérifie jamais le solde et ne peut donc jamais échouer en
    // `insufficient_credits` — même doctrine que les six segments gratuits de
    // `SegmentCatchupService`. Le bouton MANUEL (`free` absent) reste soumis.
    if (!free && !(await this.planner.hasCredit(userId))) {
      return failure({
        code: 'insufficient_credits',
        message: SOFT_BRAKE_MESSAGE,
      })
    }

    const waveSize = normaliseWaveSize(batchSize)
    const waves = sliceWaves(selection.candidateIds, waveSize)

    const entity = this.jobs.create({
      workspace_id: account.workspace_id,
      account_id: accountId,
      user_id: userId,
      mode: params.mode,
      target_params: params,
      wave_size: waveSize,
      status: deriveOrgEnrichmentJobStatus(waves),
      prompt_version: ORG_ENRICHMENT_PROMPT_VERSION,
      // Le coût ANNONCÉ, calculé vague par vague via `creditCostOf` — jamais un
      // nombre recopié, jamais une multiplication maison.
      estimated_credits: waves.reduce(
        (total, wave) => total + creditCostOf('targeted_refresh', { perimeterUnits: wave.contactIds.length }),
        0,
      ),
      // Rien n'a encore abouti : il n'y a RIEN à mesurer. `0` mentirait.
      actual_credits: null,
      waves,
      error: null,
    } as Partial<OrgEnrichmentJobEntity>)

    return success(await this.jobs.save(entity))
  }

  /**
   * Lancer la prochaine vague du job, et n'écrire QUE ce qu'on a mesuré.
   *
   * Une vague qui échoue est marquée `failed` avec son message — pas
   * supprimée, pas rejouée en boucle : `org-rebuild.queue.ts` pose
   * délibérément `attempts: 1`, et rejouer un fan-out LLM entier sur un échec
   * reste le mauvais réflexe. La reprise est un GESTE, pas une retentative
   * automatique.
   */
  private async runNext(
    job: OrgEnrichmentJobEntity,
    userId: string,
    free: boolean,
  ): Promise<Result<OrgEnrichmentJobStep, OrgEnrichmentFailure>> {
    const wave = nextOrgEnrichmentWave(job.waves)
    if (!wave) return success({ job: toContract(job), ranWave: null })

    // #2637.1 — gratuit : `free` n'est passé qu'à `true` (jamais `false`
    // explicite), pour que l'appel MANUEL garde EXACTEMENT sa forme d'avant
    // ce lot — zéro argument supplémentaire quand rien ne change.
    const run = free
      ? await this.planner.runWave(job.account_id, userId, job.mode, wave.contactIds, true)
      : await this.planner.runWave(job.account_id, userId, job.mode, wave.contactIds)

    const waves = job.waves.map(entry =>
      entry.index !== wave.index
        ? entry
        : isFailure(run)
          ? { ...entry, status: 'failed' as const, actualCredits: null, matched: null, error: run.problem.message }
          : {
              ...entry,
              status: 'done' as const,
              actualCredits: run.output.creditsDebited,
              matched: run.output.matched,
              error: null,
            },
    )

    const { credits } = sumOrgEnrichmentActualCredits(waves)
    job.waves = waves
    job.status = deriveOrgEnrichmentJobStatus(waves)
    job.actual_credits = credits
    job.error = isFailure(run) ? run.problem.message : null
    const saved = await this.jobs.save(job)

    if (isFailure(run)) {
      this.logger.warn("Vague d'enrichissement en échec — le job la garde et reste reprenable", {
        jobId: job.id,
        accountId: job.account_id,
        waveIndex: wave.index,
        reason: run.problem.code,
      })
      return failure(run.problem)
    }

    return success({
      job: toContract(saved),
      ranWave: { index: wave.index, matched: run.output.matched, creditsDebited: run.output.creditsDebited },
    })
  }

  /** Le job inachevé de ce mode sur ce compte, s'il y en a un. */
  private async findResumable(
    accountId: string,
    userId: string,
    mode: OrgEnrichmentTargetParams['mode'],
  ): Promise<OrgEnrichmentJobEntity | null> {
    const scope = await this.resolveScope(accountId, userId)
    if (isFailure(scope)) return null
    return this.jobs.findOne({
      where: {
        account_id: accountId,
        workspace_id: scope.output.workspaceId,
        mode,
        status: In([...OrgEnrichmentJobService.RESUMABLE]),
      },
      order: { created_at: 'DESC' },
    })
  }

  /**
   * L'espace du compte, résolu par le chemin d'accès NORMAL (`findOne` scopé
   * par utilisateur). Aucune requête de job ne part sans lui : lire un job par
   * son seul `account_id` ouvrirait la porte d'un espace à un autre.
   */
  private async resolveScope(
    accountId: string,
    userId: string,
  ): Promise<Result<{ workspaceId: string }, OrgEnrichmentFailure>> {
    const resolved = await this.planner.resolveAccount(accountId, userId)
    if (isFailure(resolved)) return failure(resolved.problem)
    const workspaceId = resolved.output.workspace_id
    if (!workspaceId) {
      return failure({ code: 'not_found', message: "Ce dossier n'appartient à aucun espace." })
    }
    return success({ workspaceId })
  }
}

/** La taille de lot demandée, bornée. Absente ⇒ le CTA produit (50). */
function normaliseWaveSize(batchSize?: number): number {
  if (batchSize === undefined || !Number.isFinite(batchSize)) return ORG_ENRICHMENT_WAVE_SIZE
  return Math.min(ORG_ENRICHMENT_WAVE_SIZE, Math.max(1, Math.floor(batchSize)))
}

/** Découpe le périmètre en lots FIGÉS. L'ordre est celui de la sélection. */
function sliceWaves(candidateIds: readonly string[], waveSize: number): OrgEnrichmentWave[] {
  const waves: OrgEnrichmentWave[] = []
  for (let offset = 0; offset < candidateIds.length; offset += waveSize) {
    waves.push({
      index: waves.length,
      contactIds: [...candidateIds.slice(offset, offset + waveSize)],
      status: 'pending',
      actualCredits: null,
      matched: null,
      error: null,
    })
  }
  return waves
}

/** La ligne telle que l'API la rend. Une seule projection, pour que l'écran ne
 *  recompose rien — et surtout pas le coût. */
function toContract(row: OrgEnrichmentJobEntity): OrgEnrichmentJob {
  return {
    id: row.id,
    accountId: row.account_id,
    mode: row.mode,
    targetParams: row.target_params,
    status: row.status,
    promptVersion: row.prompt_version,
    waveSize: row.wave_size,
    estimatedCredits: row.estimated_credits,
    actualCredits: row.actual_credits,
    waves: row.waves,
    error: row.error,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  }
}
