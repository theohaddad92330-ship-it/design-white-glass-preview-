import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FIRST_PROOF_VERDICTS } from '@bellum/contracts'
import { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'

type FirstProofVerdict = (typeof FIRST_PROOF_VERDICTS)[number]

/** Miroir côté back-office : `apps/dashboard-manager/src/app/produit/premiere-preuve/premiere-preuve.client.ts`. */
export type FirstProofRecetteReport = {
  windowDays: number
  /** Verdicts PARTAGÉS (`generalized_only`) sur la fenêtre, par verdict. */
  verdicts: Record<FirstProofVerdict, number>
  /** Somme de `verdicts`. */
  shared: number
  /** Nombre d'espaces DISTINCTS derrière `shared` — un compte, jamais un nom. */
  distinctWorkspaces: number
  /** Verdicts restés privés à leur espace (`tenant_private`) : un COMPTE
   *  seulement — ils existent, la recette ne les lit pas. */
  withheldPrivate: number
  computedAt: string
}

const DEFAULT_WINDOW_DAYS = 90
const MAX_WINDOW_DAYS = 365

/**
 * #2076.13 — « ce retour enrichit le workspace ET la recette produit ».
 *
 * Le côté ESPACE existait (`AccountFeedbackService.assembleDirectives`, les
 * corrections réinjectées aux runs du même compte). Le côté RECETTE PRODUIT
 * manquait : l'éditeur ne savait pas, tous espaces confondus, si la première
 * analyse sur un compte connu est jugée juste, partielle, fausse ou incomplète.
 *
 * Une LECTURE agrégée, pas une deuxième écriture : un miroir vers
 * `beta_feedback` ouvrirait une issue GitHub par clic (diagnostic du 22/09).
 *
 * ⚠️ Inter-espaces, donc sous GA-47 (`feedback-reuse.ts`) : chaque requête
 * filtre sur `reuse_scope` et ne nomme AUCUNE colonne de texte libre — seul
 * le MOTIF (cible + verdict) sort, et seulement des espaces qui l'ont décidé
 * (`offer_portfolio.privacy.feedback_reuse`, recopié sur la ligne par
 * `AccountFeedbackService.create`). Les retours privés sont COMPTÉS, jamais
 * lus : la tuile dit ce qu'on sait, pas ce que le marché pense (GA-259).
 */
@Injectable()
export class FirstProofRecetteService {
  constructor(
    @InjectRepository(AccountFeedbackEntity)
    private readonly feedback: Repository<AccountFeedbackEntity>,
  ) {}

  async report(days: number | undefined, now: Date): Promise<FirstProofRecetteReport> {
    const windowDays = Math.min(MAX_WINDOW_DAYS, Math.max(1, Math.trunc(days ?? DEFAULT_WINDOW_DAYS)))
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
    const verdictList = FIRST_PROOF_VERDICTS.map(verdict => `'${verdict}'`).join(', ')

    const byVerdict: { verdict: string; n: string | number }[] = await this.feedback.query(
      `SELECT f.verdict, count(*) AS n
         FROM account_feedback f
        WHERE f.reuse_scope = 'generalized_only'
          AND f.target = 'global'
          AND f.verdict IN (${verdictList})
          AND f.created_at >= $1
        GROUP BY f.verdict`,
      [since],
    )
    const totals: { workspaces: string | number; withheld: string | number }[] = await this.feedback.query(
      `SELECT count(DISTINCT f.workspace_id) FILTER (WHERE f.reuse_scope = 'generalized_only') AS workspaces,
              count(*) FILTER (WHERE f.reuse_scope = 'tenant_private') AS withheld
         FROM account_feedback f
        WHERE f.target = 'global'
          AND f.verdict IN (${verdictList})
          AND f.created_at >= $1`,
      [since],
    )

    const verdicts = Object.fromEntries(FIRST_PROOF_VERDICTS.map(verdict => [verdict, 0])) as Record<
      FirstProofVerdict,
      number
    >
    for (const row of byVerdict) {
      if ((FIRST_PROOF_VERDICTS as readonly string[]).includes(row.verdict)) {
        verdicts[row.verdict as FirstProofVerdict] = Number(row.n) || 0
      }
    }
    return {
      windowDays,
      verdicts,
      shared: FIRST_PROOF_VERDICTS.reduce((sum, verdict) => sum + verdicts[verdict], 0),
      distinctWorkspaces: Number(totals[0]?.workspaces) || 0,
      withheldPrivate: Number(totals[0]?.withheld) || 0,
      computedAt: now.toISOString(),
    }
  }
}
