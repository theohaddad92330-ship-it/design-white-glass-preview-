import { DEMO_PERSONA_FIRST_NAME } from '@bellum/contracts'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { useAuth } from '@/hooks/useAuth'

/**
 * LE PRÉNOM DE LA PERSONNE CONNECTÉE — un seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HOOK EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Neuf retours du 02/09 demandent le même entête personnalisé, et chacun
 * l'écrit avec un prénom EN DUR — « Tes favoris, Louis », « Tes partenaires,
 * Maëlle », « Ton pipe commercial, Maëlle ». Livrées telles quelles, ces
 * chaînes afficheraient le prénom de quelqu'un d'autre à tous les autres
 * membres de l'espace. Le littéral se corrige ici, une fois.
 *
 * ⚠️ Le calcul EXISTAIT déjà, recopié à l'identique dans trois fichiers
 * (`DashboardHeader`, `PersonalCockpit`, `useDashboardCockpit`) et sous une
 * quatrième forme dans `WelcomeScreen`. Quatre endroits, deux règles : en
 * ajouter neuf en aurait fait treize, et treize copies d'une règle divergent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL REND, ET CE QU'IL NE REND PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le profil d'abord, le début de l'e-mail ensuite, **la chaîne vide sinon**.
 *
 * Pas de « Utilisateur » : un entête qui dit « Tes favoris, Utilisateur » est
 * PIRE que « Tes favoris », parce qu'il annonce une personnalisation qu'il
 * n'a pas — c'est la même faute qu'un « 0 » posé sur une valeur non mesurée.
 * L'appelant reçoit une absence et choisit la formule sans prénom ; il ne
 * reçoit jamais un prénom inventé.
 *
 * Un prénom BLANC (`'   '`) compte pour absent : `||` seul ne voit qu'une
 * chaîne vide, et c'était la divergence entre les quatre copies.
 */
export function useFirstName(): string {
  const { data: profile } = useProfile()
  const { user } = useAuth()
  const { data: credits } = useCredits()

  // Salle démo : on salue la persona, jamais le compte réel du visiteur (R21-FIX, 15/10).
  if (credits?.is_demo === true) return DEMO_PERSONA_FIRST_NAME

  const declared = (profile?.first_name ?? '').trim()
  if (declared) return declared

  // `split('@')[0]` d'une adresse sans arobase rend l'adresse entière : c'est
  // volontaire, une saisie de ce genre est au pire un identifiant lisible.
  const fromEmail = (user?.email ?? '').split('@')[0]?.trim() ?? ''
  return fromEmail
}
