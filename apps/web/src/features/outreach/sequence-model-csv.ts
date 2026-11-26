/**
 * Théo C sequences-liste (dlg-tpl) — « Créer mon modèle » : le formulaire devient un petit fichier de campagne,
 * lu par la MÊME importation que la bibliothèque (colonnes Campagne · Tier · J+n · Objet · Corps). Aucune route
 * de plus, aucune seconde façon d'écrire un modèle : ce que l'on saisit ici et ce que l'on importe passent par
 * le même analyseur, donc par les mêmes garde-fous (variables inconnues nommées, plafond d'étapes).
 */

export type ModelStepDraft = { day: number; subject: string; body: string }

function cell(value: string): string {
  // CSV : tout champ est entre guillemets, les guillemets sont doublés, les retours à la ligne restent.
  return `"${value.replace(/"/g, '""')}"`
}

/** Les étapes sans message ne comptent pas : une étape facultative laissée vide n'est pas écrite. */
export function modelSteps(steps: readonly ModelStepDraft[]): ModelStepDraft[] {
  return steps.filter(step => step.body.trim() !== '')
}

export function modelToCsv(name: string, steps: readonly ModelStepDraft[]): string {
  const rows = modelSteps(steps).map(step =>
    [name.trim(), '', `J+${Math.max(0, Math.trunc(step.day))}`, step.subject.trim(), step.body.trim()]
      .map(cell)
      .join(','),
  )
  return ['Campagne,Tier,J+n,Objet,Corps', ...rows].join('\n')
}

/** UTF-8 → base64, sans `Buffer` (le navigateur n'en a pas). */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}
