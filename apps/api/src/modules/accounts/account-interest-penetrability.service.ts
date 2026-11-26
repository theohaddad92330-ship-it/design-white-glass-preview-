import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  deriveAccountInterestPenetrability,
  parseAccountAnalysis,
  MAX_INTEREST_PENETRABILITY_PORTFOLIO_ACCOUNTS,
  type AccountInterestPenetrability,
  type AccountInterestPenetrabilityPortfolio,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { AccountStrategy5PService } from './account-strategy-5p.service'

/**
 * BEL-SC-229 (#3258, P0) — LA MAISON CANONIQUE DE `AccountInterestPenetrability`.
 *
 * Même discipline que `AccountStrategy5PService` (BEL-SC-225) : une façade de
 * LECTURE seule, `workspaceId` filtre la requête elle-même (jamais une
 * vérification préalable oubliable), et la retirer ne casse rien d'autre.
 *
 * Compose `AccountStrategy5PService` (déjà la maison canonique de
 * `perimeter`/`people`/`passage`/`proof`) plutôt que de relire les contacts
 * et `raw_analysis` pour les redériver en parallèle — un seul endroit qui
 * sait lire un `Contact` en dimension 5P (GA-26).
 */
@Injectable()
export class AccountInterestPenetrabilityService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contactsRepo: Repository<ContactEntity>,
    @InjectRepository(AccountPartnerEntity)
    private readonly partnersRepo: Repository<AccountPartnerEntity>,
    private readonly strategy5P: AccountStrategy5PService,
  ) {}

  async matrixFor(accountId: string, workspaceId: string): Promise<AccountInterestPenetrability | null> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) return null

    const strategy5P = await this.strategy5P.strategyFor(accountId, workspaceId)
    if (!strategy5P) return null

    const contactRows = await this.contactsRepo.find({ where: { account_id: accountId } })
    // `AccountPartnerEntity` (`account_partners`) — quelles ESN sont EN PLACE
    // chez CE compte (D11) ; distinct du `partner_relations` portefeuille
    // (`partner-pipeline.ts`) qui note NOTRE relation avec l'ESN elle-même.
    // Une ligne écartée (`dismissed_at` non nul) ne compte plus — la pierre
    // tombale du bouton « Ce n'est pas exact ».
    const partnerRows = await this.partnersRepo.find({ where: { account_id: accountId, workspace_id: workspaceId } })

    return deriveAccountInterestPenetrability({
      accountId,
      analysis: parseAccountAnalysis(account.raw_analysis),
      strategy5P,
      contacts: contactRows.map(contact => ({ id: contact.id, email_verified: contact.email_verified })),
      partners: partnerRows.map(partner => ({
        relationship: partner.relationship,
        placements: partner.placements,
        dismissed_at: partner.dismissed_at ? partner.dismissed_at.toISOString() : null,
      })),
    })
  }

  /**
   * BEL-SC-229 (#3258.13, épopée #3362) — LA LECTURE PORTEFEUILLE.
   *
   * Compose `matrixFor`, un compte à la fois — jamais une seconde dérivation
   * du quadrant (GA-26) ; l'appelant fournit déjà la population exacte à lire
   * (mêmes lookups que `AccountsService.listPortfolioLookups`, filtrés
   * espace + périmètre), pour que le dénominateur reste celui de `GET
   * /accounts` et non un second décompte (#1408).
   *
   * Au-delà de {@link MAX_INTEREST_PENETRABILITY_PORTFOLIO_ACCOUNTS}, la
   * lecture s'arrête et le dit plutôt que de laisser un espace immense
   * ralentir un écran de synthèse. Un compte introuvable entre-temps (course
   * avec une suppression) n'ajoute aucune entrée — jamais un quadrant deviné.
   */
  async portfolioFor(
    accountLookups: readonly { id: string; company_name: string }[],
    workspaceId: string,
  ): Promise<AccountInterestPenetrabilityPortfolio> {
    const truncated = accountLookups.length > MAX_INTEREST_PENETRABILITY_PORTFOLIO_ACCOUNTS
    const scoped = truncated ? accountLookups.slice(0, MAX_INTEREST_PENETRABILITY_PORTFOLIO_ACCOUNTS) : accountLookups

    const matrices = await Promise.all(scoped.map(lookup => this.matrixFor(lookup.id, workspaceId)))

    const entries: AccountInterestPenetrabilityPortfolio['entries'] = []
    scoped.forEach((lookup, index) => {
      const matrix = matrices[index]
      if (!matrix) return
      entries.push({
        accountId: lookup.id,
        companyName: lookup.company_name,
        quadrant: matrix.quadrant,
        quadrantUnavailableReason: matrix.quadrantUnavailableReason,
      })
    })

    return { entries, totalAccounts: accountLookups.length, truncated }
  }
}
