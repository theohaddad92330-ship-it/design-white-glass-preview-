import { Injectable, Logger } from '@nestjs/common'
import {
  CREDIT_WEIGHTS,
  DEEPEN_MAX_ACCOUNTS,
  type ContactDiscoveryOutcome,
  type ContactDiscoveryQuote,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactsService, extractDomain } from '../contacts/contacts.service'
import { CreditsService } from '../credits/credits.service'
import { IaClient } from '../ia/ia.client'

/**
 * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur une
 * sélection de comptes déjà connus.
 *
 * « Fraîche » : des personnes jamais collectées, pas un rejeu des personas
 * déjà collectées sur un compte analysé (`RefreshContactsDialog` — un moteur
 * DIFFÉRENT, `POST /analysis/:id/refresh` axe contacts, réservé aux comptes
 * qui portent déjà un dossier). Aucun moteur neuf ici non plus : ce service
 * n'ajoute que la PLOMBERIE — l'appel à la primitive IA déjà scopée compte
 * (`search_people_with_status`, sans appelant atteignable avant ce lot) et
 * la persistance par le chemin de collecte NORMAL (`ContactsService.
 * bulkInsert` — dédup par identité déjà en place, jamais de fusion
 * automatique de deux personnes distinctes).
 *
 * Module autonome (Craft rule #7) : le retirer retire la DÉCOUVERTE FRAÎCHE,
 * pas la collecte normale ni le rejeu de contacts existant.
 */
@Injectable()
export class ContactDiscoveryService {
  private readonly logger = new Logger(ContactDiscoveryService.name)

  constructor(
    private readonly contacts: ContactsService,
    private readonly credits: CreditsService,
    private readonly ia: IaClient,
  ) {}

  /**
   * Borne haute d'UN lot — même ordre de grandeur que
   * `RefreshContactsDialog.REFRESH_PORTFOLIO_MAX` (le geste voisin le plus
   * proche, « actualiser les contacts » sur une sélection de comptes) :
   * `DEEPEN_MAX_ACCOUNTS * 4`, jamais un second plafond inventé sans raison.
   */
  static readonly MAX_ACCOUNTS = DEEPEN_MAX_ACCOUNTS * 4

  /**
   * Le devis ANNONCÉ avant tout lancement — un compte non trouvé dans le
   * périmètre de l'appelant n'entre jamais ici (l'appelant résout la
   * sélection AVANT d'appeler `quote`, même discipline que `deepenQuote`).
   */
  quote(accounts: AccountEntity[], remaining: number): ContactDiscoveryQuote {
    const cost = CREDIT_WEIGHTS.contact_discovery
    const targeted = accounts.slice(0, ContactDiscoveryService.MAX_ACCOUNTS)
    const lines = targeted.map(account => ({
      accountId: account.id,
      companyName: account.company_name,
      cost,
    }))
    const delta = lines.reduce((sum, line) => sum + line.cost, 0)
    return { lines, delta, remaining, sufficient: delta <= remaining }
  }

  /**
   * Ancres d'organisation d'UN compte, dans le même ordre de précédence que
   * `search_people_with_status` (id > domaine > nom) — le même calcul que
   * `enrichContact` (`contacts.service.ts`), jamais une seconde résolution.
   */
  private organizationAnchors(account: AccountEntity): { organizationId?: string; organizationDomain?: string } {
    return {
      organizationId: account.apollo_enrichment?.organizationId,
      organizationDomain: account.apollo_enrichment?.domain ?? extractDomain(account.website),
    }
  }

  /**
   * Exécute la découverte sur UN compte : recherche IA → persistance
   * (`bulkInsert`, dédup incluse) → débit, UNIQUEMENT sur un résultat
   * exploitable — même doctrine que `enrichContact` (« un enrichissement
   * infructueux ne débite pas le client, mais il nous a bel et bien coûté des
   * appels ») : un compte pour lequel Apollo ne rend RIEN n'est pas facturé,
   * même si l'appel a bien eu lieu.
   *
   * `isDemo` — résolu par l'appelant (même « ports » que
   * `AnalysisBatchesController`, jamais `WorkspaceContextService` importé ici :
   * GA-07). AUCUN appel réseau en démo, vérifié ICI avant tout appel
   * fournisseur — même garantie que `ContactsService.enrichContact` (« la
   * sortie est ICI, avant le moindre appel »). Les sociétés du jeu de démo
   * sont RÉELLES (SIREN réel) : une personne JAMAIS collectée en serait une
   * INVENTÉE, pire qu'une coordonnée fictive pour quelqu'un de réel
   * (`demo-enrichment.ts`). Le clic réagit, le devis s'affiche, rien n'est
   * débité — la recherche rend honnêtement « rien trouvé ».
   */
  async run(
    account: AccountEntity,
    userId: string,
    titles: string[] | undefined,
    isDemo: boolean,
  ): Promise<ContactDiscoveryOutcome> {
    if (isDemo) {
      return { accountId: account.id, status: 'empty', found: 0, created: 0, cost: 0 }
    }
    const anchors = this.organizationAnchors(account)
    const { seeds, status } = await this.ia.discoverContacts({
      companyName: account.company_name,
      organizationDomain: anchors.organizationDomain,
      organizationId: anchors.organizationId,
      titles,
    })

    if (seeds.length === 0) {
      return { accountId: account.id, status: this.typedStatus(status), found: 0, created: 0, cost: 0 }
    }

    const createdRows = await this.contacts.bulkInsert(account.id, userId, seeds)
    const cost = CREDIT_WEIGHTS.contact_discovery
    const consume = await this.credits.consumeEnrichmentCredit(userId, {
      reason: 'contact_discovery',
      accountId: account.id,
      cost,
    })
    if (!consume.ok) {
      // Race perdue (quota épuisé entre le devis et ce compte, ou porte de
      // budget d'espace) — les contacts déjà créés RESTENT : le fournisseur a
      // déjà répondu, les retirer ferait perdre un résultat réel pour un
      // problème de facturation. Même choix qu'`enrichContact` (« the
      // provider cost is on us this time »).
      this.logger.warn('contact discovery race lost — credit decrement returned 0 affected', {
        userId,
        accountId: account.id,
        reason: consume.reason,
      })
    }
    return {
      accountId: account.id,
      status: this.typedStatus(status),
      found: seeds.length,
      created: createdRows.length,
      cost: consume.ok ? cost : 0,
    }
  }

  /** `status` typé, jamais un `string` libre qui laisserait passer une faute
   *  de frappe IA jusqu'à l'écran (GA-18/19) — un statut non reconnu retombe
   *  sur `'down'`, la lecture la plus prudente (jamais `'ok'` par défaut). */
  private typedStatus(status: string): ContactDiscoveryOutcome['status'] {
    const known = ['ok', 'empty', 'unconfigured', 'auth_failed', 'plan_blocked', 'rate_limited', 'down'] as const
    return (known as readonly string[]).includes(status) ? (status as ContactDiscoveryOutcome['status']) : 'down'
  }
}
