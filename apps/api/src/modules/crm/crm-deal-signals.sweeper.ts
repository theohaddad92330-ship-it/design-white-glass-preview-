import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { buildTriggerEvent, type CrmDealSignalDraft, type CrmDealSignalRow, type TriggerEvent } from '@bellum/contracts'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { detectDealsForRenewal, detectDormantDeals, detectLostDeals } from './crm-deal-signal-rules'
import { CrmDealAccountLinker } from './crm-deal-account-linker'

/** Ports : le module `crm` ne connaît ni `locks` ni `trigger-registry` — `crm.module.ts` les câble. */
export const CRM_DEAL_SIGNALS_RUN_LOCKED = Symbol('CRM_DEAL_SIGNALS_RUN_LOCKED')
export const CRM_DEAL_SIGNALS_RECORD = Symbol('CRM_DEAL_SIGNALS_RECORD')
/** #3920.crm — `NotificationsService.notifyCrmSignalsForAccount`, câblé dans `crm.module.ts`. */
export const CRM_DEAL_SIGNALS_NOTIFY = Symbol('CRM_DEAL_SIGNALS_NOTIFY')
type NotifyAccount = (accountId: string, evidences: readonly string[]) => Promise<void>
type RunLocked = (name: string, fn: () => Promise<void>) => Promise<void>
/** #3918.a — `TriggerRegistryService.recordOnce` : rend `true` sur une ligne NEUVE seulement. */
type RecordTrigger = (
  event: TriggerEvent,
  sourceModule: string,
  context: { accountId: string | null; factOccurredAt: string },
) => Promise<boolean>

type DealSignalRule = (rows: readonly CrmDealSignalRow[], now: Date) => CrmDealSignalDraft[]

/** Une ligne de `crm_deal_facts`, avec ce que le signal canonique doit en savoir. */
type SweptDealRow = CrmDealSignalRow & { workspace_id: string; owner_id: string | null; account_id: string | null }

/**
 * #3918 (lot Y12, 08/10/2026) — transforme le cache CRM (`crm_deal_facts`) en
 * signaux canoniques (#2875), trois règles pures (`crm-deal-signal-rules.ts`).
 *
 * Même patron que `InterventionsSweeper` : un cron quotidien, sous verrou
 * singleton, qui construit chaque `TriggerEvent` via le seul point de
 * construction attendu (#2402.2) et le persiste au registre — best-effort,
 * jamais sur le chemin critique.
 *
 * `scope.ownerId` reste TOUJOURS `null` ici : `crm_deal_facts.owner_id` est
 * l'identifiant du propriétaire CHEZ LE FOURNISSEUR (`hubspot_owner_id`),
 * jamais un identifiant de nos `profiles` — lui faire porter le champ
 * `ownerId` inventerait un rattachement qu'aucune table ne tient.
 */
@Injectable()
export class CrmDealSignalsSweeper {
  private readonly logger = new Logger(CrmDealSignalsSweeper.name)

  constructor(
    @InjectRepository(CrmDealFactEntity)
    private readonly facts: Repository<CrmDealFactEntity>,
    @Optional() @Inject(CRM_DEAL_SIGNALS_RUN_LOCKED) private readonly runLocked?: RunLocked,
    @Optional() @Inject(CRM_DEAL_SIGNALS_RECORD) private readonly recordTrigger?: RecordTrigger,
    // #3918.a — le rattachement deal → compte, posé AVANT les règles pour que
    // chaque signal parte avec son compte (ou sans, jamais deviné).
    @Optional() private readonly dealAccounts?: CrmDealAccountLinker,
    // #3920.crm — la cloche : une alerte par compte, pour les seuls faits NEUFS.
    @Optional() @Inject(CRM_DEAL_SIGNALS_NOTIFY) private readonly notifyAccount?: NotifyAccount,
  ) {}

  /** 06:30 Europe/Paris — après la veille de 05:20 et le balayage des
   *  interventions de 06:10, dans le même créneau de calme avant l'ouverture
   *  des cockpits. */
  @Cron('30 6 * * *', { name: 'crm-deal-signals-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:crm-deal-signals.sweep')
  async runDailySweep(): Promise<void> {
    const run = async (): Promise<void> => {
      await this.sweep()
    }
    if (this.runLocked) await this.runLocked('crm-deal-signals-sweep', run)
    else await run()
  }

  /**
   * Balaye le cache et persiste ce qui doit l'être. Public pour être testable
   * et pour servir un « relancer maintenant » côté back-office.
   *
   * Rend le nombre de signaux RÉELLEMENT persistés — pas le nombre de
   * détections : sans port d'enregistrement (injection optionnelle), rien
   * n'est écrit, et le compte le dit plutôt que de prétendre l'inverse.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    if (killSwitchCut('crm.deal_signals_sweep')) {
      this.logger.log('Balayage des signaux CRM désactivé (CRM_DEAL_SIGNALS_DISABLED=true)')
      return 0
    }

    try {
      await this.dealAccounts?.link()
    } catch (error) {
      // Les signaux partent quand même — sans compte, comme avant #3918.a.
      this.logger.warn('Rattachement deal → compte en échec — les signaux partent sans compte', { error })
    }

    let recorded = 0
    // #3920.crm — les faits NEUFS de ce passage, par compte rattaché.
    const freshByAccount = new Map<string, string[]>()
    let rows: SweptDealRow[]
    try {
      rows = await this.dealRows()
    } catch (error) {
      this.logger.error('Lecture du cache CRM en échec — balayage des signaux interrompu', { error })
      return 0
    }
    const byId = new Map(rows.map(row => [row.id, row]))

    for (const [kind, detect] of this.rules()) {
      try {
        for (const draft of detect(rows, now)) {
          const row = byId.get(draft.dealFactId)
          if (!row) continue
          try {
            const event = buildTriggerEvent({
              type: draft.kind,
              source: 'crm-deal-signals',
              subjectType: 'crm_deal',
              subjectId: draft.dealFactId,
              workspaceId: row.workspace_id,
              ownerId: null,
              evidence: draft.evidence,
              now,
            })
            // #3918.a — le compte rattaché et la date du FAIT voyagent avec
            // l'événement ; une affaire déjà consignée n'est pas recomptée.
            const fresh = await this.recordTrigger?.(event, 'crm/crm-deal-signals.sweeper', {
              accountId: row.account_id ?? null,
              factOccurredAt: draft.occurredAt,
            })
            if (fresh === true) {
              recorded += 1
              if (row.account_id) {
                freshByAccount.set(row.account_id, [...(freshByAccount.get(row.account_id) ?? []), draft.evidence])
              }
            }
          } catch (error) {
            this.logger.error(`Événement canonique « ${kind} » en échec`, { error })
          }
        }
      } catch (error) {
        // Une règle isolée : un deal mal formé sur une table ne doit pas
        // empêcher les deux autres règles de tourner.
        this.logger.error(`Balayage « ${kind} » en échec`, { error })
      }
    }
    // #3920.crm — UNE alerte par compte : un portefeuille de dix affaires
    // perdues sur le même compte ne fait pas sonner la cloche dix fois.
    for (const [accountId, evidences] of freshByAccount) {
      try {
        await this.notifyAccount?.(accountId, evidences)
      } catch (error) {
        this.logger.warn('Alerte « nouveau signal » CRM en échec (non fatal)', { error })
      }
    }
    this.logger.log(`Balayage des signaux CRM terminé — ${recorded} signal(aux) enregistré(s)`)
    return recorded
  }

  private async dealRows(): Promise<SweptDealRow[]> {
    return this.facts.manager.query<SweptDealRow[]>(
      `SELECT f.id, f.name, f.amount, f.deal_created_at, f.closed_at, f.last_activity_at,
              f.is_closed, f.is_won, f.workspace_id, f.owner_id, f.account_id
         FROM crm_deal_facts f
         JOIN workspaces w ON w.id = f.workspace_id AND w.is_demo = false
        LIMIT 5000`,
    )
  }

  private rules(): [string, DealSignalRule][] {
    return [
      ['affaire_perdue', detectLostDeals],
      ['affaire_dormante', detectDormantDeals],
      ['affaire_renouvellement', detectDealsForRenewal],
    ]
  }
}
