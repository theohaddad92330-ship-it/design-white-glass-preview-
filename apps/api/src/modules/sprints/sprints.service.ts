import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  canEnterFocus,
  focusCapacityFor,
  taskStillOpenSql,
  shouldSwitch,
  sprintDecisionProblems,
  sprintEntryProblems,
  sprintExitProblems,
  type SprintDecisionFields,
  type SprintEvent,
  type SprintLevel,
  type SprintSwitch,
} from '@bellum/contracts'
import type { AccountOwner } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
// #1318.3 — le prédicat « rien n'est programmé » vient du module comptes et ne
// se réécrit pas : deux formulations divergeraient, et le board d'effort dirait
// le contraire du cockpit sur le même compte. Ce n'est pas un service (GA-07 ne
// compte que les imports service → service), c'est une définition partagée.
import { ACCOUNT_HYGIENE_PREDICATES } from '../accounts/account-hygiene.sql'

export interface SprintBoardAccount {
  id: string
  company_name: string
  sprint: SprintLevel
  sprint_entered_at: string | null
  sprint_exit_reason: string | null
  /** Qui a posé ce niveau — #3262 (BEL-SC-233). `null` = bascule automatique
   *  ou compte antérieur à la colonne, jamais deviné. */
  sprint_decided_by: string | null
  /** #3509 — dernier mouvement tracé (`activities.occurred_at`), la source de
   *  la carte « sans mouvement » de /pilotage. `null` = aucune activité connue :
   *  rien ne s'affiche, jamais la date du dernier semis. */
  last_activity_at: string | null
  priority_score: number | null
  commercial_status: string | null
  /** #1318 — une liste d'entreprises se reconnaît. Nullables et jamais devinés. */
  logo_url: string | null
  website: string | null
  /** BEL-SC-228 (#3257) — la décision générique attachée à ce niveau
   *  (`SprintDecisionFields`, `sprintDecisionProblems`). */
  sprint_reason: string | null
  sprint_effort_estimate: string | null
  sprint_review_at: string | null
  sprint_promotion_condition: string | null
  sprint_demotion_condition: string | null
  /** #3257.7a — `accounts.assigned_to` BRUT, jamais affiché tel quel : c'est
   *  ce champ que `SprintsController.board()` résout en `owner` (voir plus
   *  bas), via `AccountsService.resolveOwners` — ce service-ci ne porte que
   *  l'id, GA-07 lui interdisant d'importer le service des comptes. */
  owner_id: string | null
  /** #3257.7a — LE PORTEUR, résolu. `null` tant que le contrôleur ne l'a pas
   *  posé (ou compte libre, une vraie réponse) — `board()` ne le remplit
   *  jamais lui-même, voir `owner_id` juste au-dessus. */
  owner: AccountOwner | null
  /** #3257.7b — le TITRE de la prochaine tâche ouverte à venir. `null` = rien
   *  n'est programmé (une vraie réponse : la carte le dit, elle n'invente rien). */
  next_task_title: string | null
  /** #3257.7b — son échéance (`YYYY-MM-DD`). */
  next_task_due_on: string | null
  /** #3257.4 — le partenaire lié (`account_partners`), `null` = aucun n'est
   *  déclaré ni détecté : la carte dit « partenaire à désigner ». */
  partner_name: string | null
  /**
   * #3296 (#3269.6) — la PROPOSITION lue à même le board, jamais écrite.
   *
   * `applyEvent('partner_access_found')` existe depuis #3257.8 mais n'avait
   * aucun appelant automatique : rien dans le dépôt n'émettait l'évènement,
   * donc la règle ne se voyait jamais. Plutôt qu'un bus (best-effort, en
   * arrière-plan, invisible tant que rien ne lit son effet), CE signal se
   * dérive au moment de la LECTURE, depuis un fait déjà sur la ligne
   * (`partner_name`, posé par la même sous-requête) : un partenaire est
   * apparu pour ce compte ⇔ l'évènement est vrai maintenant. `shouldSwitch`
   * reste l'unique décision (GA-26) ; `null` si aucune règle ne s'applique
   * (compte déjà en `partner_route`, ou sans partenaire lié).
   */
  suggested_switch: { to: SprintLevel; reason: string } | null
}

export interface SprintBoard {
  focus: SprintBoardAccount[]
  extension: SprintBoardAccount[]
  volume: SprintBoardAccount[]
  no_go: SprintBoardAccount[]
  /** BEL-SC-228 (#3257) — ajoutées EN FIN (GA-08), voir `sprint.ts`. */
  watch: SprintBoardAccount[]
  partner_route: SprintBoardAccount[]
  /** #3296 — les comptes de l'espace SANS niveau posé. Sans eux, un espace dont
   *  aucun compte n'a encore été classé affichait un tableau vide, sans geste. */
  unplaced: SprintUnplacedAccount[]
}

interface SprintUnplacedAccount {
  id: string
  company_name: string
  logo_url: string | null
  website: string | null
  priority_score: number | null
}

/** Plafond de la liste « non placés » : un tri à faire, pas un export. */
const UNPLACED_LIMIT = 50

/**
 * #3296 (#3269.6) — LA PROPOSITION `partner_access_found`, LUE PLUTÔT QU'ÉMISE.
 *
 * `shouldSwitch` refuse `partner_route` en entrée (`level === 'partner_route'`
 * n'est pas dans sa liste) : un compte déjà routé ne se voit jamais proposer
 * d'y aller une deuxième fois. Fonction PURE, testée isolément.
 */
function suggestedSwitchFor(
  row: Pick<SprintBoardAccount, 'sprint' | 'partner_name'>,
): SprintBoardAccount['suggested_switch'] {
  if (!row.partner_name) return null
  const decision = shouldSwitch(row.sprint, 'partner_access_found')
  return decision ? { to: decision.to, reason: decision.reason } : null
}

/**
 * ⚠️ Les colonnes ci-dessous sont VOLONTAIREMENT dupliquées entre `board()` et
 * `move()` (littéral, jamais une constante partagée) : `sprints.spec.ts`
 * (#1318/#1318.3) lit le SOURCE de ce fichier et grep chaque `SELECT … FROM
 * accounts` pour vérifier que `logo_url`/`website`/`priority_score` y sont
 * VRAIMENT — une constante interpolée resterait correcte à l'exécution mais
 * rendrait cette garde aveugle (elle ne lirait plus que `${...}` au lieu des
 * noms de colonnes). Même arbitrage que `isUniqueViolation` plus bas dans ce
 * fichier : dupliqué plutôt que partagé, à dessein.
 */

/**
 * Le board d'effort d'un espace (tome 5, `BEL-SPRINT-001`).
 *
 * Tout le comportement décidable vit dans `@bellum/contracts` (`sprint.ts`) :
 * ce service ne fait que lire, écrire, et APPLIQUER le refus. Le plafond est la
 * seule règle bloquante du produit qui dise non à un geste volontaire — elle
 * mérite d'être au même endroit que sa raison.
 */
@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * Ce qu'un évènement fait au niveau d'effort d'un compte.
   *
   * ⚠️ Les sept règles de `shouldSwitch` étaient écrites, testées, et **n'avaient
   * aucun appelant** — la famille de défauts que les huit tomes ont trouvée
   * partout : du code juste que personne n'appelle. Ce point d'entrée est leur
   * appelant unique, et la règle reste dans le contrat : ce service applique,
   * il ne décide pas.
   *
   * Deux bascules seulement s'appliquent seules, et ce sont les deux qui MONTENT
   * l'effort. Descendre l'effort d'un compte à la place du commercial, c'est
   * décider à sa place d'abandonner — celles-là sont RENDUES pour être
   * proposées, jamais écrites.
   *
   * `sourceRef` identifie CE QUI a déclenché l'évènement — l'id de l'action au
   * journal d'activité, par exemple. Il porte l'idempotence : rejouer la MÊME
   * cause (retry réseau, webhook redélivré) ne bascule pas une seconde fois.
   *
   * ⚠️ D461 : la clé n'est délibérément PAS `(accountId, event)` seul — deux VRAIES
   * réponses positives, à des semaines d'écart sur le même compte, doivent
   * basculer deux fois. C'est le piège d'un `jobId` déterministe qui ne borne
   * pas par l'OCCURRENCE — voir la fiche mémoire `deterministic-jobid-trap`.
   * L'unicité est portée par la BASE (`sprint_switches_dedupe_idx`, sur les
   * trois colonnes), pas par une lecture applicative avant écriture : deux
   * appels concurrents liraient tous deux une table vide avant que l'un
   * n'écrive. Une violation d'unicité n'est donc pas une erreur : c'est le
   * rejeu d'une cause déjà traitée, et on relit l'état ACTUEL du compte — s'il
   * a été corrigé à la main depuis, cette correction survit au rejeu.
   */
  async applyEvent(
    workspaceId: string,
    accountId: string,
    event: SprintEvent,
    sourceRef: string,
  ): Promise<{ applied: boolean; switch: SprintSwitch | null; level: SprintLevel | null }> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: ['id', 'sprint'],
    })
    if (!account) throw new NotFoundException('Compte introuvable.')
    const level = (account.sprint ?? null) as SprintLevel | null
    // Un compte qui n'est sur aucun niveau n'a pas de bascule : l'y poser
    // d'office ferait entrer dans le board des comptes que personne n'y a mis.
    if (!level) return { applied: false, switch: null, level: null }

    const decision = shouldSwitch(level, event)
    if (!decision) return { applied: false, switch: null, level }
    if (!decision.automatic) return { applied: false, switch: decision, level }

    // Le plafond du Focus vaut aussi pour une bascule automatique : une bonne
    // nouvelle ne fait pas sauter la seule règle bloquante du produit. Refusée,
    // elle redevient une PROPOSITION plutôt que de disparaître.
    //
    // ⚠️ `planRequired`, lui, ne bloque PAS ici — volontairement. Bloquer une
    // bascule automatique parce que le compte n'a pas de plan reviendrait à
    // faire porter à l'absence de plan une décision que l'utilisateur n'a pas
    // prise : une réponse positive ou un rendez-vous obtenu doit continuer de
    // faire avancer le compte. Seul `move()` (geste manuel) applique
    // `sprintEntryProblems`. Si ce comportement doit changer un jour, c'est un
    // arbitrage produit à trancher séparément, pas une déduction du code.
    if (decision.to === 'focus') {
      const board = await this.board(workspaceId)
      if (!canEnterFocus(board.focus.length).allowed) {
        return { applied: false, switch: { ...decision, automatic: false }, level }
      }
    }

    try {
      await this.accounts.manager.transaction(async runner => {
        // La trace d'ABORD : elle porte la clé d'idempotence, et son
        // insertion est ce qui décide — dans la même transaction — si la
        // bascule a lieu.
        await runner.query(
          `INSERT INTO sprint_switches (workspace_id, account_id, event, source_ref, from_level, to_level, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [workspaceId, accountId, event, sourceRef, level, decision.to, decision.reason],
        )
        await runner.query(
          // #3262 (BEL-SC-233) : `sprint_decided_by` retombe à NULL — une
          // bascule automatique n'a pas de commercial derrière la décision,
          // et garder l'auteur du niveau PRÉCÉDENT attribuerait ce mouvement
          // à quelqu'un qui ne l'a pas fait.
          `UPDATE accounts
              SET sprint = $3, sprint_entered_at = now(), sprint_exit_reason = NULL, sprint_decided_by = NULL
            WHERE id = $2 AND workspace_id = $1`,
          [workspaceId, accountId, decision.to],
        )
      })
    } catch (cause) {
      if (!isUniqueViolation(cause)) throw cause
      // Même cause déjà appliquée. On ne rejoue RIEN : on relit l'état actuel
      // du compte, qu'une correction humaine ait eu lieu entre-temps ou non.
      const current = await this.accounts.findOne({
        where: { id: accountId, workspace_id: workspaceId },
        select: ['id', 'sprint'],
      })
      return { applied: false, switch: null, level: (current?.sprint ?? null) as SprintLevel | null }
    }

    return { applied: true, switch: decision, level: decision.to }
  }

  async board(workspaceId: string): Promise<SprintBoard> {
    const rows = await this.accounts.query(
      // #1318.3 — « les cartes ne montrent quasiment que le nom du compte ».
      //
      // `without_next_action` réutilise le prédicat d'hygiène du module comptes
      // (`ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask`) plutôt que d'en réécrire
      // un : deux formulations de « rien n'est programmé » divergeraient, et le
      // board d'effort dirait le contraire du cockpit sur le même compte.
      // C'est le fait qui compte le plus pour arbitrer — un compte en priorité
      // forte sur lequel rien n'est prévu est exactement ce qu'on cherche.
      `SELECT a.id, a.company_name, a.sprint, a.sprint_entered_at, a.sprint_exit_reason,
              a.sprint_decided_by,
              a.priority_score, a.commercial_status, a.logo_url, a.website,
              a.updated_at,
              -- #3509 — « dernière activité » = la MÊME source que la carte « sans mouvement » de /pilotage (\`activities.occurred_at\`) ; \`updated_at\` ne dit que le dernier semis ou la dernière édition de la fiche.
              (SELECT MAX(act.occurred_at) FROM activities act WHERE act.account_id = a.id) AS last_activity_at,
              a.assigned_to AS owner_id, a.sprint_reason, a.sprint_effort_estimate, a.sprint_review_at,
              a.sprint_promotion_condition, a.sprint_demotion_condition,
              (${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask}) AS without_next_action,
              -- #3257.7b — la prochaine tâche ouverte à venir (même définition d'« ouverte » et même horizon que le prédicat ci-dessus).
              (SELECT t.title FROM tasks t WHERE t.account_id = a.id AND ${taskStillOpenSql('t')} AND t.due_on >= CURRENT_DATE ORDER BY t.due_on ASC, t.created_at ASC LIMIT 1) AS next_task_title,
              (SELECT t.due_on FROM tasks t WHERE t.account_id = a.id AND ${taskStillOpenSql('t')} AND t.due_on >= CURRENT_DATE ORDER BY t.due_on ASC, t.created_at ASC LIMIT 1) AS next_task_due_on,
              -- #3257.4 — le partenaire lié : déclaré ou détecté, jamais écarté ; le plus éprouvé (placements) d'abord.
              (SELECT ap.name FROM account_partners ap WHERE ap.account_id = a.id AND ap.workspace_id = a.workspace_id AND ap.relationship = 'partner' AND ap.dismissed_at IS NULL ORDER BY ap.placements DESC, ap.created_at ASC LIMIT 1) AS partner_name
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.sprint IS NOT NULL
        ORDER BY a.sprint_entered_at DESC NULLS LAST, a.company_name ASC`,
      [workspaceId],
    )
    const unplaced = (await this.accounts.query(
      // Les plus prioritaires d'abord ; un score absent ne passe pas devant un score connu.
      `SELECT a.id, a.company_name, a.logo_url, a.website, a.priority_score
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.sprint IS NULL
        ORDER BY a.priority_score DESC NULLS LAST, a.company_name ASC
        LIMIT ${UNPLACED_LIMIT}`,
      [workspaceId],
    )) as SprintUnplacedAccount[]
    const board: SprintBoard = {
      focus: [],
      extension: [],
      volume: [],
      no_go: [],
      watch: [],
      partner_route: [],
      unplaced,
    }
    for (const row of rows as SprintBoardAccount[]) {
      const bucket = board[row.sprint]
      if (bucket) bucket.push({ ...row, owner: null, suggested_switch: suggestedSwitchFor(row) })
    }
    return board
  }

  /**
   * Le plafond du Focus pour CET espace (`focusCapacityFor`, BEL-SC-228) —
   * jamais un « huit pour tout le monde ». Compte les membres de l'espace en
   * SQL direct plutôt que d'importer le module workspace (règle §3.2/GA-07,
   * même geste que `hasAccountPlan` juste en dessous pour `action_plans`).
   */
  async focusCapacity(workspaceId: string): Promise<number> {
    const [row] = (await this.accounts.query(
      'SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id = $1',
      [workspaceId],
    )) as { n: number }[]
    return focusCapacityFor(row?.n ?? null)
  }

  /**
   * Déplace un compte, ou refuse.
   *
   * Quatre refus, tous volontaires : le plafond du Focus (409 — l'état du
   * board l'empêche), la sortie sans motif (400 — la demande est incomplète),
   * l'entrée en Focus sans plan de compte quand la règle l'exige (400 —
   * `SPRINT_RULES.focus.planRequired`, N15-B), et l'entrée en veille sans
   * condition de réveil (400 — `sprintDecisionProblems`, BEL-SC-228). Les
   * distinguer compte : chacun se corrige par un geste différent.
   *
   * `decision` est la DÉCISION générique (BEL-SC-228, `SprintDecisionFields`) —
   * `undefined`/absent sur chaque champ laisse la colonne INTACTE (un
   * déplacement qui ne précise rien n'efface pas ce qu'un commercial avait
   * déjà écrit), `null` explicite l'efface.
   */
  async move(
    workspaceId: string,
    accountId: string,
    to: SprintLevel,
    reason: string | null,
    decision: Partial<SprintDecisionFields> = {},
    /** L'auteur du geste — #3262 (BEL-SC-233). `null` = non transmis (jamais
     *  deviné). Un geste MANUEL uniquement : `applyEvent` (bascule
     *  automatique) n'a pas de commercial derrière la décision. */
    decidedBy: string | null = null,
  ): Promise<SprintBoardAccount> {
    const problems = sprintExitProblems(to, reason)
    if (problems.length > 0) throw new BadRequestException(problems.join(' '))

    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Ce compte n’existe pas dans cet espace.')

    const decisionProblems = sprintDecisionProblems(to, {
      // La condition de réveil peut arriver dans CE geste (`decision.promotionCondition`)
      // ou avoir déjà été écrite par un geste précédent sur ce même compte —
      // les deux comptent, un commercial ne la retape pas à chaque relecture.
      promotionCondition:
        decision.promotionCondition !== undefined ? decision.promotionCondition : account.sprint_promotion_condition,
    })
    if (decisionProblems.length > 0) throw new BadRequestException(decisionProblems.join(' '))

    if (to === 'focus' && account.sprint !== 'focus') {
      const current = await this.accounts.count({ where: { workspace_id: workspaceId, sprint: 'focus' } })
      const capacity = await this.focusCapacity(workspaceId)
      const admission = canEnterFocus(current, capacity)
      if (!admission.allowed) throw new ConflictException(admission.reason as string)

      // Geste MANUEL uniquement — `applyEvent` (bascule automatique) n'appelle
      // jamais `sprintEntryProblems`, voir sa docstring.
      const hasPlan = await this.hasAccountPlan(accountId)
      const entryProblems = sprintEntryProblems(to, hasPlan)
      if (entryProblems.length > 0) throw new BadRequestException(entryProblems.join(' '))
    }

    const patch: Partial<AccountEntity> = {
      sprint: to,
      sprint_entered_at: new Date(),
      sprint_decided_by: decidedBy,
      // Le motif appartient à la SORTIE : le garder en montant ferait
      // réapparaître « pas de budget » sur un compte qu'on vient de rouvrir.
      sprint_exit_reason: to === 'no_go' ? (reason ?? null) : null,
    }
    if (decision.reason !== undefined) patch.sprint_reason = decision.reason
    if (decision.effortEstimate !== undefined) patch.sprint_effort_estimate = decision.effortEstimate
    if (decision.reviewAt !== undefined) patch.sprint_review_at = decision.reviewAt ? new Date(decision.reviewAt) : null
    if (decision.promotionCondition !== undefined) patch.sprint_promotion_condition = decision.promotionCondition
    if (decision.demotionCondition !== undefined) patch.sprint_demotion_condition = decision.demotionCondition

    await this.accounts.update({ id: accountId, workspace_id: workspaceId }, patch)
    const [updated] = (await this.accounts.query(
      `SELECT a.id, a.company_name, a.sprint, a.sprint_entered_at, a.sprint_exit_reason,
              a.sprint_decided_by,
              a.priority_score, a.commercial_status, a.logo_url, a.website,
              a.updated_at,
              -- #3509 — « dernière activité » = la MÊME source que la carte « sans mouvement » de /pilotage (\`activities.occurred_at\`) ; \`updated_at\` ne dit que le dernier semis ou la dernière édition de la fiche.
              (SELECT MAX(act.occurred_at) FROM activities act WHERE act.account_id = a.id) AS last_activity_at,
              a.assigned_to AS owner_id, a.sprint_reason, a.sprint_effort_estimate, a.sprint_review_at,
              a.sprint_promotion_condition, a.sprint_demotion_condition,
              (${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask}) AS without_next_action,
              -- #3257.7b — la prochaine tâche ouverte à venir (même définition d'« ouverte » et même horizon que le prédicat ci-dessus).
              (SELECT t.title FROM tasks t WHERE t.account_id = a.id AND ${taskStillOpenSql('t')} AND t.due_on >= CURRENT_DATE ORDER BY t.due_on ASC, t.created_at ASC LIMIT 1) AS next_task_title,
              (SELECT t.due_on FROM tasks t WHERE t.account_id = a.id AND ${taskStillOpenSql('t')} AND t.due_on >= CURRENT_DATE ORDER BY t.due_on ASC, t.created_at ASC LIMIT 1) AS next_task_due_on,
              -- #3257.4 — le partenaire lié : déclaré ou détecté, jamais écarté ; le plus éprouvé (placements) d'abord.
              (SELECT ap.name FROM account_partners ap WHERE ap.account_id = a.id AND ap.workspace_id = a.workspace_id AND ap.relationship = 'partner' AND ap.dismissed_at IS NULL ORDER BY ap.placements DESC, ap.created_at ASC LIMIT 1) AS partner_name
         FROM accounts a WHERE a.id = $1`,
      [accountId],
    )) as SprintBoardAccount[]
    return { ...updated, owner: null, suggested_switch: suggestedSwitchFor(updated) } as SprintBoardAccount
  }

  /**
   * Un compte a-t-il un plan de compte ?
   *
   * Même prédicat que celui du module comptes (« au moins une ligne dans
   * `action_plans` »), relu ici en SQL direct plutôt qu'en important le
   * service du module comptes — la règle §3.2 (GA-07) compte les imports
   * service→service, et ce module vient JUSTEMENT d'en être découplé.
   */
  private async hasAccountPlan(accountId: string): Promise<boolean> {
    const [row] = (await this.accounts.query(
      'SELECT EXISTS (SELECT 1 FROM action_plans WHERE account_id = $1) AS has_plan',
      [accountId],
    )) as { has_plan: boolean }[]
    return Boolean(row?.has_plan)
  }
}

/** `23505` = violation d'unicité côté Postgres. Le code voyage sur l'erreur du
 *  driver ; TypeORM l'expose tel quel sur `QueryFailedError`. Même détecteur
 *  que `credit-reservation.service.ts` — dupliqué plutôt que partagé, comme
 *  `contacts.service.ts` le fait déjà pour la même raison ailleurs dans ce
 *  dépôt : un import cross-module pour six lignes pures coûterait plus qu'il
 *  ne rendrait. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown; driverError?: { code?: unknown } }).code
  const driverCode = (error as { driverError?: { code?: unknown } }).driverError?.code
  return code === '23505' || driverCode === '23505'
}
