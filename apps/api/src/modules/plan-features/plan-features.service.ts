import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ALL_PLAN_FEATURES, type PlanFeatureKey } from '@bellum/contracts'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { isTrialExpired } from '../credits/trial-window'
import { normalizePlanKey, type PlanKey } from '../credits/plan-catalog.defaults'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * Ce que le palier de l'appelant OUVRE — le pendant qualitatif des quotas.
 *
 * La résolution est la MÊME que celle de la facturation (`getCredits`) : le plan
 * est celui de l'OWNER du workspace actif, pas celui de l'utilisateur qui parle.
 * C'est ce qui fait qu'un commercial invité sur un espace Growth a les features
 * de Growth sans avoir d'abonnement à lui — dupliquer une autre règle ici
 * ouvrirait deux vérités sur « quel plan s'applique ».
 *
 * Deux principaux existent sur l'API : un utilisateur (session web, token MCP) et
 * une clé d'API (scopée workspace, sans utilisateur). Les deux arrivent au même
 * endroit — l'abonnement de l'owner du workspace.
 */
@Injectable()
export class PlanFeaturesService {
  constructor(
    private readonly planCatalog: PlanCatalogService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
  ) {}

  /** Les features ouvertes à cet utilisateur (via son workspace actif). */
  async featuresForUser(userId: string): Promise<PlanFeatureKey[]> {
    let workspaceId: string | null = null
    try {
      workspaceId = (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
    } catch {
      // Pas de workspace résolu (compte solo d'avant les espaces) : l'abonnement
      // est le sien. Même repli que la facturation.
      return this.featuresForOwner(userId)
    }
    return this.featuresForWorkspace(workspaceId, userId)
  }

  /** Les features ouvertes sur ce workspace — le chemin des clés d'API, qui
   *  n'ont pas d'utilisateur. */
  async featuresForWorkspace(workspaceId: string, fallbackUserId?: string): Promise<PlanFeatureKey[]> {
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    // Un espace de DÉMO montre le produit : le brider n'apprendrait rien au
    // prospect, et rien n'y est facturé de toute façon.
    if (workspace?.is_demo === true) return [...ALL_PLAN_FEATURES]
    const ownerUserId = workspace?.owner_user_id ?? fallbackUserId
    if (!ownerUserId) return []
    return this.featuresForOwner(ownerUserId)
  }

  /** Vrai si la feature est ouverte pour cet utilisateur. */
  async userHas(userId: string, feature: PlanFeatureKey): Promise<boolean> {
    return (await this.featuresForUser(userId)).includes(feature)
  }

  /** Vrai si la feature est ouverte sur ce workspace. */
  async workspaceHas(workspaceId: string, feature: PlanFeatureKey): Promise<boolean> {
    return (await this.featuresForWorkspace(workspaceId)).includes(feature)
  }

  /**
   * #4629.2 — l'essai de l'espace est-il terminé ? La MÊME règle que le bandeau (`trial_expired`, `isTrialExpired`)
   * lue sur l'abonnement du PROPRIÉTAIRE : tout membre, propriétaire compris, voit le même verrou. Une salle de
   * démonstration n'est jamais verrouillée ; sans ligne d'abonnement, on ne ferme pas (jamais un verrou deviné).
   */
  async trialLockedForUser(userId: string): Promise<boolean> {
    let ownerUserId = userId
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
      if (workspace?.is_demo === true) return false
      ownerUserId = workspace?.owner_user_id ?? userId
    } catch {
      // Compte solo d'avant les espaces : l'abonnement est le sien, comme la facturation.
    }
    const row = await this.subscriptions.findOne({ where: { user_id: ownerUserId } })
    return isTrialExpired(row)
  }

  /**
   * Le palier qui s'applique à cet utilisateur — celui de l'OWNER de son
   * workspace actif, résolu comme les features (même repli sur son propre
   * abonnement quand aucun workspace ne se résout).
   *
   * Décision Louis 13/09 batch 13 — plafond selon le plan : le plafond de Laura
   * lit ce palier. `null` quand il n'y a pas de palier LISIBLE (aucune ligne
   * d'abonnement, code inconnu) : jamais un palier deviné. Les features, elles,
   * gardent leur repli `trial` — c'est une règle de facturation, et le plafond
   * de Laura retombe sur le plafond opérateur, pas sur celui de l'essai.
   */
  async planForUser(userId: string): Promise<PlanKey | null> {
    let workspaceId: string
    try {
      workspaceId = (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
    } catch {
      return (await this.subscribedPlan(userId)) ?? null
    }
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    return (await this.subscribedPlan(workspace?.owner_user_id ?? userId)) ?? null
  }

  /**
   * #4016 L7 — le palier d'un ESPACE, sans session (cron de veille) : celui de
   * son owner ; espace introuvable → l'abonnement de `fallbackUserId`. `null`
   * quand il n'y a pas de palier lisible — jamais un palier deviné.
   */
  async planForWorkspace(workspaceId: string, fallbackUserId?: string): Promise<PlanKey | null> {
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    const ownerUserId = workspace?.owner_user_id ?? fallbackUserId
    if (!ownerUserId) return null
    return (await this.subscribedPlan(ownerUserId)) ?? null
  }

  /** Le code de palier porté par l'abonnement de cet owner, normalisé (alias legacy) ; `undefined` s'il n'y en a pas de lisible. */
  private async subscribedPlan(ownerUserId: string): Promise<PlanKey | undefined> {
    const row = await this.subscriptions.findOne({ where: { user_id: ownerUserId } })
    return normalizePlanKey(row?.plan)
  }

  /** Le palier porté par l'abonnement de cet owner → ses features. Un compte sans
   *  ligne d'abonnement lit `trial`, exactement comme la facturation. */
  private async featuresForOwner(ownerUserId: string): Promise<PlanFeatureKey[]> {
    const plan = await this.planCatalog.getOrDefault((await this.subscribedPlan(ownerUserId)) ?? 'trial')
    return [...plan.features]
  }
}
