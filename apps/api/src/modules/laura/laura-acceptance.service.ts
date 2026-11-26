import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThanOrEqual, Not, IsNull, Repository } from 'typeorm'
import {
  computeSurfaceAcceptance,
  LAURA_INTERVENTIONS,
  surfaceAcceptanceOutcome,
  type SurfaceAcceptanceMeasure,
  type SurfaceAcceptanceOutcome,
} from '@bellum/contracts'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { OBSERVABILITY_ALERT_SETTINGS, readPositiveNumber } from '../analytics/observability-alerts'

/**
 * LE COMPTEUR D'ACCEPTATION PAR SURFACE — la lecture agrégée (D643-D648).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET POURQUOI ELLE NE FILTRE PAS PAR ESPACE
 * ─────────────────────────────────────────────────────────────────────────────
 * `laura_interventions` porte déjà tout ce dont ce compteur a besoin —
 * `intervention_key`, `reaction`, `created_at` (et `workspace_id`, que cette
 * lecture NE borne PAS). C'est un choix, pas un oubli : la question posée —
 * « cette surface mérite-t-elle encore d'interrompre le commercial ? » — est
 * une décision de CATALOGUE, qui vaut pour tous les espaces, pas une décision
 * par tenant. Le plafond d'interruption est de 1 à 5 par JOUR, TOUTES surfaces
 * confondues (`interruption-budget.ts`) ; un seul espace n'atteindrait quasiment
 * jamais `OBSERVABILITY_ALERT_MIN_SAMPLE` observations sur UNE surface en 30
 * jours. Borner par espace rendrait ce compteur structurellement inexploitable.
 * Même logique que `observability-alerts.ts`, qui agrège déjà tous les espaces
 * pour les mêmes raisons — un signal produit, pas un signal par tenant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne décide rien (D648) : pas de filtrage sous 15 %, pas de retrait de
 * catalogue. Elle rend un `SurfaceAcceptanceMeasure` par clé du catalogue —
 * `measured`, ou `unmeasured` avec sa raison NOMMÉE. Le seuil d'action reste
 * une décision produit, à prendre une fois ce chiffre VISIBLE.
 */

/** La fenêtre glissante — 30 jours, comme la source le demande. Un réglage vit
 *  à un seul endroit (GA-26) : ni la contracts, ni un opérateur ne la répètent. */
const ACCEPTANCE_WINDOW_DAYS = 30

/** Un plafond de lignes lues, sur le même principe que `cost-alert.service.ts` :
 *  une fenêtre bornée dans le temps reste en théorie non bornée en VOLUME. */
const MAX_ROWS = 20_000

@Injectable()
export class LauraAcceptanceService {
  constructor(
    @InjectRepository(LauraInterventionEntity)
    private readonly interventions: Repository<LauraInterventionEntity>,
  ) {}

  /**
   * Le taux d'acceptation de CHAQUE surface du catalogue, sur les 30 derniers
   * jours glissants.
   *
   * La carte porte TOUJOURS une entrée par clé du catalogue — y compris celles
   * qui n'ont rien proposé (`no_observation`) : c'est ce qui distingue « cette
   * surface n'a rien à mesurer » (nommé) de « cette clé n'existe pas »
   * (un bug côté appelant).
   */
  async bySurface(now = new Date()): Promise<ReadonlyMap<string, SurfaceAcceptanceMeasure>> {
    const since = new Date(now.getTime() - ACCEPTANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const rows = await this.interventions.find({
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026) :
      // une trace OUBLIÉE ne pèse plus dans le taux d'acceptation de sa surface.
      // Elle était DÉTRUITE avant ce lot — l'exclure rend la MÊME mesure.
      where: { created_at: MoreThanOrEqual(since), reaction: Not(IsNull()), archived_at: IsNull() },
      select: ['intervention_key', 'reaction'],
      take: MAX_ROWS,
    })

    const outcomesByKey = new Map<string, SurfaceAcceptanceOutcome[]>()
    for (const row of rows) {
      const outcome = surfaceAcceptanceOutcome(row.reaction)
      // `null` ici veut dire « la réaction persistée n'est ni `acted`, ni
      // `refused`, ni `closed_unread` » — une trace ancienne au vocabulaire
      // périmé, jamais un rejet (D644).
      if (!outcome) continue
      const list = outcomesByKey.get(row.intervention_key)
      if (list) list.push(outcome)
      else outcomesByKey.set(row.intervention_key, [outcome])
    }

    const minSample = readPositiveNumber(
      process.env[OBSERVABILITY_ALERT_SETTINGS.minSample.env],
      OBSERVABILITY_ALERT_SETTINGS.minSample.fallback,
    )

    const result = new Map<string, SurfaceAcceptanceMeasure>()
    for (const intervention of LAURA_INTERVENTIONS) {
      result.set(intervention.key, computeSurfaceAcceptance(outcomesByKey.get(intervention.key) ?? [], minSample))
    }
    return result
  }
}
