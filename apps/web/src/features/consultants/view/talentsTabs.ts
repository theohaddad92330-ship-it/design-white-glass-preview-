/**
 * Refonte Théo (maquettes `c/talents-vivier` et `c/talents-recrutement`, 23/10/2026) — LES DEUX ONGLETS DE
 * TALENTS : Vivier · Recrutement.
 *
 * #4528.1 (Louis 24/10/2026, revient sur #4502 côté Talents, garde #4349) — « Présentations » n'est plus un
 * onglet de Talents : une présentation (consultant × besoin) ne vit qu'à UN endroit, Affaires › Présentations.
 * Talents garde la personne.
 *
 * Aucune route neuve : l'onglet vit dans l'ANCRE de `/consultants`. Une ancre inconnue — dont l'ancienne
 * `#positionnements`, redirigée en amont par la route — ouvre le Vivier.
 */
export const TALENTS_TABS = ['vivier', 'recrutement'] as const
export type TalentsTab = (typeof TALENTS_TABS)[number]

export function talentsTabFromHash(
  hash: string = typeof window === 'undefined' ? '' : window.location.hash,
): TalentsTab {
  const key = hash.replace(/^#/, '')
  return (TALENTS_TABS as readonly string[]).includes(key) ? (key as TalentsTab) : 'vivier'
}
