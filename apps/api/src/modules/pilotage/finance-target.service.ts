import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { FinanceMarginTarget } from '@bellum/contracts'
import { FinanceMarginTargetEntity } from '../../database/entities/finance-margin-target.entity'

/**
 * L'objectif mensuel de marge — le réglage que l'anneau « Taux de réalisation »
 * compare (D7 du 26/08, LEVÉ par Louis le 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL NE CALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Comme `StockSnapshotService`, et c'est structurel : ce service lit et écrit UN
 * nombre. La division qui en fait un taux de réalisation vit dans
 * `marginAttainment` (contrats), à un seul endroit, avec les trois cas où elle
 * refuse de répondre. Refaire ici « marge / objectif » aurait donné deux
 * dérivations pour un chiffre — et le jour où l'une gère un cas de bord que
 * l'autre ignore, l'écran et l'export ne disent plus la même chose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REND QUAND IL N'Y A RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `{ targetPercent: null, setAt: null }` — **jamais un objectif par défaut**,
 * jamais zéro. Un espace qui n'a rien saisi n'a pas un objectif de 0 % : il n'en
 * a pas, et l'anneau doit le dire avec le geste qui le répare.
 *
 * ⚠️ Une lecture EN ÉCHEC rend la même chose qu'une absence, et c'est une perte
 * assumée : l'écran n'a rien d'autre d'honnête à afficher (il ne peut pas
 * inventer un objectif). La panne, elle, se journalise en `error` pour se voir
 * quelque part — le même arbitrage que `StockSnapshotService.baselineFor`.
 */
@Injectable()
export class FinanceTargetService {
  private readonly logger = new Logger(FinanceTargetService.name)

  constructor(
    @InjectRepository(FinanceMarginTargetEntity)
    private readonly targets: Repository<FinanceMarginTargetEntity>,
  ) {}

  /** L'objectif du mois, ou l'absence d'objectif. Jamais une exception. */
  async forMonth(workspaceId: string, month: string): Promise<FinanceMarginTarget> {
    try {
      const row = await this.targets.findOne({ where: { workspace_id: workspaceId, month } })
      return toTarget(month, row)
    } catch (error) {
      this.logger.error("Lecture de l'objectif de marge en échec", { error })
      return { month, targetPercent: null, setAt: null }
    }
  }

  /**
   * Saisir — ou EFFACER — l'objectif du mois.
   *
   * `targetPercent: null` supprime la ligne. « On ne se fixe plus de cible ce
   * mois-ci » est une décision, et la garder en base avec une valeur que
   * personne n'assume ferait mentir l'anneau jusqu'à la fin du mois.
   *
   * ⚠️ `ON CONFLICT … DO UPDATE`, et non `DO NOTHING` : c'est l'inverse exact de
   * la photo mensuelle juste à côté, et les deux ont raison. Une photo est un
   * FAIT observé — la première gagne, on ne réécrit pas le passé. Un objectif
   * est une DÉCISION — la dernière gagne, « une correction humaine gagne
   * toujours ».
   */
  async set(
    workspaceId: string,
    month: string,
    targetPercent: number | null,
    userId: string,
  ): Promise<FinanceMarginTarget> {
    if (targetPercent === null) {
      await this.targets.delete({ workspace_id: workspaceId, month })
      return { month, targetPercent: null, setAt: null }
    }
    await this.targets.query(
      `INSERT INTO finance_margin_targets (workspace_id, month, target_percent, set_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, month)
       DO UPDATE SET target_percent = EXCLUDED.target_percent,
                     set_by = EXCLUDED.set_by,
                     updated_at = now()`,
      [workspaceId, month, targetPercent, userId],
    )
    const row = await this.targets.findOne({ where: { workspace_id: workspaceId, month } })
    return toTarget(month, row)
  }
}

/**
 * La ligne en base → ce que l'écran lit.
 *
 * ⚠️ `target_percent` est un `numeric` : le pilote pg le remonte en CHAÎNE
 * (« 25.00 »). Sans ce `Number(...)`, l'écran comparerait une chaîne à un nombre
 * et `marginAttainment` verrait un `typeof !== 'number'` — c'est-à-dire qu'il
 * répondrait « aucun objectif saisi » sur un objectif parfaitement saisi.
 *
 * Une valeur ILLISIBLE (une ligne écrite avant la contrainte, un pilote qui
 * change) vaut une ABSENCE, jamais zéro.
 */
function toTarget(month: string, row: FinanceMarginTargetEntity | null): FinanceMarginTarget {
  if (!row) return { month, targetPercent: null, setAt: null }
  const parsed = Number(row.target_percent)
  if (!Number.isFinite(parsed) || parsed <= 0) return { month, targetPercent: null, setAt: null }
  return {
    month: row.month,
    targetPercent: parsed,
    setAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at ?? null),
  }
}
