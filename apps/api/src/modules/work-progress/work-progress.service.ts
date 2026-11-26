import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  WORK_FAMILIES,
  WORK_PROGRESS_WINDOW_DAYS,
  workFamilyProgress,
  type WorkCounter,
  type WorkFailure,
  type WorkFamily,
  type WorkFamilyProgress,
  type WorkProgressRead,
} from '@bellum/contracts'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'

/** Le jeton du lecteur de base — le service ne connaît que sa FORME (GA-07 : aucun service d'un autre module). */
export const WORK_PROGRESS_READER = Symbol('WORK_PROGRESS_READER')
/** L'horloge du service — un jeton, pour qu'un test fige l'heure sans toucher au constructeur de production. */
const WORK_PROGRESS_CLOCK = Symbol('WORK_PROGRESS_CLOCK')
/**
 * #4967 / #4611 (lot L6) — les recherches de conversation qui tournent côté serveur, par leur JETON
 * (GA-07). Seul « en cours » s'y mesure : le registre est une mémoire de processus, pas un journal.
 */
export const WORK_PROGRESS_CHAT_TURNS = Symbol('WORK_PROGRESS_CHAT_TURNS')
export interface WorkProgressChatTurns {
  measure(userId: string): { running: number; since: string | null; lastActivityAt: string | null }
}

const DAY_MS = 86_400_000

/** Ce que le lecteur sait d'UN lot d'analyses, trouvé par son seul identifiant — sans chiffre. */
export interface AnalysisLotRef {
  id: string
  workspaceId: string
  /** Le périmètre de portefeuille de CHAQUE sous-job (`null` = compte non rattaché ou pas encore lancé). */
  itemBusinessUnitIds: readonly (string | null)[]
}

/** Ce qu'une famille mesure : un nombre PAR compteur, `null` quand CE compteur n'a pas pu être compté. */
export interface FamilyMeasures {
  measures: Partial<Record<WorkCounter, number | null>>
  since: string | null
  lastActivityAt: string | null
  failures: WorkFailure[]
}

export interface WorkQuery {
  workspaceId: string
  userId: string
  businessUnitScope: BusinessUnitScopeClause
  /** Les départs plus anciens que cette date ne sont pas « le travail lancé ». */
  since: Date
  /** Seulement pour les analyses : un lot précis, déjà passé par {@link isLotInScope}. */
  lotId?: string
}

/** #4611.4 — chaque méthode compte CHAQUE compteur par sa propre requête ; aucune ne déduit l'un de l'autre. */
export interface WorkProgressReader {
  findAnalysisLot(lotId: string): Promise<AnalysisLotRef | null>
  analysis(query: WorkQuery): Promise<FamilyMeasures>
  imports(query: WorkQuery): Promise<FamilyMeasures>
  enrichments(query: WorkQuery): Promise<FamilyMeasures>
  crmSyncs(query: WorkQuery): Promise<FamilyMeasures>
  /** Lot L6 — les jobs composites de Laura de l'APPELANT (ils naissent de sa conversation). */
  lauraJobs(query: WorkQuery): Promise<FamilyMeasures>
}

/**
 * #4611.8 — un lot est visible de l'appelant si, ET SEULEMENT SI, il est de SON espace et qu'au moins un de
 * ses sous-jobs tient dans son périmètre de portefeuille. Même règle que `businessUnitScopeClause` :
 * liste vide = le non rattaché seulement (jamais « tout »), `null` = tout l'espace.
 */
export function isLotInScope(lot: AnalysisLotRef, workspaceId: string, scope: BusinessUnitScopeClause): boolean {
  if (lot.workspaceId !== workspaceId) return false
  if (!scope) return true
  return lot.itemBusinessUnitIds.some(unit => unit === null || scope.businessUnitIds.includes(unit))
}

/**
 * #4611 — LAURA DIT OÙ EN EST LE TRAVAIL LANCÉ.
 *
 * Une lecture, jamais un geste : ce service n'écrit rien, ne relance rien, ne rejoue aucun lot. Il assemble
 * la MÊME forme pour chaque famille (`WORK_FAMILIES`) à partir de lectures indépendantes — et ne calcule
 * jamais un compteur à partir d'un autre (#4611.4).
 *
 * Quand une famille ne se lit pas (panne de lecture), ses quatre compteurs sortent NOMMÉS non mesurés
 * (`read_failed`), jamais « 0 » (#4611.5) ; une famille en panne ne contamine pas les autres.
 */
@Injectable()
export class WorkProgressService {
  private readonly logger = new Logger(WorkProgressService.name)

  constructor(
    @Inject(WORK_PROGRESS_READER) private readonly reader: WorkProgressReader,
    @Optional() @Inject(WORK_PROGRESS_CLOCK) private readonly clock: () => Date = () => new Date(),
    @Optional() @Inject(WORK_PROGRESS_CHAT_TURNS) private readonly chatTurns?: WorkProgressChatTurns,
  ) {}

  async read(params: {
    workspaceId: string
    userId: string
    businessUnitScope: BusinessUnitScopeClause
    lotId?: string
  }): Promise<WorkProgressRead> {
    const now = this.clock()
    const base = {
      workspaceId: params.workspaceId,
      userId: params.userId,
      businessUnitScope: params.businessUnitScope,
      since: new Date(now.getTime() - WORK_PROGRESS_WINDOW_DAYS * DAY_MS),
    }

    if (params.lotId) {
      // #4611.8 — le lot est cherché par son seul identifiant, puis REFUSÉ ici s'il n'est pas dans le
      // périmètre. Inexistant, d'un autre espace ou hors portefeuille : le même `lot_unknown`.
      const lot = await this.reader.findAnalysisLot(params.lotId)
      if (!lot || !isLotInScope(lot, params.workspaceId, params.businessUnitScope)) {
        return { kind: 'lot_unknown', lotId: params.lotId }
      }
      const analysis = await this.family('analysis', () => this.reader.analysis({ ...base, lotId: lot.id }))
      return {
        kind: 'progress',
        readAt: now.toISOString(),
        windowDays: WORK_PROGRESS_WINDOW_DAYS,
        families: [analysis],
      }
    }

    const families = await Promise.all(
      WORK_FAMILIES.map(family => this.family(family, () => this.measure(family, base))),
    )
    return { kind: 'progress', readAt: now.toISOString(), windowDays: WORK_PROGRESS_WINDOW_DAYS, families }
  }

  private measure(family: WorkFamily, query: WorkQuery): Promise<FamilyMeasures | null> {
    switch (family) {
      case 'analysis':
        return this.reader.analysis(query)
      case 'import':
        return this.reader.imports(query)
      case 'enrichment':
        return this.reader.enrichments(query)
      case 'crm_sync':
        return this.reader.crmSyncs(query)
      case 'catch_up':
        return Promise.resolve(null)
      case 'laura_job':
        return this.reader.lauraJobs(query)
      case 'chat_research':
        return Promise.resolve(this.chatResearch(query.userId))
    }
  }

  /** #4967 — seul « en cours » se mesure ; sans registre branché, rien ne se mesure (jamais un 0). */
  private chatResearch(userId: string): FamilyMeasures | null {
    if (!this.chatTurns) return null
    const read = this.chatTurns.measure(userId)
    return { measures: { running: read.running }, since: read.since, lastActivityAt: read.lastActivityAt, failures: [] }
  }

  private async family(family: WorkFamily, read: () => Promise<FamilyMeasures | null>): Promise<WorkFamilyProgress> {
    // #4611.5 — aucun journal par espace ne tient les rattrapages (ils sont joués par un geste d'opérateur,
    // hors espace, et seulement journalisés) : NOMMÉS non mesurés, jamais « 0 ».
    if (family === 'catch_up') {
      return workFamilyProgress({ family, measures: {}, unmeasuredReason: 'no_run_ledger' })
    }
    try {
      const measured = await read()
      if (!measured) return workFamilyProgress({ family, measures: {}, unmeasuredReason: 'read_failed' })
      return workFamilyProgress({
        family,
        measures: measured.measures,
        // Les recherches de conversation : ce que le registre ne tient pas n'a pas de journal (jamais « 0 »).
        unmeasuredReason: family === 'chat_research' ? 'no_run_ledger' : 'read_failed',
        since: measured.since,
        lastActivityAt: measured.lastActivityAt,
        failures: measured.failures,
      })
    } catch (error) {
      this.logger.warn(`Work progress: lecture de la famille ${family} en échec`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return workFamilyProgress({ family, measures: {}, unmeasuredReason: 'read_failed' })
    }
  }
}
