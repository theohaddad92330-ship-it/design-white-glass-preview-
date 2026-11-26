import type { WorkspaceRole } from '@bellum/contracts'

/** Ce que le planificateur a besoin de savoir — lu par le service, jamais deviné. */
export type OwnershipTransferContext = {
  workspace: { id: string; ownerUserId: string; isDemo: boolean }
  newOwnerUserId: string
  /** Rôle de la cible dans CET espace ; `null` = pas membre. */
  newOwnerRole: WorkspaceRole | null
  /** L'abonnement porté par le propriétaire actuel ; `null` = aucune ligne. */
  currentOwnerSubscription: {
    billingMode: 'stripe' | 'manual'
    plan: string
    accountsLimit: number
    accountsUsed: number
    enrichmentCredits: number
    extraSeats: number
  } | null
  newOwnerHasSubscription: boolean
  /** Autres espaces (hors démo) que chacun possède : le pool est par personne, pas par espace. */
  currentOwnerOtherWorkspaces: number
  newOwnerOtherWorkspaces: number
}

type OwnershipRefusalCode =
  | 'demo_workspace'
  | 'already_owner'
  | 'not_member'
  | 'not_admin'
  | 'stripe_billing'
  | 'target_has_subscription'
  | 'owner_has_other_workspaces'
  | 'target_owns_other_workspace'

export type OwnershipTransferPlan =
  | {
      ok: true
      workspaceId: string
      fromUserId: string
      toUserId: string
      movesSubscription: boolean
      /** Le pool qui change de porteur, tel quel : aucune valeur n'est recalculée. */
      pool: {
        plan: string
        accountsLimit: number
        accountsUsed: number
        enrichmentCredits: number
        extraSeats: number
      } | null
    }
  | { ok: false; code: OwnershipRefusalCode; message: string }

const refuse = (code: OwnershipRefusalCode, message: string): OwnershipTransferPlan => ({ ok: false, code, message })

/**
 * #4158.33 — peut-on transférer la propriété de cet espace, et qu'est-ce qui bouge ?
 * Pure : aucune lecture, aucune écriture. Premier refus rencontré = seul refus nommé.
 */
export function planOwnershipTransfer(ctx: OwnershipTransferContext): OwnershipTransferPlan {
  if (ctx.workspace.isDemo) return refuse('demo_workspace', 'Un espace de démonstration ne change pas de propriétaire.')
  if (ctx.newOwnerUserId === ctx.workspace.ownerUserId) {
    return refuse('already_owner', 'Cette personne est déjà propriétaire de l’espace.')
  }
  if (ctx.newOwnerRole === null) return refuse('not_member', 'Le nouveau propriétaire doit être membre de l’espace.')
  if (ctx.newOwnerRole !== 'admin') {
    return refuse('not_admin', 'Le nouveau propriétaire doit être administrateur de l’espace.')
  }
  const sub = ctx.currentOwnerSubscription
  if (sub?.billingMode === 'stripe') {
    return refuse(
      'stripe_billing',
      'Cet espace est facturé par Stripe : l’abonnement Stripe ne se déplace pas depuis le back-office. Seule la facturation manuelle (sur facture) peut changer de propriétaire ici.',
    )
  }
  if (ctx.currentOwnerOtherWorkspaces > 0) {
    return refuse(
      'owner_has_other_workspaces',
      'L’ancien propriétaire possède un autre espace : le pool de crédits est porté par la personne, il ne se déplace pas sans l’emporter.',
    )
  }
  if (ctx.newOwnerOtherWorkspaces > 0) {
    return refuse('target_owns_other_workspace', 'Le nouveau propriétaire possède déjà un autre espace.')
  }
  if (sub && ctx.newOwnerHasSubscription) {
    return refuse(
      'target_has_subscription',
      'Le nouveau propriétaire porte déjà un abonnement : on ne l’écrase pas. Retire d’abord cette ligne depuis la fiche utilisateur.',
    )
  }
  return {
    ok: true,
    workspaceId: ctx.workspace.id,
    fromUserId: ctx.workspace.ownerUserId,
    toUserId: ctx.newOwnerUserId,
    movesSubscription: sub !== null,
    pool: sub
      ? {
          plan: sub.plan,
          accountsLimit: sub.accountsLimit,
          accountsUsed: sub.accountsUsed,
          enrichmentCredits: sub.enrichmentCredits,
          extraSeats: sub.extraSeats,
        }
      : null,
  }
}
