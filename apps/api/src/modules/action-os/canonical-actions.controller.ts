import { Controller, Get, Logger, UseGuards } from '@nestjs/common'
import {
  canonicalActionFromCallTask,
  canonicalActionFromIntervention,
  canonicalActionFromPlanItem,
  canonicalActionFromTask,
  mergeCanonicalActions,
  type CanonicalAction,
  type ListCanonicalActionsResponse,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { OutreachMessageService } from '../outreach/outreach-message.service'
import { PlaybooksService } from '../playbooks/playbooks.service'
import { TasksService } from '../tasks/tasks.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'

type Origin = ListCanonicalActionsResponse['unavailable'][number]

/**
 * #2395 — l'objet Action canonique, en LECTURE : mes actions ouvertes, quelle
 * que soit leur maison (plan de Laura, tâches, appels, interventions du
 * responsable), projetées dans UN contrat (`packages/contracts/src/schemas/action.ts`).
 *
 * L'orchestration de quatre domaines vit ICI, dans un contrôleur : c'est la
 * couche où un geste utilisateur traverse légitimement plusieurs modules (GA-07)
 * — aucun service ne va chercher le service d'un voisin.
 *
 * Cloisonnement : l'espace est RÉSOLU côté serveur (`resolveActiveWorkspace`) et
 * passé à chaque lecture, qui filtre déjà sur lui ; rien ne vient du client.
 * Rien n'est écrit : chaque action se modifie dans sa maison native
 * (`origin`), jamais dans une copie.
 */
@Controller('action-os')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CanonicalActionsController {
  private readonly logger = new Logger(CanonicalActionsController.name)

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    private readonly planItems: ActionPlanItemsService,
    private readonly tasks: TasksService,
    private readonly outreach: OutreachMessageService,
    private readonly playbooks: PlaybooksService,
  ) {}

  // Lecture bornée à l'espace résolu server-side, rien d'écrit (GA-05, D39).
  @Get('actions')
  @WorkspaceRead()
  async list(@CurrentUser() user: CurrentUserPayload): Promise<ListCanonicalActionsResponse> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const unavailable: Origin[] = []
    const read = async (origin: Origin, load: () => Promise<CanonicalAction[]>): Promise<CanonicalAction[]> => {
      try {
        return await load()
      } catch (err) {
        this.logger.warn(`canonical actions: ${origin} unreadable`, {
          error: err instanceof Error ? err.message : String(err),
        })
        unavailable.push(origin)
        return []
      }
    }
    const [plan, tasks, calls, interventions] = await Promise.all([
      read('plan_item', async () =>
        (await this.planItems.listOpenForUser(user.userId, workspaceId)).map(item =>
          canonicalActionFromPlanItem(item, workspaceId),
        ),
      ),
      read('task', async () =>
        (await this.tasks.openForUser(user.userId, workspaceId)).map(task =>
          canonicalActionFromTask(task, workspaceId),
        ),
      ),
      read('call_task', async () =>
        (await this.outreach.listCallTasks({ userId: user.userId, workspaceId, role }))
          // La liste d'outreach est celle de l'ESPACE ; « mes actions » ne garde
          // que les appels dont je suis le porteur.
          .filter(call => call.user_id === user.userId)
          .map(call => canonicalActionFromCallTask(call, workspaceId)),
      ),
      // #2395.10 — la file du responsable (`/briefing`, `DailyGesturesBlock`),
      // quatrième maison. `listInterventions` résout SON espace lui-même —
      // rien d'autre à lui passer que l'utilisateur.
      read('intervention', async () =>
        (await this.playbooks.listInterventions(user.userId)).map(item =>
          canonicalActionFromIntervention(item, workspaceId),
        ),
      ),
    ])
    // L'ordre des maisons illisibles est stable, quel que soit l'ordre d'échec.
    const order: Origin[] = ['plan_item', 'task', 'call_task', 'intervention']
    return {
      actions: mergeCanonicalActions(plan, tasks, calls, interventions),
      unavailable: order.filter(origin => unavailable.includes(origin)),
    }
  }
}
