import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Repository } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import {
  buildContactReachability,
  buildEnrichmentCoverage,
  type ContactReachability,
  type EnrichmentAttemptRow,
  type EnrichmentCoverage,
} from './enrichment-coverage'

/**
 * La couverture de l'enrichissement, pour le back-office.
 *
 * Aucune écriture, aucune colonne nouvelle : la trace existe depuis la migration
 * `1786500000000` (`last_enrichment_at` / `_provider` / `_result` / `_missing`).
 * Elle n'était simplement lue par personne — elle vivait dans une ligne de log
 * du service IA, donc nulle part où l'on puisse compter.
 *
 * Back-office uniquement, même règle que les coûts et la qualité : le taux
 * d'échec d'un fournisseur est une donnée d'exploitation. Montrée à un
 * commercial, elle se lirait comme une promesse sur le prochain enrichissement.
 */

const DEFAULT_DAYS = 30
/** Borne dure : au-delà on lit une base, pas une tendance. */
const MAX_ROWS = 50_000

@Injectable()
export class EnrichmentCoverageService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  async overview(days = DEFAULT_DAYS): Promise<EnrichmentCoverage & { reachability: ContactReachability }> {
    const window = Math.min(Math.max(Number.isFinite(days) ? days : DEFAULT_DAYS, 1), 365)
    const since = new Date(Date.now() - window * 86_400_000)

    // `MoreThan(since)` porte l'honnêteté du chiffre : en SQL, une comparaison
    // sur NULL est fausse, donc un contact JAMAIS enrichi est exclu d'office. Il
    // n'est pas un échec d'enrichissement, et l'inclure ferait plonger le taux
    // sans qu'aucune tentative ait raté.
    const rows = await this.contacts.find({
      where: { last_enrichment_at: MoreThan(since) },
      select: {
        last_enrichment_result: true,
        last_enrichment_provider: true,
        last_enrichment_missing: true,
        email: true,
        phone: true,
        linkedin_url: true,
      },
      take: MAX_ROWS,
    })

    const attempts: EnrichmentAttemptRow[] = rows.map(row => ({
      result: row.last_enrichment_result,
      provider: row.last_enrichment_provider,
      missing: row.last_enrichment_missing,
    }))
    // #3549.1 — la mesure de stock (part e-mail / téléphone / LinkedIn) sur les
    // MÊMES lignes : zéro requête de plus.
    return { ...buildEnrichmentCoverage(attempts, window), reachability: buildContactReachability(rows) }
  }
}
