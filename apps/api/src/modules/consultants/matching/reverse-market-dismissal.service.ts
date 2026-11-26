import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { marketVerificationKey } from '@bellum/contracts'
import { IsNull, Not, Repository } from 'typeorm'
import { ReverseMarketDismissalEntity } from '../../../database/entities/reverse-market-dismissal.entity'

/**
 * #2968 — « MASQUER » UN ENVIRONNEMENT DU REVERSE MARKET, PAR PERSONNE.
 *
 * Même patron que `AccountsService.dismissSimilarSuggestion` /
 * `restoreSimilarSuggestion` (#2127.37) : `upsert` sur la clé composite — un
 * second masquage de la même entreprise ne crée pas une seconde ligne, il
 * rafraîchit `dismissed_at`. Démasquer repasse la MÊME ligne à `NULL`, elle
 * n'est jamais supprimée (doctrine « on archive, on ne supprime pas »).
 *
 * `marketVerificationKey` — la MÊME normalisation que les reçus de
 * vérification (`market-verification.ts`) — est la clé stable : une
 * entreprise de la mémoire marché n'a pas d'identifiant, seulement un
 * libellé, et deux appelants qui la rapprocheraient chacun à leur façon
 * finiraient par désaccorder « Thales » et « THALES ».
 */
@Injectable()
export class ReverseMarketDismissalService {
  constructor(
    @InjectRepository(ReverseMarketDismissalEntity)
    private readonly dismissals: Repository<ReverseMarketDismissalEntity>,
  ) {}

  async dismiss(workspaceId: string, userId: string, consultantId: string, companyName: string): Promise<void> {
    await this.dismissals.upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        consultant_id: consultantId,
        company_key: marketVerificationKey(companyName),
        company_name: companyName,
        dismissed_at: new Date(),
      },
      ['workspace_id', 'user_id', 'consultant_id', 'company_key'],
    )
  }

  async restore(workspaceId: string, userId: string, consultantId: string, companyName: string): Promise<void> {
    await this.dismissals.upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        consultant_id: consultantId,
        company_key: marketVerificationKey(companyName),
        company_name: companyName,
        dismissed_at: null,
      },
      ['workspace_id', 'user_id', 'consultant_id', 'company_key'],
    )
  }

  /**
   * Les libellés actuellement masqués par CETTE personne sur CE consultant —
   * jamais les lignes démasquées (`dismissed_at IS NULL`), qui sont
   * redevenues des environnements ordinaires.
   */
  async dismissedCompanyNames(workspaceId: string, userId: string, consultantId: string): Promise<string[]> {
    const rows = await this.dismissals.find({
      where: { workspace_id: workspaceId, user_id: userId, consultant_id: consultantId, dismissed_at: Not(IsNull()) },
    })
    return rows.map(row => row.company_name)
  }
}
