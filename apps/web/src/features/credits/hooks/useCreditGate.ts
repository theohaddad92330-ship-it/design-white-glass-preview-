import { useCredits } from '@/features/credits/hooks/useCredits'
import { creditsRemaining } from '@/features/credits/lib/credits-alert'

/**
 * Ce que le solde autorise, pour griser un bouton AVANT le clic.
 *
 * #4463 — le gate ne PORTE plus aucun nombre : l'écran n'a pas le droit de
 * l'afficher. Il répond seulement « est-ce possible ? » ; quand non, l'appelant
 * monte `<SoftBrake>` (#4464), jamais un solde ni un lien « recharger ».
 *
 * Sans ce garde, un compte à zéro voyait tous les boutons actifs et découvrait
 * le refus dans un toast d'erreur brut (« le serveur a échoué sans indiquer de
 * raison (erreur 409) ») : le produit faisait cliquer sur ce qu'il allait
 * refuser, puis présentait son propre refus comme une panne.
 *
 * MONNAIE UNIQUE : un crédit vaut UNE action, quelle qu'elle soit. Le MÊME solde
 * autorise donc analyses et enrichissements — `canAnalyze` et `canEnrich` sont
 * la même réponse, gardés séparés uniquement pour la lisibilité des appelants.
 *
 * Deux règles :
 *  · **le doute n'interdit pas** — solde non chargé (ou lecture en échec) ⇒ tout
 *    reste cliquable ; c'est le serveur qui tranche, et un réseau lent ne doit
 *    jamais bloquer un compte qui a des crédits ;
 *  · **la fenêtre expirée bloque tout** — un essai fini n'est pas un solde bas,
 *    c'est un accès fermé.
 */
type CreditGate = {
  /** Le solde est connu (sinon les `can*` valent `true` par défaut). */
  known: boolean
  /** Lancer une analyse est possible. */
  canAnalyze: boolean
  /** Enrichir un contact est possible. Même solde que `canAnalyze`. */
  canEnrich: boolean
  /** L'accès est fermé (fenêtre d'essai / Découverte expirée). */
  locked: boolean
}

export function useCreditGate(): CreditGate {
  const { data } = useCredits()

  if (!data) {
    return {
      known: false,
      canAnalyze: true,
      canEnrich: true,
      locked: false,
    }
  }

  const locked = data.trial_expired === true
  // Le solde canonique — dérivé à UN seul endroit (`lib/credits-alert`), celui-là
  // même que lit le bandeau d'annonce. Deux chemins qui refont la soustraction
  // divergent : c'est ainsi qu'un bouton se grise pendant qu'un compteur, deux
  // centimètres plus loin, affiche encore des crédits.
  const creditsLeft = creditsRemaining(data)
  const spendable = !locked && creditsLeft > 0

  return {
    known: true,
    canAnalyze: spendable,
    canEnrich: spendable,
    locked,
  }
}
