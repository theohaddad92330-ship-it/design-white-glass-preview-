import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'

/** Casse et espaces repliés — le même repli que la requête ci-dessous. */
function foldPartnerName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * #2265.5 (épopée #2851) — LES COMPTES QUI SONT UN PARTENAIRE DÉCLARÉ.
 *
 * « Déterminer si partenaire (avant inclusion prospects) » : le signal existe
 * dans l'espace — `account_partners` (`relationship = 'partner'`), saisi ou
 * confirmé par l'équipe. Un compte dont le nom (casse et espaces repliés) est
 * celui d'un partenaire déclaré sur N'IMPORTE quel compte de l'espace est
 * marqué. Jamais deviné : sans ligne, rien n'est marqué ; sans dépôt
 * (`@Optional()`), idem — absent n'affirme rien.
 *
 * Service À PART plutôt qu'une méthode d'`AccountsService` : le contrôleur des
 * comptes est construit positionnellement par une vingtaine de specs.
 */
@Injectable()
export class AccountDeclaredPartnerService {
  constructor(
    @InjectRepository(AccountPartnerEntity)
    private readonly partners: Repository<AccountPartnerEntity>,
  ) {}

  async declaredNames(workspaceId: string, companyNames: readonly string[]): Promise<Set<string>> {
    const wanted = [...new Set(companyNames.map(foldPartnerName).filter(name => name.length > 0))]
    if (wanted.length === 0) return new Set()
    const rows = await this.partners
      .createQueryBuilder('p')
      .select('p.name', 'name')
      .where('p.workspace_id = :workspaceId', { workspaceId })
      .andWhere("p.relationship = 'partner'")
      .andWhere("LOWER(REGEXP_REPLACE(TRIM(p.name), '\\s+', ' ', 'g')) IN (:...wanted)", { wanted })
      .getRawMany<{ name: string }>()
    return new Set(rows.map(row => foldPartnerName(row.name)))
  }

  /** Marque `is_declared_partner: true` sur les lignes concernées, rien ailleurs. */
  async flag<T extends { company_name: string }>(
    workspaceId: string,
    rows: readonly T[],
  ): Promise<Array<T & { is_declared_partner?: true }>> {
    const partners = await this.declaredNames(
      workspaceId,
      rows.map(row => row.company_name),
    )
    if (partners.size === 0) return [...rows]
    return rows.map(row =>
      partners.has(foldPartnerName(row.company_name)) ? { ...row, is_declared_partner: true } : row,
    )
  }
}
