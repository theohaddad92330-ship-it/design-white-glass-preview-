/**
 * #3713.9 — vers où l'on part pour que l'état de travail soit gardé : une FICHE
 * (contact, entreprise). Quitter vers Réglages ou Facturation ne le garde pas :
 * une sélection de contacts ne doit pas survivre à un tout autre travail.
 */
export function isDetailPath(pathname: string): boolean {
  return /^\/(contacts|accounts)\/[^/]+/.test(pathname)
}
