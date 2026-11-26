/**
 * #4284.24 (#4279.1) — « Qualifier » depuis une ligne de besoin ou de partenaire passe par la liste AFFICHÉE.
 * Quand le SIREN n'y est plus (recherche relancée, compte masqué, filtre), le geste restait muet : l'issue est
 * donc un résultat nommé que l'écran traduit en message, jamais un `if` sans `else`.
 */
type QualifyOutcome<T> = { kind: 'analyze'; candidate: T } | { kind: 'missing' }

export function resolveQualifyTarget<T>(candidates: ReadonlyMap<string, T>, siren: string): QualifyOutcome<T> {
  const candidate = candidates.get(siren)
  return candidate ? { kind: 'analyze', candidate } : { kind: 'missing' }
}
