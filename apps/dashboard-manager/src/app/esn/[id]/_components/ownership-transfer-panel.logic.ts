import type { OwnershipTransferPreview } from '@/lib/admin'

/** #4158.33 — ce que le récapitulatif dit, en une phrase : autorisé ou refusé, et pourquoi. */
export function phraseApercu(apercu: OwnershipTransferPreview): { autorise: boolean; texte: string } {
  const { plan } = apercu
  if (!plan.ok) return { autorise: false, texte: plan.message }
  const de = apercu.currentOwner.email ?? apercu.currentOwner.userId
  const vers = apercu.newOwner.email ?? apercu.newOwner.userId
  const pool = plan.movesSubscription
    ? 'L’abonnement et le pool de crédits suivent le nouveau propriétaire, sans qu’aucun compteur ne bouge.'
    : 'Aucun abonnement à déplacer.'
  return {
    autorise: true,
    texte: `${vers} devient propriétaire de ${apercu.workspaceName} ; ${de} devient administrateur. ${pool}`,
  }
}
