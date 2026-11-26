import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { CRM_INCREMENTAL_PROVIDERS } from '@bellum/contracts'
import { type Job } from 'bullmq'
import { AgendaService } from '../agenda/agenda.service'
import { CrmReadSyncService } from '../crm/crm-read-sync.service'
import { crmSyncDisabled } from '../crm-sync/crm-sync.config'
import { CrmSyncService } from '../crm-sync/crm-sync.service'
import { INTEGRATION_SYNC_QUEUE, type IntegrationSyncJobData } from './integration-sync.queue'
import { IntegrationSyncService } from './integration-sync.service'

/** Les familles pour lesquelles une synchro RÉELLE existe déjà (#2261,
 *  `CrmSyncService`). Un provider absent d'ici referme quand même son run —
 *  sans rien à recopier depuis un fournisseur, le résumé ne porte que ce que
 *  `IntegrationSyncService.summarize` sait compter dans les tables de l'espace. */
const CRM_SYNC_PROVIDERS = new Set(['hubspot', 'salesforce', 'pipedrive', 'attio'])

/** #2388.42 — même horizon que l'alerte d'engagement
 *  (`engagement-alerts.service.ts`, `MEETING_HORIZON_MS`) : 36 heures, un
 *  seul endroit choisi pour ce nombre, jamais recomposé ici. */
/** K.2 — la phase CRM a une échéance : un fournisseur qui ne répond plus ferme le run en échec, jamais un spinner éternel. */
export const CRM_PHASE_DEADLINE_MS = 5 * 60 * 1000

async function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} : aucune réponse en ${Math.round(ms / 1000)} s`)), ms)
  })
  try {
    return await Promise.race([work, deadline])
  } finally {
    clearTimeout(timer)
  }
}

const MEETINGS_TO_PREPARE_HORIZON_MS = 36 * 60 * 60 * 1000

/**
 * Le travail en arrière-plan derrière « Synchroniser et comprendre mes
 * données » (épopée #2980, ÉTAPE 2 de #2110) — le job réel qui fait vivre les
 * états nommés par `SYNC_RUN_STATUSES`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER IMPORTE `CrmSyncService` (relèvement GA-07 assumé)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'orchestration inter-modules vivait dans `IntegrationSyncController`
 * (#3014 la posait déjà là, hors périmètre de GA-07 — voir son docblock).
 * Elle déménage ici parce que le TRAVAIL réel doit survivre à un redémarrage
 * de l'API : un `void this.run(...)` dans le contrôleur ne le pouvait pas.
 * `integration-sync.worker.ts` est un fichier NEUF qui importe UN service
 * (`CrmSyncService`) — signature d'un fichier nouveau, pas d'un couplage qui
 * s'étend (voir le relèvement jumeau dans `module-boundaries.spec.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE PHASE FAIT RÉELLEMENT — JAMAIS UNE PROGRESSION INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * `crmSync.syncWorkspace` reste un appel UNIQUE et atomique (#2261) : il n'y a
 * pas de frontière interne entre « rapprocher les entreprises » et
 * « rapprocher les contacts » à l'intérieur de ce fournisseur aujourd'hui. Les
 * deux états s'écrivent l'un après l'autre autour du MÊME appel — une
 * étiquette de phase honnête sur un travail réel, jamais un pourcentage ou un
 * compte inventés. `detecting_events` et `preparing_summary` sont, elles,
 * deux passages RÉELLEMENT distincts : la seconde EST le calcul de
 * `summarize()` que `finishRun` déclenche.
 *
 * ⚠️ REPRISE APRÈS CRASH — #2110.21, tranché sans Louis (26/09/2026) :
 * `attempts: 1` (voir `integration-sync.queue.ts`) évite qu'un redémarrage
 * BullMQ ne rejoue un appel non-idempotent depuis le début. Aucun curseur de
 * phase persistant n'existe, donc rien ne REPREND une phase interrompue —
 * inventer cette progression mentirait sur ce qui a réellement été fait.
 * `IntegrationSyncService.reconcileStaleRuns` (appelée une fois au démarrage
 * du process) referme honnêtement en `failed`, motif distinct, tout run non
 * terminal plus vieux que 30 minutes : la garde anti-double-lancement
 * (#2110.81) redevient franchissable au lieu de bloquer un relancement pour
 * toujours. Une reprise qui reconstruirait le travail déjà fait reste hors
 * périmètre (curseur de phase + réconciliation fine, plusieurs jours).
 *
 * ⚠️ #2388.42 — les rendez-vous À PRÉPARER de l'utilisateur qui a lancé la
 * synchro traversent aussi vers `AgendaService` ICI, pour la même raison que
 * `CrmSyncService` ci-dessus : c'est le worker, pas le contrôleur, qui
 * referme le run et calcule son résumé.
 */
@Processor(INTEGRATION_SYNC_QUEUE, { concurrency: 5 })
@Injectable()
export class IntegrationSyncWorker extends WorkerHost {
  private readonly logger = new Logger(IntegrationSyncWorker.name)

  constructor(
    private readonly syncs: IntegrationSyncService,
    private readonly crmSync: CrmSyncService,
    private readonly agenda: AgendaService,
    // #4189 — la lecture incrémentale des CRM qui se relisent par l'adaptateur commun.
    @Optional() private readonly readSync?: CrmReadSyncService,
  ) {
    super()
  }

  async process(job: Job<IntegrationSyncJobData>): Promise<void> {
    const { runId, workspaceId, provider, userId } = job.data
    try {
      await this.syncs.advance(runId, 'reading_sources')
      if (await this.syncs.isCanceled(runId)) return

      // #4189 — Salesforce, Pipedrive, Attio, Odoo, Zoho se relisent aussi (comptes puis contacts, depuis le
      // curseur de l'espace ; une première reprise reste un geste humain — `syncProvider` le dit, il ne la lance pas).
      const reconciles = CRM_SYNC_PROVIDERS.has(provider)
      const rereads = (CRM_INCREMENTAL_PROVIDERS as readonly string[]).includes(provider)
      if ((reconciles || rereads) && !crmSyncDisabled()) {
        await this.syncs.advance(runId, 'matching_accounts')
        await withDeadline(
          (async () => {
            if (reconciles) await this.crmSync.syncWorkspace(workspaceId)
            if (rereads) await this.readSync?.syncProvider(userId, provider)
          })(),
          CRM_PHASE_DEADLINE_MS,
          `Synchro ${provider}`,
        )
        await this.syncs.advance(runId, 'matching_contacts')
        if (await this.syncs.isCanceled(runId)) return
      }

      await this.syncs.advance(runId, 'detecting_events')
      if (await this.syncs.isCanceled(runId)) return

      await this.syncs.advance(runId, 'preparing_summary')
      // K.6 — le résumé d'une synchro CRM décrit ce qui a été synchronisé (comptes, contacts, affaires),
      // jamais l'agenda : les rendez-vous à préparer ne s'ajoutent qu'aux synchros qui ne sont pas un CRM.
      const isCrm =
        CRM_SYNC_PROVIDERS.has(provider) || (CRM_INCREMENTAL_PROVIDERS as readonly string[]).includes(provider)
      await this.syncs.finishRun(runId, workspaceId, isCrm ? undefined : await this.meetingsToPrepare(userId))
    } catch (error) {
      // Le motif est journalisé une fois, dans `failRun` (qui écrit aussi le
      // run) — deux journaux de la même panne ne renseignent personne de plus.
      await this.syncs.failRun(runId, provider, error)
    }
  }

  /**
   * #2388.42 — les rendez-vous de l'utilisateur qui a lancé la synchro, dans
   * les 36 prochaines heures. `undefined` si l'agenda n'est pas branché ou ne
   * répond pas — jamais un compte deviné : la doctrine « on n'affiche pas ce
   * qu'on n'a pas » vaut ici comme pour tout autre domaine de `summarize()`.
   */
  private async meetingsToPrepare(userId: string): Promise<number | undefined> {
    try {
      const now = new Date()
      const events = await this.agenda.listEvents(userId, {
        from: now.toISOString(),
        to: new Date(now.getTime() + MEETINGS_TO_PREPARE_HORIZON_MS).toISOString(),
        limit: 50,
      })
      return events.length
    } catch {
      return undefined
    }
  }
}
