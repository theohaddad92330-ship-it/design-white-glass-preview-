import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PLAN_FEATURE_LABELS, TRIAL_LOCK_ERROR, trialLockMessage, type PlanFeatureKey } from '@bellum/contracts'
import { REQUIRE_FEATURE_KEY, REQUIRE_OPEN_TRIAL_KEY } from './require-feature.decorator'
import { PlanFeaturesService } from './plan-features.service'

/** Les deux principaux que porte une requête authentifiée : un utilisateur
 *  (session web, token MCP) ou une clé d'API (scopée workspace, sans user). */
type PrincipalRequest = {
  user?: { userId?: string }
  apiKey?: { workspaceId?: string }
}

/**
 * Refuse (403) une route annotée `@RequireFeature(...)` quand le palier de
 * l'appelant ne porte pas cette feature — le pendant qualitatif du quota de
 * crédits.
 *
 * À poser APRÈS le guard d'identité (`@UseGuards(JwtGuard, PlanFeatureGuard)`) :
 * il lit le principal que celui-ci a posé. Une route sans annotation passe sans
 * être touchée, donc monter ce guard ne ferme jamais un handler par accident.
 *
 * Le refus NOMME la feature manquante (code `feature_not_in_plan` + clé) : c'est
 * ce qui permet à l'app d'afficher « votre offre n'inclut pas X » et de proposer
 * la bonne page de plan, plutôt qu'un 403 muet que le commercial lira comme un
 * bug.
 */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planFeatures: PlanFeaturesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<PlanFeatureKey | undefined>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const openTrial = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_OPEN_TRIAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!feature && !openTrial) return true

    const request = context.switchToHttp().getRequest<PrincipalRequest>()
    const userId = request.user?.userId
    const workspaceId = request.apiKey?.workspaceId

    if (feature) {
      const allowed = userId
        ? await this.planFeatures.userHas(userId, feature)
        : workspaceId
          ? await this.planFeatures.workspaceHas(workspaceId, feature)
          : // Ni user ni clé : ne devrait pas arriver derrière un guard d'identité.
            // On ferme plutôt que de laisser passer un appel non attribuable.
            false

      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'feature_not_in_plan',
          feature,
          message: `Votre offre n'inclut pas « ${PLAN_FEATURE_LABELS[feature].fr} ».`,
        })
      }
    }

    // #4629.2 — le chat et Découvrir coûtent du modèle : un essai terminé les ferme, TOUT membre de l'espace,
    // propriétaire compris (le verrou lit le forfait du propriétaire). Le refus ÉNUMÈRE ce qui reste ouvert et ne
    // porte aucun chiffre de crédits. Une clé d'API n'a pas d'utilisateur : elle garde ses propres portes.
    if (openTrial && userId && (await this.planFeatures.trialLockedForUser(userId))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: TRIAL_LOCK_ERROR,
        message: trialLockMessage('fr'),
      })
    }
    return true
  }
}
