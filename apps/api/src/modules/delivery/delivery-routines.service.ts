import { Injectable, Logger, Optional } from '@nestjs/common'
import { buildTriggerEvent, triggerPeriodQualifier, type TriggerEvent } from '@bellum/contracts'
import { InvoiceReadinessService } from './invoice-readiness.service'
import { RevenueService } from './revenue.service'
import { TimesheetsService } from './timesheets.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'

/**
 * Ce que les routines demandent au Delivery — et rien de plus.
 *
 * Un seul point d'entrée pour les trois routines du PDF 5, dans le module qui
 * possède la donnée. L'alternative — laisser l'exécuteur de routines appeler
 * trois services de ce module — ferait traverser trois fois une frontière que
 * la règle §3.2 veut voir traversée le moins possible, et la garde GA-07
 * compte exactement ça.
 *
 * Aucune règle n'est recopiée ici : les bloqueurs viennent de
 * `assessInvoiceReadiness`, les relevés de `timesheet-view.ts`, la marge de
 * `revenue.ts`. Ce service ne fait que compter et formuler.
 */
@Injectable()
export class DeliveryRoutinesService {
  private readonly logger = new Logger(DeliveryRoutinesService.name)

  constructor(
    private readonly timesheets: TimesheetsService,
    private readonly readiness: InvoiceReadinessService,
    private readonly revenue: RevenueService,
    // #2875/#2402.1 (vague F/G 27/09) — le registre canonique des
    // déclencheurs commerciaux : les trois routines y persistent désormais
    // AUSSI un `TriggerEvent`, sur la MÊME détection que la trace qu'elles
    // écrivaient déjà. `@Optional()` : sans lui, les trois rendent le même
    // compte qu'avant.
    @Optional() private readonly triggers?: TriggerRegistryService,
  ) {}

  /**
   * Construit l'événement canonique (#2402.2 — seul point de construction) et
   * le persiste au registre, best-effort. RENDU en plus du compte affiché :
   * `RoutinesService.runDueFor` le recueille pour la corrélation multi-signal
   * (#2402.14), sur le MÊME sujet — l'espace — que les deux autres routines
   * Delivery quand elles se déclenchent dans le même balayage.
   */
  private buildAndRecordTrigger(
    type: 'timesheet_chase' | 'invoice_readiness_routine' | 'margin_alert',
    workspaceId: string,
    evidence: string,
  ): TriggerEvent | null {
    try {
      const now = new Date()
      const event = buildTriggerEvent({
        type,
        source: 'delivery-routines',
        subjectType: 'workspace',
        subjectId: workspaceId,
        workspaceId,
        ownerId: null,
        evidence,
        now,
        // #2875 — relevé du mois clos : un rappel par mois ; les deux autres
        // routines : une ligne par semaine ISO.
        dedupeQualifier: triggerPeriodQualifier(now, type === 'timesheet_chase' ? 'month' : 'week'),
      })
      void this.triggers?.recordOnceByDedupeKey(event, 'delivery/delivery-routines.service')
      return event
    } catch (error) {
      this.logger.warn(`Événement canonique « ${type} » en échec (non-fatal)`, { error })
      return null
    }
  }

  /**
   * Les relevés jamais arrivés sur le mois CLOS.
   *
   * Le déclencheur le plus coûteux du module : un mois sans relevé ne se
   * signale nulle part, et il passe.
   *
   * ⚠️ `count` vaut `null` — jamais `0` — quand la lecture a ÉCHOUÉ. Les deux
   * se ressemblent dans le code et disent l'inverse à l'écran : `0` est une
   * mesure VRAIE (« tout est rentré »), `null` est l'aveu qu'on n'a pas su
   * compter. Le premier se lit comme une bonne nouvelle ; c'est le défaut
   * « cassé et non mesurable se ressemblent », et il coûte un mois de
   * facturation avant que quiconque s'en aperçoive.
   */
  async missingTimesheets(
    workspaceId: string,
    now: Date,
  ): Promise<{ count: number | null; first: string | null; triggerEvent: TriggerEvent | null }> {
    try {
      const { items } = await this.timesheets.month(workspaceId, { status: 'missing' }, now)
      const triggerEvent =
        items.length > 0
          ? this.buildAndRecordTrigger(
              'timesheet_chase',
              workspaceId,
              `${items.length} relevé(s) d'activité manquant(s) sur le mois clos.`,
            )
          : null
      return { count: items.length, first: items[0]?.missionLabel ?? null, triggerEvent }
    } catch (err) {
      this.logger.error('missingTimesheets error', { error: err })
      return { count: null, first: null, triggerEvent: null }
    }
  }

  /** Les mois qui restent BLOQUÉS — et le montant qu'ils immobilisent. */
  async blockedInvoicing(
    workspaceId: string,
    now: Date,
  ): Promise<{
    count: number | null
    blockedAmountCents: number | null
    first: string | null
    triggerEvent: TriggerEvent | null
  }> {
    try {
      // ⚠️ `canReadFinance: true` — et ce n'est pas un contournement. Cette
      // routine n'est la réponse de personne : elle calcule l'agrégat de
      // l'ESPACE pour le remettre au moteur de routines, qui décide ensuite à
      // qui il l'adresse. Lui passer `false` viderait le montant AVANT que
      // quiconque soit identifié, et l'alerte « X € immobilisés » perdrait la
      // seule information qui la rend lisible.
      //
      // Le droit du DESTINATAIRE se tient donc en aval, dans le moteur de
      // routines — pas ici. Ce qui sort de cette méthode n'est pas une réponse
      // HTTP.
      const { items, summary } = await this.readiness.list(
        workspaceId,
        { blockedOnly: true },
        { canReadFinance: true },
        now,
      )
      const triggerEvent =
        summary.blocked > 0
          ? this.buildAndRecordTrigger(
              'invoice_readiness_routine',
              workspaceId,
              `${summary.blocked} mois de facturation bloqué(s).`,
            )
          : null
      return {
        count: summary.blocked,
        // Le montant BLOQUÉ, jamais additionné avec le préparatoire : les
        // fondre annoncerait une facturation qui n'aura pas lieu.
        //
        // ⚠️ Il est relayé TEL QUEL, `null` compris, jamais `?? 0` : « coalescer
        // une absence en zéro » est une cause racine nommée de ce dépôt, et
        // c'est l'appelant qui sait taire un montant qu'il n'a pas.
        blockedAmountCents: summary.blockedAmountCents,
        first: items[0]?.missionLabel ?? null,
        triggerEvent,
      }
    } catch (err) {
      this.logger.error('blockedInvoicing error', { error: err })
      // `null` et non `0`, POUR LES DEUX : une lecture qui a échoué ne vaut pas
      // « rien n'est immobilisé ».
      //
      // ⚠️ Le montant était déjà `null` ici, et le COMPTE valait `0` — le
      // commentaire d'origine assumait « le compteur retombe à 0, la routine se
      // tait ». Se taire est juste ; écrire « Rien ne bloque la facturation du
      // mois clos » dans la trace ne l'est pas, et c'est ce que `0` produisait
      // à l'écran Réglages › Routines. Un demi-aveu (le montant) sous une
      // affirmation fausse (le compte) est pire qu'aucun des deux.
      return { count: null, blockedAmountCents: null, first: null, triggerEvent: null }
    }
  }

  /**
   * Les missions sous le seuil de marge de l'espace.
   *
   * Aucun seuil réglé = aucune alerte, et c'est le défaut : une alerte de marge
   * qui se déclenche seule le premier jour apprend à ignorer les alertes.
   */
  async marginsBelowThreshold(workspaceId: string): Promise<{
    threshold: number | null
    count: number | null
    first: string | null
    triggerEvent: TriggerEvent | null
  }> {
    // Portée ESPACE, et c'est voulu : la routine d'alerte de marge prévient un
    // responsable, pas un portefeuille. La restreindre ferait taire l'alerte sur
    // toutes les missions que personne ne porte — exactement celles qu'on
    // surveille le moins.
    const { threshold, items, measured } = await this.revenue.marginAlerts({ kind: 'workspace', workspaceId })
    // ⚠️ C'est ici que `null` compte le plus des trois. `marginAlerts` rend
    // `{ threshold: null, items: [] }` DANS LES DEUX CAS — aucun seuil réglé,
    // et lecture cassée — et la routine en tirait la même phrase : « aucun
    // seuil de marge réglé pour cet espace ». Elle n'annonçait donc pas
    // seulement une absence de problème, elle en donnait une CAUSE, et cette
    // cause accusait l'opérateur d'un oubli qu'il n'avait pas commis.
    if (!measured) return { threshold: null, count: null, first: null, triggerEvent: null }
    const triggerEvent =
      threshold !== null && items.length > 0
        ? this.buildAndRecordTrigger(
            'margin_alert',
            workspaceId,
            `${items.length} mission(s) sous le seuil de ${threshold} % de marge.`,
          )
        : null
    return { threshold, count: items.length, first: items[0]?.label ?? null, triggerEvent }
  }
}
