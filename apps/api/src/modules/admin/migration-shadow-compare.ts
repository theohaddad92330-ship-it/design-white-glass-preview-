/**
 * #2446.7 — LA COMPARAISON QUI MANQUAIT AVANT UNE COUPURE DUAL READ/WRITE.
 *
 * L'épopée #2772 demande une bascule en dual read/write COMPARÉ avant de
 * couper l'ancien chemin sur une migration critique. Le double-écriture
 * (écrire aux deux systèmes) est spécifique à CHAQUE migration — il n'y a pas
 * de brique générique à construire là. Ce qui, lui, est générique et
 * manquait entièrement (`git grep` vide sur `shadow-compare`/`dual-write`) :
 * comment décider, à partir des lectures des deux côtés, que la coupure est
 * sûre. C'est cette décision — pas le double-écriture — que ce module porte.
 *
 * Deux fonctions pures, sans I/O : l'appelant (spécifique à sa migration)
 * fournit les paires de lectures ancien/nouveau système, celui-ci dit si
 * elles correspondent et si l'échantillon accumulé autorise la coupure.
 */

interface ShadowCompareMismatch {
  field: string
  oldValue: unknown
  newValue: unknown
}

interface ShadowCompareResult {
  matches: boolean
  mismatches: ShadowCompareMismatch[]
}

/**
 * Compare deux lectures de la MÊME entité sur les champs suivis. Une absence
 * d'un seul côté est un mismatch de présence NOMMÉ — jamais une exception, et
 * jamais confondue avec une divergence de valeur (doctrine : nommer, pas
 * deviner). Deux absences ne divergent pas : il n'y a rien à comparer.
 */
export function compareShadowRead<T extends Record<string, unknown>>(
  oldValue: T | null,
  newValue: T | null,
  fields: readonly (keyof T & string)[],
): ShadowCompareResult {
  if (!oldValue && !newValue) return { matches: true, mismatches: [] }
  if (!oldValue || !newValue) {
    return {
      matches: false,
      mismatches: [
        { field: '__presence__', oldValue: oldValue ? 'present' : 'absent', newValue: newValue ? 'present' : 'absent' },
      ],
    }
  }
  const mismatches: ShadowCompareMismatch[] = []
  for (const field of fields) {
    const left = oldValue[field]
    const right = newValue[field]
    if (left !== right) mismatches.push({ field, oldValue: left, newValue: right })
  }
  return { matches: mismatches.length === 0, mismatches }
}

interface CutoverVerdict {
  ready: boolean
  reason: string
}

/**
 * La coupure n'est JAMAIS déclenchée automatiquement (doctrine : une écriture
 * d'infrastructure passe par une porte) — ce gate dit seulement si les
 * PREUVES accumulées la rendent défendable. Deux refus déterministes : trop
 * peu de comparaisons, ou la moindre divergence — jamais une moyenne, jamais
 * un taux qui tolère un échec.
 */
export function readyForCutover(
  results: readonly ShadowCompareResult[],
  options: { minSamples: number },
): CutoverVerdict {
  if (results.length < options.minSamples) {
    return { ready: false, reason: `échantillon insuffisant : ${results.length}/${options.minSamples} comparaisons` }
  }
  const divergent = results.filter(r => !r.matches).length
  if (divergent > 0) {
    return {
      ready: false,
      reason: `${divergent} comparaison${divergent > 1 ? 's' : ''} divergente${divergent > 1 ? 's' : ''} sur ${results.length} — aucune coupure tant qu’une seule diverge`,
    }
  }
  return { ready: true, reason: `${results.length}/${results.length} comparaisons, 0 divergence` }
}
