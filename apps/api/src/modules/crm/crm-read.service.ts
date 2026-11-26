import { Injectable, Logger, Optional } from '@nestjs/common'
import { CrmDealAccountLinker } from './crm-deal-account-linker'
import { SalesforceService } from '../salesforce/salesforce.service'
import {
  domainFromWebsite,
  emptyPresence,
  formatCrmPresence,
  type CrmPresence,
  type CrmPresenceQuery,
} from './crm-presence'
import { CrmService } from './crm.service'

/**
 * Provider-agnostic CRM presence read-back (roadmap §8/§9 — « as-tu déjà un
 * contact chez ce groupe ? », « croise ce compte avec mon CRM »). Asks whichever
 * CRM the workspace has connected; consumers (GET /crm/presence, the chatbot
 * context, the account dossier) never care which provider answered.
 *
 * Env-gated end to end: with no CRM configured/connected every provider returns
 * the empty presence (`provider: null`) without a single network call — the
 * feature is a strict no-op. Errors degrade to empty (graceful), and a record is
 * NEVER invented: everything returned came straight from the CRM's own API.
 */
@Injectable()
export class CrmReadService {
  private readonly logger = new Logger(CrmReadService.name)

  constructor(
    private readonly hubspot: CrmService,
    private readonly salesforce: SalesforceService,
    // Lot 762 P5 — le rattachement des deals CRM aux comptes (même module). `@Optional()` : specs à constructeur nu.
    @Optional() private readonly dealAccounts?: CrmDealAccountLinker,
  ) {}

  /**
   * Lot 762 P5 — à l'ANALYSE et à l'ACTUALISATION d'un compte, rejoue le rattachement deal → compte de son espace
   * (id société, SIREN, domaine, puis nom UNIVOQUE). Best-effort : un échec ne bloque jamais un run. Rend le
   * nombre de deals rattachés, `null` sans linker.
   */
  async linkDealsForWorkspace(workspaceId: string | null): Promise<number | null> {
    if (!this.dealAccounts || !workspaceId) return null
    try {
      return await this.dealAccounts.link(workspaceId)
    } catch (error) {
      this.logger.warn('Rattachement des deals CRM non rejoué (non bloquant)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * « Couche zéro » de la méthodologie de vente (annexe p8 : « Bellum doit
   * toujours chercher ce qui existe avant de proposer du froid »). Rend le
   * relevé CRM de ce compte prêt à être injecté dans le pipeline d'analyse —
   * ou `undefined` quand il n'y a rien d'HONNÊTE à dire.
   *
   * `undefined` est retourné dans TOUS ces cas, et c'est ce qui garantit
   * l'additivité : aucun CRM connecté (aucun appel réseau), CRM consulté sans
   * aucun match, ou lecture en échec. Le run reste alors strictement identique
   * à ce qu'il était avant la feature (prompts byte-identiques). Une chaîne
   * n'est renvoyée QUE sur un match réel — c'est ce qui autorise l'IA à la lire
   * comme le booléen « ce compte est déjà connu ».
   *
   * Best-effort : un CRM lent ou cassé ne doit jamais empêcher une analyse de
   * partir, donc toute erreur dégrade en `undefined`.
   */
  async describeAccountHistory(
    userId: string,
    account: { companyName?: string | null; website?: string | null; siren?: string | null },
  ): Promise<string | undefined> {
    const name = (account.companyName ?? '').trim()
    if (!name) return undefined
    try {
      const presence = await this.findAccountPresence(userId, {
        account: name,
        domain: domainFromWebsite(account.website) ?? undefined,
        siren: (account.siren ?? '').trim() || undefined,
      })
      if (!presence.matched) return undefined
      return formatCrmPresence(presence, name) ?? undefined
    } catch (error) {
      this.logger.warn('CRM history lookup failed — the run proceeds without it', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return undefined
    }
  }

  /**
   * #4070.3 — les contacts que le CRM connecté connaît chez ce groupe (nom et poste
   * SEULEMENT : jamais l'e-mail ni l'identifiant CRM), pour que la classification des
   * contacts d'une analyse départage un interlocuteur déjà connu.
   *
   * Best-effort comme {@link describeAccountHistory} : aucun CRM connecté, aucun match
   * ou lecture en échec → `[]`, un run ne tombe jamais pour ce signal. N'est appelé que
   * quand le CRM a déjà reconnu le compte (le relevé `crmPresence` est non vide).
   */
  async knownContacts(
    userId: string,
    account: { companyName?: string | null; website?: string | null; siren?: string | null },
  ): Promise<Array<{ name: string | null; jobTitle: string | null }>> {
    const name = (account.companyName ?? '').trim()
    if (!name) return []
    try {
      const presence = await this.findAccountPresence(userId, {
        account: name,
        domain: domainFromWebsite(account.website) ?? undefined,
        siren: (account.siren ?? '').trim() || undefined,
      })
      if (!presence.matched) return []
      return presence.contacts.map(contact => ({ name: contact.name, jobTitle: contact.jobTitle }))
    } catch (error) {
      this.logger.warn('CRM contacts lookup failed — the run proceeds without them', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return []
    }
  }

  /**
   * Presence of `query.account` (name and/or domain, siren accepted-but-unused)
   * in the workspace's connected CRM. HubSpot is asked first (historically the
   * primary CRM); Salesforce answers when it is the one connected. A provider
   * that isn't connected reports `provider: null` and costs no network call.
   */
  async findAccountPresence(userId: string, query: CrmPresenceQuery): Promise<CrmPresence> {
    if (!query.account?.trim() && !query.domain?.trim()) return emptyPresence()

    const hub = await this.hubspot.findPresence(userId, query)
    // `provider` set = that CRM IS connected (even if nothing matched) — its
    // answer is authoritative, don't shop around for a better-looking one.
    if (hub.provider) return hub

    return this.salesforce.findPresence(userId, query)
  }
}
