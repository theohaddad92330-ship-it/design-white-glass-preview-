import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EnrichmentDurationSampleEntity } from '../../database/entities/enrichment-duration-sample.entity'

/** Fenêtre de lecture — les N dernières mesures, jamais tout l'historique. */
const SAMPLE_WINDOW = 50

/** En dessous de ce nombre, `estimate()` rend `null` (non mesuré ≠ 0). */
const MIN_SAMPLES_FOR_ESTIMATE = 5

type EnrichmentDurationEstimate = {
  medianMs: number
  sampleSize: number
}

/**
 * #2120.57 / #2297.23 — la durée d'un enrichissement se MESURE et s'annonce.
 *
 * `record()` journalise chaque appel `ContactsService.enrichContact` qui n'a
 * PAS levé (succès ou « rien trouvé » — un échec technique n'appelle jamais
 * cette méthode). Best-effort, comme `ProviderCostService.record` : une ligne
 * manquée ne doit jamais faire échouer un enrichissement payé.
 *
 * #2120.57 (b) — mesuré en production le 20/09 : une réponse « rien trouvé »
 * revient quasi instantanément, un enrichissement qui ABOUTIT prend 30 à
 * 85 s (`contacts.module.ts`). Les deux étaient mélangés dans la même
 * médiane, qui ne répondait plus à la question de l'écran. `found` distingue
 * les deux SANS retirer le « rien trouvé » de l'enregistrement (le
 * commentaire de l'entité explique pourquoi il est toujours écrit — les deux
 * sont des RÉPONSES du fournisseur, pas des incidents) : `estimate()` ne
 * prend la médiane que sur les lignes `found = true`, parce que la question
 * de l'écran (« combien de temps vais-je attendre ? ») porte sur l'attente
 * UTILE, pas sur la latence d'une réponse vide.
 *
 * `estimate()` rend la MÉDIANE des `SAMPLE_WINDOW` dernières mesures ABOUTIES
 * — pas la moyenne, qui se laisserait tirer par une cascade exceptionnelle
 * (jusqu'à 85 s documentés). En dessous de `MIN_SAMPLES_FOR_ESTIMATE`, `null`
 * : un dialogue qui affiche une estimation sur 2 ou 3 mesures mentirait par
 * excès de confiance — et une ligne écrite AVANT `found` (`NULL`) n'est ni
 * comptée `true` ni `false`, elle reste hors de l'estimation.
 */
@Injectable()
export class EnrichmentDurationService {
  private readonly logger = new Logger(EnrichmentDurationService.name)

  constructor(
    @InjectRepository(EnrichmentDurationSampleEntity)
    private readonly samples: Repository<EnrichmentDurationSampleEntity>,
  ) {}

  async record(durationMs: number, found: boolean): Promise<void> {
    // Une durée négative ne peut être qu'un bug de mesure (horloge, appel mal
    // borné) — mieux vaut ne rien écrire qu'écrire une valeur impossible que
    // la contrainte CHECK refuserait de toute façon.
    if (durationMs < 0) return
    try {
      await this.samples.insert({ duration_ms: Math.round(durationMs), found })
    } catch (error) {
      this.logger.warn('Enrichment duration not recorded', { error })
    }
  }

  async estimate(): Promise<EnrichmentDurationEstimate | null> {
    const rows = await this.samples.find({
      where: { found: true },
      order: { measured_at: 'DESC' },
      take: SAMPLE_WINDOW,
    })
    if (rows.length < MIN_SAMPLES_FOR_ESTIMATE) return null

    const sorted = rows.map(row => row.duration_ms).sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianMs = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!

    return { medianMs, sampleSize: rows.length }
  }
}
