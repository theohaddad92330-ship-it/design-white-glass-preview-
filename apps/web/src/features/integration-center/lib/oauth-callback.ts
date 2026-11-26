import { CRM_OAUTH_PROVIDERS } from '@bellum/contracts'

/**
 * Lit le résultat d'un aller-retour OAuth dans l'URL de retour
 * (`?<provider>=connected|<autre>&reason=…`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2078.25 — AUCUNE action n'est marquée RÉUSSIE sans confirmation du connecteur
 * ─────────────────────────────────────────────────────────────────────────────
 * Le mot `connected` n'est écrit dans cette URL que par le SERVEUR, après
 * l'échange réel du jeton — jamais par un clic optimiste côté navigateur. Toute
 * autre valeur (refus de l'utilisateur chez le fournisseur, erreur, portée
 * manquante) tombe dans l'échec, jamais dans un succès inventé. Extrait de
 * `IntegrationCenterPage.tsx` pour que cette règle soit vérifiable sans monter
 * toute la page (registre, requêtes, toasts).
 */
// #4185 — les CRM à rappel OAuth viennent du contrat de l'adaptateur commun :
// brancher un CRM de plus ne demande plus de l'ajouter ici à la main.
// #4406.4 — Beeper revient par le même rappel (`?beeper=connected|error`).
const KNOWN_OAUTH_PROVIDERS: readonly string[] = ['google', ...CRM_OAUTH_PROVIDERS, 'notion', 'microsoft', 'beeper']

// Pas exportée : consommée uniquement ici et dans son test, par déstructuration
// (`result.status`, `result.provider`) — un type exporté sans consommateur hors
// fichier échoue `pnpm lint:exports:types` (knip).
type OAuthCallbackResult =
  | { provider: string; status: 'connected' }
  | { provider: string; status: 'failed'; reason: string | null }

export function parseOAuthCallback(search: string): OAuthCallbackResult | null {
  const params = new URLSearchParams(search)
  const hit = KNOWN_OAUTH_PROVIDERS.find(p => params.get(p))
  if (!hit) return null
  const outcome = params.get(hit)
  if (outcome === 'connected') return { provider: hit, status: 'connected' }
  return { provider: hit, status: 'failed', reason: params.get('reason') }
}
