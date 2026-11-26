import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { Contribution, ContributionLine } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'

/**
 * Ce que Bellum a contribué (tome 1 §12).
 *
 * Quatre comptages, aucun montant. La règle est écrite dans le contrat et elle
 * porte tout le bloc : on n'écrit jamais « Bellum vous a fait gagner 42 000 € »,
 * on écrit « 3 missions signées sur des comptes ouverts via Découvrir ». La
 * causalité appartient au commercial.
 *
 * Chaque ligne est une LECTURE séparée : un `Promise.all` ferait disparaître
 * les quatre parce qu'une seule requête a raté — la leçon de la vue Qualité.
 */
@Injectable()
export class ContributionService {
  private readonly logger = new Logger(ContributionService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  async forWorkspace(workspaceId: string, sinceDays = 90): Promise<Contribution> {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
    const lines: ContributionLine[] = [
      {
        key: 'accounts_opened',
        count: await this.count(
          'accounts_opened',
          `SELECT COUNT(*)::int AS n FROM accounts
            WHERE workspace_id = $1 AND origin = 'discover' AND created_at >= $2
              AND status NOT IN ('deleted')`,
          [workspaceId, since],
        ),
        attribution: 'direct',
      },
      {
        key: 'needs_from_signal',
        count: await this.count(
          'needs_from_signal',
          `SELECT COUNT(*)::int AS n FROM opportunities o
            JOIN accounts a ON a.id = o.account_id
           WHERE o.workspace_id = $1 AND o.kind = 'signal' AND o.first_detected_at >= $2
             AND a.status NOT IN ('deleted')`,
          [workspaceId, since],
        ),
        attribution: 'direct',
      },
      {
        key: 'submissions_from_matching',
        count: await this.count(
          'submissions_from_matching',
          `SELECT COUNT(*)::int AS n FROM submissions s
            WHERE s.workspace_id = $1 AND s.created_at >= $2
              AND s.pushable_score IS NOT NULL`,
          [workspaceId, since],
        ),
        attribution: 'direct',
      },
      {
        key: 'missions_signed',
        // ATTRIBUTION PARTIELLE, assumée : une mission signée sur un compte
        // ouvert via Découvrir a été gagnée par un commercial. Le lien est réel,
        // l'issue ne lui est pas imputable, et confondre les deux
        // transformerait un fait en publicité.
        count: await this.count(
          'missions_signed',
          `SELECT COUNT(*)::int AS n FROM missions m
            JOIN accounts a ON a.id = m.account_id
           WHERE m.workspace_id = $1 AND m.created_at >= $2 AND a.origin = 'discover'`,
          [workspaceId, since],
        ),
        attribution: 'partial',
      },
    ]

    return {
      lines,
      since,
      // Les comptes antérieurs au marquage. Annoncés, jamais absorbés : les
      // compter comme « pas venus de Découvrir » sous-estimerait la
      // contribution, les compter dedans l'inventerait.
      unattributedAccounts: await this.count(
        'unattributed_accounts',
        `SELECT COUNT(*)::int AS n FROM accounts
          WHERE workspace_id = $1 AND origin IS NULL AND status NOT IN ('deleted')`,
        [workspaceId],
      ),
    }
  }

  /**
   * Une lecture qui échoue rend `null` — jamais `0` — et n'emporte pas les
   * quatre autres.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI `null`, ET NON `0`
   * ─────────────────────────────────────────────────────────────────────────
   * Ce `catch` rendait `0` jusqu'au 29/08/2026, et ce bloc est monté sur
   * `/pilotage` — l'écran qui édicte « un taux sans dénominateur vaut non
   * mesuré, pas 0 % ». Une requête cassée y écrivait donc « 0 compte ouvert
   * grâce à Découvrir », strictement indiscernable du vrai zéro d'un espace
   * neuf. Le défaut était déjà NOMMÉ dans ce module — `stock-snapshot.service`
   * citait ce fichier parmi les dérivations à faux zéro — sans avoir été
   * corrigé ici.
   *
   * La distinction qui compte : un zéro RENDU par la base reste `0`, parce que
   * c'est une réponse. Seule l'absence de réponse vaut `null`.
   *
   * ⚠️ `error` et non `warn` : même arbitrage que la vue Qualité. Un comptage
   * illisible n'est pas un état dégradé, c'est un BUG — et le transport Sentry
   * ne capture que les `error`. Un `warn` laissait ce faux zéro invisible.
   */
  private async count(key: string, sql: string, params: unknown[]): Promise<number | null> {
    try {
      const rows = await this.accounts.manager.query<{ n: number }[]>(sql, params)
      // `SELECT COUNT(*)` rend TOUJOURS une ligne : son absence est une anomalie
      // de lecture, pas un zéro. `?? 0` la faisait passer pour un résultat.
      return rows[0]?.n ?? null
    } catch (error) {
      // La CLÉ est journalisée, pas seulement l'échec : « un comptage de
      // contribution a raté » n'envoie personne nulle part, et c'est le même
      // manque qui laissait ce défaut vivre.
      this.logger.error(`Comptage de contribution en échec (${key}): ${String(error)}`, {
        error,
        tags: { contribution: key },
      })
      return null
    }
  }
}
