import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import type { SavedTeamReview, SaveTeamReview, TeamReviewDecision } from '@bellum/contracts'
import { TeamReviewEntity } from '../../database/entities/team-review.entity'
import { ActionPlanItemsService } from '../actions/action-plan-items.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** La note de contexte que le plan réclame pour déléguer à un collègue (#4158.31). */
const HANDOFF_NOTE = 'Décidé lors du point d’équipe.'

type Result = SavedTeamReview['results'][number]

/**
 * Théo D team-review — « Le point d'équipe » : les décisions du parcours en trois
 * écrans deviennent des ACTIONS DU PLAN des comptes.
 *
 * Trois règles, chacune contre une manière connue de rendre un point d'équipe
 * dangereux :
 *
 * 1. **Mises à jour, jamais dupliquées.** Une décision sur une action déjà au
 *    plan la met à jour ; une décision neuve passe par la porte de création du
 *    plan (`createFromPlan`), qui reconnaît le doublon (compte + libellé + objet)
 *    et le rend `added: false`. Rejouer le même point ne crée donc rien. Il n'y a
 *    pas de seconde clé d'identité ici (GA-26).
 * 2. **Rien ne part, rien ne change d'étape.** Ce service n'a aucune dépendance
 *    vers la messagerie ni vers les affaires : le copilote prépare, le commercial
 *    envoie (doctrine). Le seul effet est une ligne de plan et son compte rendu.
 * 3. **« Point sans nouvelle action »** enregistre le point et sa note, sans
 *    fabriquer de tâche : un fait n'est pas une action.
 *
 * La permission (`team:manage`) est déclarée sur le contrôleur ; l'appartenance
 * des comptes à l'espace est vérifiée par le plan, qui refuse un compte d'ailleurs.
 */
@Injectable()
export class TeamReviewService {
  constructor(
    @InjectRepository(TeamReviewEntity) private readonly reviews: Repository<TeamReviewEntity>,
    private readonly planItems: ActionPlanItemsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async save(userId: string, input: SaveTeamReview): Promise<SavedTeamReview> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    // On vérifie TOUTES les actions existantes avant la première écriture : un
    // point qui échoue au milieu ne doit pas laisser la moitié de ses décisions.
    for (const decision of input.decisions) {
      if (
        decision.existing_item_id &&
        !(await this.planItems.itemInWorkspace(decision.existing_item_id, workspaceId))
      ) {
        throw new NotFoundException('Action plan item not found')
      }
    }

    const results: Result[] = []
    for (const decision of input.decisions) {
      results.push(await this.apply(userId, decision))
    }

    const saved = await this.reviews.save(
      this.reviews.create({
        workspace_id: workspaceId,
        held_by: userId,
        note: input.note ?? null,
        no_new_action: input.no_new_action,
        decisions: results.map(result => ({ ...result })),
      }),
    )
    return { review_id: saved.id, results }
  }

  private async apply(userId: string, decision: TeamReviewDecision): Promise<Result> {
    if (decision.existing_item_id) {
      await this.planItems.update(userId, decision.existing_item_id, {
        due_date: decision.due_date,
        ...this.ownerPatch(userId, decision),
      })
      return { topic_id: decision.topic_id, item_id: decision.existing_item_id, outcome: 'updated' }
    }

    const item = await this.planItems.createFromPlan(userId, {
      account_id: decision.account_id,
      label: decision.label,
      reason: decision.reason,
      due_date: decision.due_date,
      target: null,
    })
    // Le responsable ne se pose qu'à la création : sur un doublon déjà au plan,
    // `createFromPlan` ne réécrit rien — une correction humaine gagne toujours.
    if (item.added) {
      const patch = this.ownerPatch(userId, decision)
      if (patch.assigned_to) await this.planItems.update(userId, item.id, patch)
    }
    return { topic_id: decision.topic_id, item_id: item.id, outcome: item.added ? 'created' : 'updated' }
  }

  /** S'attribuer l'action n'exige rien ; la déléguer à un collègue exige la note de contexte. */
  private ownerPatch(userId: string, decision: TeamReviewDecision): { assigned_to?: string; handoff_note?: string } {
    if (decision.owner_id === userId) return {}
    return { assigned_to: decision.owner_id, handoff_note: HANDOFF_NOTE }
  }
}
