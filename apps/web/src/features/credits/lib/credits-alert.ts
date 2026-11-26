import type { UserCredits } from '../api'

/**
 * Le solde CANONIQUE, dérivé à un seul endroit — usage INTERNE (porte, frein doux).
 *
 * #4463 — l'alerte « 80 % consommés » et la pastille de solde sont RETIRÉES :
 * plus aucun crédit visible côté client (décision Louis 22/10/2026). Ne reste que
 * la dérivation du solde, qui ne sert plus qu'à décider si une action est
 * possible — jamais à AFFICHER un nombre.
 *
 * `credits_remaining` quand le serveur le porte ; sinon la soustraction des
 * alias historiques, pour une réponse d'avant la monnaie unique. Jamais un
 * chiffre inventé, jamais un négatif.
 */
export function creditsRemaining(credits: CreditPool): number {
  return typeof credits.credits_remaining === 'number'
    ? Math.max(0, credits.credits_remaining)
    : Math.max(0, (credits.accounts_limit ?? 0) - (credits.accounts_used ?? 0))
}

type CreditPool = Pick<UserCredits, 'accounts_limit' | 'accounts_used' | 'credits_remaining' | 'credits_limit'>
