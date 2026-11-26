/**
 * Les paliers SANS LICENCE — `trial` et `decouverte`.
 *
 * Ils tenaient lieu d'essai gratuit ; depuis le 02/09/2026 ils sont à zéro
 * crédit et aucun chemin ne mène plus à eux. Ce ne sont plus des fenêtres
 * d'évaluation mais des ÉTATS VERROUILLÉS : un compte neuf, un abonnement
 * résilié. Le seul essai du produit est la salle de démonstration.
 *
 * Miroir de `WINDOWED_PLANS` côté API (`credits.service.ts`). Les deux codes
 * survivent parce que des lignes en base les portent — un code de palier ne
 * disparaît jamais (GA-08) — et parce que l'écran doit pouvoir NOMMER un compte
 * sans licence au lieu de le rabattre sur « Starter ».
 */
const WINDOWED_PLANS = ['trial', 'decouverte'] as const

export function isWindowedPlan(plan: string | null | undefined): boolean {
  return (WINDOWED_PLANS as readonly string[]).includes(plan ?? '')
}
