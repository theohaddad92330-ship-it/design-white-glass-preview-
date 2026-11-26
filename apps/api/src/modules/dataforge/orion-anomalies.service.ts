import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DataforgeAnomalyEntity } from '../../database/entities/dataforge-anomaly.entity'

export interface OrionAnomalyView {
  anomalieId: string
  code: string
  portee: string | null
  objet: string | null
  constat: string | null
  impactCommercial: string | null
  actionRecommandee: string | null
  severite: string
  source: string | null
  detecteLe: string | null
}

/**
 * Le registre qualité ORION V12 — `60_ANOMALIES_ET_CORRECTIONS.csv` ingéré.
 *
 * ⚠️ Ce service n'est PAS le seul chemin par lequel une anomalie atteint le
 * produit : chacune des 20 lignes a un miroir `type_chunk = GARDE_FOU_QUALITE`
 * dans `dataforge_rag_chunks`, INDEXÉ et jamais filtré (voir
 * `match_dataforge_rag_chunks`) — c'est ce miroir qui la rend lisible depuis
 * une recherche RAG, pas seulement depuis un écran back-office. Les deux
 * chemins sont vérifiés ensemble par `orion-anomalies-rag-parity.spec.ts`.
 */
@Injectable()
export class OrionAnomaliesService {
  constructor(
    @InjectRepository(DataforgeAnomalyEntity)
    private readonly anomalies: Repository<DataforgeAnomalyEntity>,
  ) {}

  /** Triées par sévérité (CRITIQUE d'abord) puis par identifiant — jamais par
   *  ordre d'insertion, qui ne dit rien de l'urgence. */
  async list(): Promise<OrionAnomalyView[]> {
    const rows = await this.anomalies.find()
    const rank = (severite: string) => ['CRITIQUE', 'MAJEUR', 'MINEUR'].indexOf(severite)
    return rows
      .sort((a, b) => rank(a.severite) - rank(b.severite) || a.anomalieId.localeCompare(b.anomalieId))
      .map(row => ({
        anomalieId: row.anomalieId,
        code: row.code,
        portee: row.portee,
        objet: row.objet,
        constat: row.constat,
        impactCommercial: row.impactCommercial,
        actionRecommandee: row.actionRecommandee,
        severite: row.severite,
        source: row.source,
        detecteLe: row.detecteLe,
      }))
  }

  async coverage(): Promise<{ anomalies: number; bySeverite: Record<string, number> }> {
    const anomalies = await this.anomalies.count()
    const rows = await this.anomalies.query(
      `SELECT severite, count(*)::int AS n FROM dataforge_data_anomalies GROUP BY 1`,
    )
    return {
      anomalies,
      bySeverite: Object.fromEntries((rows as { severite: string; n: number }[]).map(row => [row.severite, row.n])),
    }
  }
}
