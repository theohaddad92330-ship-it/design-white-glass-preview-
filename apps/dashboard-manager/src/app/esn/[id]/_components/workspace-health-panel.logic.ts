import type { HealthDimensionView, HealthReading } from '@bellum/contracts'

/**
 * Libellés FR du verdict de santé produit (#2977) — ce mapping n'existe nulle
 * part ailleurs dans le dépôt : `HealthReading` est un type interne (jamais
 * montré à l'utilisateur), donc aucun i18n client à réutiliser ici.
 */
const LIBELLES_LECTURE: Readonly<Record<HealthReading, string>> = {
  bootstrapping: 'Amorçage',
  healthy: 'Sain',
  watch: 'À surveiller',
  at_risk: 'À risque',
  critical: 'Critique',
}

/**
 * `reading` vaut `'bootstrapping'` (#2406.13) quand `score` est `null` faute
 * d'assez d'axes évalués — jamais affiché comme un espace qui va mal, même
 * geste que « en amorçage » pour `client-health.ts` (#1946.21). `null` reste
 * géré ici défensivement (le type l'autorise) mais `computeWorkspaceHealth`
 * ne le produit plus.
 */
export function libelleLecture(reading: HealthReading | null, missingAxes: number): string {
  if (reading === 'bootstrapping') {
    return `Amorçage — ${missingAxes} axe${missingAxes > 1 ? 's' : ''} manquant${missingAxes > 1 ? 's' : ''} pour un score`
  }
  if (reading === null) {
    return `Pas assez d'axes évalués (${missingAxes} manquant${missingAxes > 1 ? 's' : ''})`
  }
  return LIBELLES_LECTURE[reading]
}

/**
 * Un axe non évaluable ne s'affiche JAMAIS comme un zéro (doctrine) : sa
 * raison est nommée à la place de la valeur.
 */
export function libelleAxe(dimension: HealthDimensionView): string {
  if (dimension.nonEvaluable) {
    return `non mesurable — ${dimension.reason}`
  }
  return `${dimension.value}/100`
}
