import { Injectable, Logger } from '@nestjs/common'
import { crmSupports } from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import { CrmWriteService } from './crm-write.service'
import type { CrmTaskInput, CrmTaskResult } from './crm-task'

/** Why a besoin export could not run. `no_provider` = no CRM connected (a clear,
 *  actionable state, not a server error); `export_failed` = the connected CRM's
 *  API rejected the write. */
type CrmTaskFailureCode = 'no_provider' | 'export_failed'
export type CrmTaskFailure = { code: CrmTaskFailureCode; message: string }

/**
 * Provider-agnostic export of a **besoin** (Opportunity Graph need) to the
 * connected CRM as its **idiomatic object** — a Deal (HubSpot, Pipedrive), a
 * Note on the Company (Attio) or a Task (Salesforce) — since a besoin is a
 * would-be opportunity (Théo TF1 p39 — les connecteurs exportaient déjà un
 * contact ; un besoin n'avait aucun chemin). Mirrors {@link CrmReadService}: it
 * asks whichever CRM the workspace connected (HubSpot → Salesforce → Pipedrive →
 * Attio, first-connected wins) and creates the record there.
 *
 * Env-gated end to end: with no CRM connected it returns `no_provider` WITHOUT a
 * single network call — a strict no-op, exactly like the contact export. The
 * record content is composed server-side from the stored besoin by the caller;
 * nothing is fabricated, and no pipeline metadata (deal stage/close date) is ever
 * invented (omitted → the CRM's own default stage).
 */
@Injectable()
export class CrmTaskService {
  private readonly logger = new Logger(CrmTaskService.name)

  // #4185 — le registre des adaptateurs : plus de switch par fournisseur ici.
  constructor(
    private readonly adapters: CrmAdapterRegistry,
    // #4186 — le besoin part PAR LA PORTE (il déposait une affaire sans trace).
    private readonly crmWrites: CrmWriteService,
  ) {}

  /**
   * Create the besoin's record in the FIRST connected CRM. The order (hubspot →
   * salesforce → pipedrive → attio) matches the contact-export picker. Returns
   * the provider that answered, the object it created there (deal/note/task) and
   * that record's id, or a typed failure the controller maps to an HTTP status.
   */
  async exportTask(userId: string, input: CrmTaskInput): Promise<Result<CrmTaskResult, CrmTaskFailure>> {
    // #4185.4 — le PREMIER CRM branché qui sait déposer un besoin, dans l'ordre
    // du contrat (celui du sélecteur d'export de contact).
    const target = await this.adapters.firstConnected(userId, adapter => crmSupports(adapter.provider, 'task_note'))
    const provider = target?.adapter.provider
    if (!target || !provider) {
      return failure({
        code: 'no_provider',
        message:
          'Aucun CRM connecté. Connecte HubSpot, Salesforce, Pipedrive ou Attio dans Réglages › Intégrations pour exporter un besoin.',
      })
    }

    try {
      // #4186 — le clic sur « Exporter » EST la décision : auto-approuvé, écrit,
      // résultat consigné (`unknown` si la requête part sans réponse).
      const outcome = await this.crmWrites.write({
        userId,
        provider,
        kind: 'export_need',
        payload: input,
        origin: 'user',
      })
      if (outcome.status === 'written' && outcome.object) {
        return success({ provider, object: outcome.object, id: outcome.externalId })
      }
      throw new Error(`Écriture non aboutie (${outcome.status}).`)
    } catch (error) {
      this.logger.error('Besoin CRM export failed', { error, user: { id: userId }, tags: { provider } })
      return failure({
        code: 'export_failed',
        // #4185 — l'espace CRM de l'utilisateur, jamais l'éditeur (plus de liste de libellés par fournisseur).
        message: `L'export du besoin vers ton CRM${target.accountLabel ? ` (${target.accountLabel})` : ''} a échoué — réessaie dans un instant.`,
      })
    }
  }
}
