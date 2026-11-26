import { Injectable, Logger } from '@nestjs/common'
import { can } from '@bellum/contracts'
import type {
  DashboardAccountInsight,
  PersonalCockpitResponse,
  PersonalPriority,
  PersonalRelance,
} from '@bellum/contracts'
import { AccountsService } from '../accounts/accounts.service'
import { ActionsService } from '../actions/actions.service'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CockpitPerspectiveService } from './cockpit-perspective.service'
import { shortReason } from './priority-reason'

const MAX_PRIORITIES = 5
const MAX_RELANCES = 8
const MAX_ACCOUNTS = 8
const MAX_MESSAGES = 8

/**
 * The personal cockpit (roadmap §5 — "Seat value UI"): a per-commercial view
 * scoped STRICTLY to the current user inside their active workspace, distinct
 * from the team dashboard. It is a pure read aggregator — it adds no new tables
 * and reuses the existing account / action-plan-item / activity services with an
 * `owner|actor = currentUser` filter, so it never surfaces a colleague's items.
 *
 * ⚠️ PORTÉE — corrigée le 04/09/2026 (#1408). Ce commentaire disait « there is
 * no account→commercial assignment concept, so "mes comptes" is based on the
 * account *creator* (`user_id`) », et c'était vrai le jour où il a été écrit.
 * Ça ne l'était plus : `accounts.assigned_to` existe, `/comptes` filtre dessus
 * et le manager compte la couverture avec. Le cockpit était donc resté seul à
 * répondre « le créateur » quand tout le reste du produit répond « le
 * responsable » — un mot, deux populations. Il lit maintenant le RESPONSABLE.
 * Les relances honorent en plus la délégation explicite (`assigned_to` de
 * l'action), qui est une autre question : porter un compte et devoir une
 * relance dessus ne sont pas la même chose.
 */
@Injectable()
export class PersonalCockpitService {
  private readonly logger = new Logger(PersonalCockpitService.name)

  constructor(
    private readonly accountsService: AccountsService,
    private readonly actionsService: ActionsService,
    private readonly planItemsService: ActionPlanItemsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly perspective: CockpitPerspectiveService,
  ) {}

  async getPersonalCockpit(userId: string): Promise<PersonalCockpitResponse> {
    try {
      const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)

      // Perf 29/09/2026 (`GET /dashboard/me` 4-5 s) — le recul (SQL agrégé, le
      // plus lent) partait APRÈS les six lectures de la page, et le droit
      // financier après lui : trois étages en série. Ils partent maintenant
      // ENSEMBLE : la réponse dure le plus lent, pas la somme. Le recul garde sa
      // tolérance à la panne propre (`undefined` → l'écran masque la perspective
      // au lieu de l'afficher à zéro) ; il ne bloque toujours pas les relances.
      //
      // ⚠️ LE DROIT FINANCIER DE L'APPELANT, RÉSOLU ICI ET PASSÉ PLUS BAS.
      // Cette route ne porte que `JwtGuard` et `@PersonalScope` — ce qui est
      // juste, parce que tout ce qu'elle rend est scopé à `user.userId`. Mais
      // « scopé à moi » n'est pas « lisible par moi » : le facturé et l'encaissé
      // de MES missions restent des champs financiers, que `/delivery` masque à
      // un `sales` sans `finance:read` (#1457). Même dérivation que
      // `InvoiceReadinessController.financeContext` : rôle + permissions
      // supplémentaires, passés à `can`.
      const perspectiveRead = this.workspaceContext
        .extraPermissionsOf(workspaceId, userId)
        .then(extraPermissions =>
          this.perspective.getPerspective(userId, workspaceId, can(role, extraPermissions, 'finance:read')),
        )
        .catch(error => {
          this.logger.warn('personal cockpit: perspective unavailable', { error })
          return undefined
        })

      const [[accounts, accountsTotal, relances, relancesTotal, messages, messagesThisWeek], perspective] =
        await Promise.all([
          Promise.all([
            this.accountsService.listPersonalAccounts(userId, workspaceId),
            // ⚠️ Le KPI ne se déduit PAS de `accounts.length` : cette liste est
            // bornée à 200 lignes, et le compteur se serait figé sur la borne au
            // 201e compte — un plafond qui a l'air d'un chiffre. La liste
            // affiche, la requête compte. Même portée, écrite à un seul endroit
            // (`AccountsService.personalAccountsScope`).
            this.accountsService.countPersonalAccounts(userId, workspaceId),
            this.planItemsService.listPersonalRelances(userId, workspaceId),
            // ⚠️ Même défaut que pour les comptes : les deux tuiles se
            // déduisaient de `relances.length`, borné à 100. Mesuré en production
            // le 31/08/2026 : « 100 relances à faire » était la BORNE, pas le
            // nombre (#1285). La liste affiche, la requête compte.
            this.planItemsService.countPersonalRelances(userId, workspaceId),
            this.actionsService.listPersonalMessages(userId, MAX_MESSAGES),
            this.actionsService.countMessagesSince(userId, weekAgo),
          ]),
          perspectiveRead,
        ])

      // Le comptage a échoué : on retombe sur ce qui est RÉELLEMENT affiché
      // (la liste bornée) plutôt que sur un zéro. Sous-estimé, jamais inventé.
      const relanceCounts = relancesTotal ?? {
        open: relances.length,
        overdue: relances.filter(relance => relance.overdue).length,
      }

      return {
        kpis: {
          my_accounts: accountsTotal,
          relances_open: relanceCounts.open,
          relances_overdue: relanceCounts.overdue,
          messages_this_week: messagesThisWeek,
        },
        priorities: buildPriorities(accounts, relances),
        relances: relances.slice(0, MAX_RELANCES),
        accounts: accounts.slice(0, MAX_ACCOUNTS),
        messages,
        perspective,
      }
    } catch (error) {
      // Un échec ICI ne se déguise plus en « 0 compte, 0 relance, 0 en retard » :
      // ce repli disait « rien à faire » à un commercial dont on n'a simplement
      // pas pu lire le portefeuille — un zéro qui MENT (GA-18/GA-19, « non
      // mesuré n'est jamais 0 »). Les blocs qui ont leur propre tolérance à la
      // panne (le recul, ligne ~107) gardent la leur ; celui-ci porte les
      // lectures qui comptent vraiment (comptes, relances, messages), et leur
      // échec doit se DIRE — via une erreur — plutôt que se cacher derrière une
      // réponse 200 inventée.
      this.logger.error('Failed to compute personal cockpit', { error, userId })
      throw error
    }
  }
}

/**
 * "Mes priorités" — the next best actions on MY accounts. Relances I owe come
 * first (a dated/overdue action is the sharpest next step), mapped to their
 * account with the relance label as the reason; the hottest of my accounts by
 * score then fill the rest, reasoned by their primary signal / justification.
 * Deduped by account, capped. Only accounts in my personal portfolio qualify —
 * a relance delegated to me on a teammate's account stays in the relance list
 * but does not become one of "my" account priorities.
 */
function buildPriorities(accounts: DashboardAccountInsight[], relances: PersonalRelance[]): PersonalPriority[] {
  const byAccount = new Map(accounts.map(account => [account.id, account]))
  const priorities: PersonalPriority[] = []
  const seen = new Set<string>()

  // 1) My accounts with a pending relance — most urgent first (relances are
  //    already ordered by due_date ASC). Reason = the relance label.
  for (const relance of relances) {
    if (seen.has(relance.account_id)) continue
    const account = byAccount.get(relance.account_id)
    if (!account) continue
    seen.add(relance.account_id)
    priorities.push({
      account_id: account.id,
      company_name: account.company_name ?? 'Compte',
      priority_score: account.priority_score ?? null,
      // Bornée : le libellé d'une relance est une CONSIGNE entière, utile dans
      // sa fiche et illisible dans une liste de priorités — elle s'y faisait
      // couper à mi-mot par la largeur de la colonne.
      reason: shortReason(
        relance.overdue ? `Relance en retard : ${relance.label}` : `Relance à faire : ${relance.label}`,
      ),
      overdue: relance.overdue,
      // Le logo vient du compte déjà chargé — aucune requête de plus.
      logo_url: account.logo_url ?? null,
      website: account.website ?? null,
    })
    if (priorities.length >= MAX_PRIORITIES) return priorities
  }

  // 2) Fill with my hottest scored accounts (already ordered by score desc).
  for (const account of accounts) {
    if (seen.has(account.id)) continue
    if (!hasPriorityScore(account)) continue
    seen.add(account.id)
    priorities.push({
      account_id: account.id,
      company_name: account.company_name ?? 'Compte',
      priority_score: account.priority_score ?? null,
      reason: shortReason(
        account.primary_signal ?? account.priority_justification ?? 'Compte prioritaire à travailler',
      ),
      overdue: false,
      logo_url: account.logo_url ?? null,
      website: account.website ?? null,
    })
    if (priorities.length >= MAX_PRIORITIES) return priorities
  }

  return priorities
}

function hasPriorityScore(account: DashboardAccountInsight): boolean {
  return typeof account.priority_score === 'number' && account.priority_score > 0
}
