import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import { PublicRegistryWatch } from './public-registry-watch'

/** ~30 ESN relues par nuit (Louis 15/10/2026) : 477 noms, un tour complet en une quinzaine de nuits. */
const DEFAULT_PER_NIGHT = 30
const MAX_PER_NIGHT = 100

/**
 * Combien d'ESN relire par nuit. Absent ou illisible ⇒ 30 ; `0` ⇒ le roulement est éteint (aucune requête,
 * aucun appel). Plafonné : un tour ne doit jamais devenir une rafale sur un registre public partagé.
 */
export function esnRereadPerNight(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PER_NIGHT
  const n = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PER_NIGHT
  return Math.min(n, MAX_PER_NIGHT)
}

/**
 * #3921.7 / #3915.15 (décision Louis 15/10/2026) — LA RELECTURE DES ESN DU RÉFÉRENTIEL, PAR ROULEMENT.
 *
 * Jusqu'ici le registre public ne se relisait QUE pour les comptes suivis par un espace : les 477 ESN du
 * référentiel n'étaient lues qu'à leur résolution, et leurs signaux (ouverture d'établissement, tranche
 * d'effectif, procédure collective) ne bougeaient jamais. Chaque nuit, les ~30 ESN relues le plus
 * anciennement — jamais relues d'abord — passent par les MÊMES lectures que la veille des comptes
 * (`PublicRegistryWatch` : Sirene, BODACC, risque du référentiel, marchés publics gagnés) : aucun second lecteur (GA-26).
 *
 * ⚠️ Registres PUBLICS gratuits seulement, jamais d'achat : ni fournisseur payant, ni crédit. Sans clé INSEE,
 * `collectSirene` est un no-op strict (rien n'est écrit) ; BODACC est une donnée ouverte. Une panne sur une
 * ESN la laisse en tête du prochain tour et n'arrête pas les autres. Réglage : `ESN_REGISTRY_REREAD_PER_NIGHT`
 * (30 par défaut, `0` éteint). Le passage nocturne (02:10, verrou singleton) vit dans `WatchlistRefreshScheduler`.
 */
@Injectable()
export class EsnRegistryRotation {
  private readonly logger = new Logger(EsnRegistryRotation.name)

  constructor(
    @InjectRepository(EsnDirectoryEntity) private readonly esn: Repository<EsnDirectoryEntity>,
    private readonly watch: PublicRegistryWatch,
  ) {}

  async runNightly(now: Date): Promise<{ attempted: number; failed: number }> {
    const limit = esnRereadPerNight(process.env['ESN_REGISTRY_REREAD_PER_NIGHT'])
    if (limit === 0) return { attempted: 0, failed: 0 }
    const rows = (await this.esn.query(
      `SELECT e.siren
         FROM esn_directory e
         LEFT JOIN public_registry_watch_state s ON s.siren = e.siren
        WHERE e.siren IS NOT NULL
        ORDER BY s.sirene_checked_at ASC NULLS FIRST, e.siren ASC
        LIMIT $1`,
      [limit],
    )) as { siren: string | null }[]
    let attempted = 0
    let failed = 0
    for (const { siren } of rows) {
      if (!siren || !/^\d{9}$/.test(siren)) continue
      attempted += 1
      try {
        await this.watch.collectSirene(siren, now)
        await this.watch.collectBodacc(siren, now)
        await this.watch.syncEsnRisk(siren, now)
        // #3921.10 — les marchés GAGNÉS (titulaire) comptés au référentiel : `public_awards`.
        await this.watch.syncEsnAwards(siren, now)
      } catch (error) {
        failed += 1
        this.logger.warn('Relecture nocturne d’une ESN en échec — le tour continue', {
          siren,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    this.logger.log(`Relecture nocturne des ESN : ${attempted} lue(s), ${failed} en échec`)
    return { attempted, failed }
  }
}
