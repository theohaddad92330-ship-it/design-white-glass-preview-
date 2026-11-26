import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { isFailure } from '@bellum/utils'
import {
  isSegmentCollectionStale,
  MISSING_ROLES_CATCHUP_CAPABILITY_AT,
  MISSING_ROLES_CATCHUP_MAX_ATTEMPTS,
  type MissingRolesCatchupOutcome,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { killSwitchCut } from '../../common/kill-switches'
import { OrgEnrichmentJobService } from './org-enrichment-job.service'

type ConcernedAccount = {
  id: string
  user_id: string
  missing_roles_catchup_at: Date | null
  missing_roles_catchup_attempts: number
}

/** Codes de {@link OrgEnrichmentFailure} qui disent « rien à retenter » : le
 *  compte est marqué rattrapé tout de suite, sans consommer une tentative
 *  supplémentaire à retenter en vain. */
const TERMINAL_FAILURE_CODES = new Set(['not_found', 'insufficient_credits', 'invalid_params'])

/**
 * #2637.1 (21/09/2026) — LE RATTRAPAGE AUTOMATIQUE DES RÔLES MANQUANTS.
 *
 * Voir le docblock de `packages/contracts/src/schemas/missing-roles-catchup.ts`
 * pour ce qui distingue ce service de `SegmentCatchupService` (#AF) : même
 * FORME (interrupteur, ciblage par date, lot borné, correction humaine
 * héritée), mais un chemin qui reste `OrgEnrichmentJobService.advance` — le
 * MÊME que le bouton « Enrichir les rôles manquants » — plutôt qu'un des cinq
 * chemins on-demand dédiés des autres segments.
 *
 * #2637.1 (21/09/2026, décision Louis) — GRATUIT, comme les six segments de
 * `SegmentCatchupService` : « un correctif de collecte rattrape l'existant »,
 * ça ne se facture pas au client. Contrairement à `access_relation` (qui
 * évite le chemin payant en entier), ici le chemin reste `advance` — c'est
 * `advance(..., { free: true })`, l'option `free` que SEUL cet appelant
 * passe, qui saute le débit sans toucher au bouton manuel. Voir
 * `OrgEnrichmentJobService.advance`/`create` et
 * `OrgEnrichmentPlannerService.runWave`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2637.1 — JAMAIS AUTOMATIQUE (même doctrine que #AF.4)
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun `onApplicationBootstrap`, aucun `@Cron`. Seul un appel EXPLICITE
 * (un futur `AdminMissingRolesCatchupController`, geste d'opérateur) atteint
 * `runCatchup`. Interrupteur `accounts.missing_roles_catchup`
 * (kill-switches.ts) : même appelé, un interrupteur coupé n'exécute rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne cherche rien lui-même. `OrgEnrichmentJobService.advance` — LE MÊME
 * chemin que le bouton « Enrichir les rôles manquants » — fait tout le
 * travail : créer/reprendre le job, choisir les zones blanches
 * (`CoverageService`), mesurer le coût réel. Appelé d'ICI, `advance` ne
 * débite JAMAIS le client (`{ free: true }`, #2637.1) — le coût reste
 * mesuré dans `actual_credits`, à notre charge. Ce service n'ajoute que le
 * CIBLAGE (comptes jamais rattrapés) et les DEUX bornes qui empêchent un
 * rattrapage automatique de tourner pour rien — voir `markAttempt`.
 */
@Injectable()
export class MissingRolesCatchupService {
  private readonly logger = new Logger(MissingRolesCatchupService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly orgEnrichmentJobs: OrgEnrichmentJobService,
  ) {}

  /**
   * Les comptes CONCERNÉS — lecture seule. Double lecture délibérée, même
   * idiome que `SegmentCatchupService.listConcernedAccountsForSegment` : le
   * SQL fait le premier tri sur DEUX critères (jamais un symptôme), et deux
   * fonctions pures tranchent en dernier mot :
   *  - `isSegmentCollectionStale(missing_roles_catchup_at, CAPABILITY_AT)` —
   *    jamais rattrapé DEPUIS que la capacité existe ;
   *  - `attempts < MAX_ATTEMPTS` — pas déjà épuisé.
   */
  async listConcernedAccounts(limit = 200): Promise<ConcernedAccount[]> {
    const capabilityAt = MISSING_ROLES_CATCHUP_CAPABILITY_AT
    const rows = await this.accounts.manager.query<ConcernedAccount[]>(
      `SELECT id, user_id, missing_roles_catchup_at, missing_roles_catchup_attempts
         FROM accounts
        WHERE status <> 'deleted'
          AND entities_collected_at IS NOT NULL
          AND missing_roles_catchup_attempts < $1
          AND (missing_roles_catchup_at IS NULL OR missing_roles_catchup_at < $2)
        ORDER BY updated_at ASC
        LIMIT $3`,
      [MISSING_ROLES_CATCHUP_MAX_ATTEMPTS, capabilityAt, limit],
    )
    return rows.filter(
      row =>
        isSegmentCollectionStale(row.missing_roles_catchup_at, capabilityAt) &&
        row.missing_roles_catchup_attempts < MISSING_ROLES_CATCHUP_MAX_ATTEMPTS,
    )
  }

  /**
   * Le rattrapage lui-même. `operatorUserId` ne sert qu'à la TRACE — chaque
   * compte est rejoué AU NOM DE SON PROPRIÉTAIRE (`row.user_id`), jamais un
   * espace pour un autre. Un compte qui échoue n'arrête pas les autres.
   */
  async runCatchup(operatorUserId: string, limit = 200): Promise<MissingRolesCatchupOutcome> {
    if (killSwitchCut('accounts.missing_roles_catchup')) {
      this.logger.log('Rattrapage rôles manquants coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, launched: 0, skipped: 0, failed: 0, cut: true }
    }

    const rows = await this.listConcernedAccounts(limit)
    let launched = 0
    let skipped = 0
    let failed = 0
    for (const row of rows) {
      try {
        // #2637.1 — gratuit, décision Louis 21/09/2026 : ce rattrapage est à
        // NOTRE charge, aligné sur les six segments de `SegmentCatchupService`
        // (« un correctif de collecte rattrape l'existant », il ne se facture
        // pas au client). `{ free: true }` est le SEUL appel de ce dépôt qui le
        // passe — le bouton manuel `enrich-gaps` (`analysis.controller.ts`)
        // appelle `advance` sans cette option et continue de débiter.
        const outcome = await this.orgEnrichmentJobs.advance(
          row.id,
          row.user_id,
          { mode: 'missing_roles' },
          undefined,
          {
            free: true,
          },
        )
        if (isFailure(outcome)) {
          const terminal = TERMINAL_FAILURE_CODES.has(outcome.problem.code)
          if (terminal) {
            skipped += 1
          } else {
            failed += 1
          }
          this.logger.warn('Rattrapage rôles manquants échoué pour un compte', {
            accountId: row.id,
            problem: outcome.problem,
          })
          await this.markAttempt(row, { terminal })
        } else {
          launched += 1
          const terminal = outcome.output.job.status === 'completed'
          await this.markAttempt(row, { terminal })
        }
      } catch (error) {
        failed += 1
        this.logger.warn('Rattrapage rôles manquants échoué pour un compte', { accountId: row.id, error })
        await this.markAttempt(row, { terminal: false })
      }
    }
    this.logger.log('Rattrapage rôles manquants terminé', {
      operatorUserId,
      scanned: rows.length,
      launched,
      skipped,
      failed,
    })
    return { scanned: rows.length, launched, skipped, failed, cut: false }
  }

  /**
   * Le SECOND garde-fou (voir le docblock du fichier de contrat) : un compte
   * dont le job est allé au bout (`completed`), ou dont l'échec est TERMINAL
   * (rien à chercher, crédit insuffisant, paramètres invalides), est marqué
   * rattrapé TOUT DE SUITE — `missing_roles_catchup_at = now()`. Un compte
   * dont le job reste `pending`/`running`/`partial` après un échec RETENTABLE
   * (`ia_failed`, ou une exception) n'est marqué que si ses tentatives sont
   * ÉPUISÉES — sinon il reste concerné pour le prochain passage.
   *
   * ⚠️ `missing_roles_catchup_attempts` s'incrémente TOUJOURS d'un passage à
   * l'autre, même sur un succès terminal — c'est ce compteur, jamais la seule
   * date, qui borne les REPRISES d'un job qui ne finit jamais.
   */
  private async markAttempt(row: ConcernedAccount, opts: { terminal: boolean }): Promise<void> {
    const attempts = row.missing_roles_catchup_attempts + 1
    const giveUp = opts.terminal || attempts >= MISSING_ROLES_CATCHUP_MAX_ATTEMPTS
    await this.accounts.update(
      row.id,
      giveUp
        ? { missing_roles_catchup_attempts: attempts, missing_roles_catchup_at: new Date() }
        : { missing_roles_catchup_attempts: attempts },
    )
  }
}
