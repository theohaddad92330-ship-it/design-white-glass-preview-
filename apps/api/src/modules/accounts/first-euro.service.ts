import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  distanceToFirstEuro,
  FIRST_EURO_STEPS,
  INTAKE_STAGES,
  projectStageNotInSql,
  type DistanceToFirstEuro,
  type FirstEuroStep,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'

/**
 * LA DISTANCE AU PREMIER EURO — PDF 2 §7.4, ticket `BEL-ACC-107` PR4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il LIT deux choses et n'en calcule aucune :
 *  1. quelles étapes ce compte a déjà franchies — huit `EXISTS`, un par étape ;
 *  2. le délai médian OBSERVÉ de chaque étape, sur les missions CLOSES de
 *     l'espace.
 *
 * Le calcul lui-même vit dans `@bellum/contracts` (`distanceToFirstEuro`), pur
 * et testé sans base. C'est ce que le PDF 1 §3 demande : « une règle métier
 * enfouie dans un service NestJS ne se teste qu'avec une base de données ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUNE ÉTAPE N'EST DÉDUITE D'UNE AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une mission démarrée n'allume pas « contact identifié ». Un compte repris
 * d'un import a des missions sans le moindre contact en base, et lui inventer
 * une étape franchie raccourcirait sa distance sur la foi d'un raisonnement.
 * Chaque `EXISTS` regarde SA table, et rien d'autre.
 *
 * ⚠️ CE N'EST PAS UNE PROBABILITÉ. Voir l'en-tête du contrat : un compte
 * d'étapes et une somme de médianes observées, jamais un pari sur l'issue.
 */

/**
 * « Le besoin est FORMULÉ » = l'affaire est sortie de l'intake.
 *
 * Écrit par `projectStageNotInSql(INTAKE_STAGES)` et jamais à la main : la
 * définition d'un sous-ensemble de stades vit à UN seul endroit (GA-57), et
 * `won`, `lost` et `dormant` en font partie — un compte gagné a évidemment
 * exprimé son besoin, et l'exclure raccourcirait sa distance à tort.
 */
const NEED_EXPRESSED_STAGES = projectStageNotInSql('o.stage', INTAKE_STAGES)

/** Le SQL d'une étape : la condition qui prouve qu'elle est franchie. */
const REACHED_SQL: Readonly<Record<FirstEuroStep, string>> = {
  // Quelqu'un de nommé, chez le client.
  contact_identified: `EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = a.id)`,
  // Il a RÉPONDU. `direction = 'inbound'` est le seul fait qui ne dépende pas
  // de nous — c'est ce qui distingue cette étape de la précédente.
  reply_obtained: `EXISTS (SELECT 1 FROM activities ac WHERE ac.account_id = a.id AND ac.direction = 'inbound')`,
  // Un besoin FORMULÉ : une affaire sortie de l'intake, qui n'est que ce que
  // l'analyse a supposé sans qu'un humain l'ait regardé.
  need_expressed: `EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = a.id AND ${NEED_EXPRESSED_STAGES})`,
  // Un profil PARTI — `submitted_at` non nul, jamais la simple existence d'une
  // ligne : une shortlist préparée n'est pas un envoi.
  profile_sent: `EXISTS (
      SELECT 1 FROM submissions s
      JOIN opportunities o ON o.id = s.project_id
      WHERE o.account_id = a.id AND s.submitted_at IS NOT NULL)`,
  interview: `EXISTS (
      SELECT 1 FROM interviews i
      JOIN submissions s ON s.id = i.submission_id
      JOIN opportunities o ON o.id = s.project_id
      WHERE o.account_id = a.id)`,
  agreement: `EXISTS (SELECT 1 FROM opportunities o WHERE o.account_id = a.id AND o.outcome = 'won')`,
  // DÉMARRÉE, pas signée : `started_on` passé. Une mission en `onboarding`
  // avec une date de démarrage au mois prochain n'a pas commencé.
  mission_started: `EXISTS (
      SELECT 1 FROM missions m
      WHERE m.account_id = a.id AND m.started_on IS NOT NULL AND m.started_on <= CURRENT_DATE)`,
  // LE premier euro : une facture réellement émise (`invoiced_at`).
  first_invoice: `EXISTS (
      SELECT 1 FROM invoice_readiness r
      JOIN missions m ON m.id = r.mission_id
      WHERE m.account_id = a.id AND r.invoiced_at IS NOT NULL)`,
}

/**
 * La DATE de chaque jalon, pour une mission close — c'est elle qui permet de
 * mesurer un délai d'étape. Chaque expression rend `NULL` quand le jalon n'a
 * pas laissé de trace, et un `NULL` retire simplement cette mission de la
 * médiane de CETTE étape : on ne remplace jamais une date manquante.
 */
const MILESTONE_SQL: Readonly<Record<FirstEuroStep, string>> = {
  contact_identified: `(SELECT MIN(c.created_at) FROM contacts c WHERE c.account_id = m.account_id)`,
  reply_obtained: `(SELECT MIN(ac.occurred_at) FROM activities ac WHERE ac.account_id = m.account_id AND ac.direction = 'inbound')`,
  need_expressed: `(SELECT MIN(o.first_detected_at) FROM opportunities o WHERE o.account_id = m.account_id AND ${NEED_EXPRESSED_STAGES})`,
  profile_sent: `(SELECT MIN(s.submitted_at) FROM submissions s JOIN opportunities o ON o.id = s.project_id WHERE o.account_id = m.account_id AND s.submitted_at IS NOT NULL)`,
  interview: `(SELECT MIN(i.scheduled_at) FROM interviews i JOIN submissions s ON s.id = i.submission_id JOIN opportunities o ON o.id = s.project_id WHERE o.account_id = m.account_id)`,
  agreement: `(SELECT MIN(o.closed_at) FROM opportunities o WHERE o.account_id = m.account_id AND o.outcome = 'won')`,
  mission_started: `m.started_on::timestamptz`,
  first_invoice: `(SELECT MIN(r.invoiced_at) FROM invoice_readiness r WHERE r.mission_id = m.id AND r.invoiced_at IS NOT NULL)`,
}

/** Les statuts d'une mission CLOSE — celles sur lesquelles une médiane a un sens. */
const CLOSED_MISSION_STATUSES = ['ended', 'terminated'] as const

type MilestoneRow = Partial<Record<FirstEuroStep, string | null>>

@Injectable()
export class FirstEuroService {
  private readonly logger = new Logger(FirstEuroService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * La distance d'UN compte à sa première facture.
   *
   * Deux lectures : les étapes de ce compte, et l'historique de l'espace. La
   * seconde est la même pour tous les comptes — un appelant qui en classe
   * plusieurs a intérêt à passer par {@link forAccounts}.
   */
  async forAccount(accountId: string, workspaceId: string): Promise<DistanceToFirstEuro> {
    const [reached, medians, closedMissions] = await Promise.all([
      this.reachedSteps(accountId, workspaceId),
      this.medianDaysByStep(workspaceId),
      this.closedMissionCount(workspaceId),
    ])
    return distanceToFirstEuro({ reached, medianDaysByStep: medians, closedMissions })
  }

  /**
   * La distance de PLUSIEURS comptes, l'historique lu une seule fois.
   *
   * C'est ce que le tri de la source demande — « un compte à 3 étapes bat un
   * compte à 8 » suppose de comparer, donc de calculer pour tout un
   * portefeuille. Une lecture d'historique par compte rendrait le tri
   * inutilisable au-delà de vingt lignes.
   */
  async forAccounts(accountIds: readonly string[], workspaceId: string): Promise<Record<string, DistanceToFirstEuro>> {
    if (accountIds.length === 0) return {}
    const [medians, closedMissions] = await Promise.all([
      this.medianDaysByStep(workspaceId),
      this.closedMissionCount(workspaceId),
    ])
    const out: Record<string, DistanceToFirstEuro> = {}
    for (const accountId of accountIds) {
      const reached = await this.reachedSteps(accountId, workspaceId)
      out[accountId] = distanceToFirstEuro({ reached, medianDaysByStep: medians, closedMissions })
    }
    return out
  }

  /** Les étapes franchies par ce compte. Une lecture qui échoue rend `[]` :
   *  « on ne sait pas » se lit alors « tout reste à faire », ce qui est le
   *  côté PRUDENT de l'erreur — jamais une distance raccourcie. */
  private async reachedSteps(accountId: string, workspaceId: string): Promise<FirstEuroStep[]> {
    const columns = FIRST_EURO_STEPS.map(step => `${REACHED_SQL[step]} AS ${step}`).join(',\n      ')
    try {
      const rows = (await this.accounts.manager.query(
        `SELECT ${columns} FROM accounts a WHERE a.id = $1 AND a.workspace_id = $2`,
        [accountId, workspaceId],
      )) as Array<Record<string, boolean>>
      const row = rows[0]
      if (!row) return []
      return FIRST_EURO_STEPS.filter(step => row[step] === true)
    } catch (error) {
      this.logger.error('first-euro reached steps failed', { error })
      return []
    }
  }

  /**
   * Le délai médian de chaque étape, en jours, sur les missions CLOSES.
   *
   * ⚠️ La médiane se prend sur les deltas ENTRE JALONS CONSÉCUTIFS, et une
   * mission dont l'un des deux jalons manque ne compte simplement pas pour
   * cette étape-là. Deux conséquences voulues : une étape peut rester sans
   * médiane alors que les autres en ont une (le contrat la NOMME), et aucune
   * date absente n'est remplacée par une autre.
   *
   * ⚠️ Un delta NÉGATIF est ÉCARTÉ, pas ramené à zéro : il signale un ordre
   * d'évènements que le modèle ne décrit pas (un besoin exprimé avant le
   * premier contact, ce qui arrive par un partenaire). Le compter comme « zéro
   * jour » raccourcirait la médiane de toutes les autres.
   */
  private async medianDaysByStep(workspaceId: string): Promise<Partial<Record<FirstEuroStep, number>>> {
    const milestones = FIRST_EURO_STEPS.map(step => `${MILESTONE_SQL[step]} AS ${step}`).join(',\n        ')
    try {
      const rows = (await this.accounts.manager.query(
        `SELECT ${milestones}
         FROM missions m
         WHERE m.workspace_id = $1 AND m.status = ANY($2::text[])`,
        [workspaceId, [...CLOSED_MISSION_STATUSES]],
      )) as MilestoneRow[]

      const samples = new Map<FirstEuroStep, number[]>()
      for (const row of rows) {
        // La PREMIÈRE étape n'a pas de jalon précédent : son délai serait
        // compté depuis une origine qui n'existe pas. On ne l'estime donc pas
        // — et le contrat la nommera « non mesurée », ce qui est vrai.
        for (let index = 1; index < FIRST_EURO_STEPS.length; index += 1) {
          const step = FIRST_EURO_STEPS[index] as FirstEuroStep
          const previous = FIRST_EURO_STEPS[index - 1] as FirstEuroStep
          const days = daysBetween(row[previous], row[step])
          if (days === null) continue
          const bucket = samples.get(step) ?? []
          bucket.push(days)
          samples.set(step, bucket)
        }
      }

      const out: Partial<Record<FirstEuroStep, number>> = {}
      for (const [step, values] of samples) {
        const value = median(values)
        if (value !== null) out[step] = value
      }
      return out
    } catch (error) {
      this.logger.error('first-euro medians failed', { error })
      return {}
    }
  }

  /** Combien de missions closes l'espace a produites — le dénominateur du seuil. */
  private async closedMissionCount(workspaceId: string): Promise<number> {
    try {
      const rows = (await this.accounts.manager.query(
        `SELECT COUNT(*)::int AS total FROM missions WHERE workspace_id = $1 AND status = ANY($2::text[])`,
        [workspaceId, [...CLOSED_MISSION_STATUSES]],
      )) as Array<{ total: number }>
      return rows[0]?.total ?? 0
    } catch (error) {
      this.logger.error('first-euro closed mission count failed', { error })
      // Zéro fait REFUSER l'estimation, jamais fabriquer une médiane sur une
      // lecture ratée. Le côté prudent de l'erreur.
      return 0
    }
  }
}

/** Le nombre de jours PLEINS entre deux jalons, ou `null` si l'un manque ou si
 *  l'ordre est inversé. */
function daysBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.round((end - start) / 86_400_000)
}

/** La médiane d'un échantillon, arrondie au dixième. `null` sur un échantillon
 *  vide — un tableau vide n'a pas de milieu. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0)
  return Math.round(value * 10) / 10
}
