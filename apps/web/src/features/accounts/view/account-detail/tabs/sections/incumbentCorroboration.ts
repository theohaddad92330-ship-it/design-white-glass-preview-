import { esnObservedPathsRange, type EsnObservedPathsRange, type MarketEsnObserved } from '@bellum/contracts'

/**
 * #1607.3 — LA CORROBORATION DES ESN EN PLACE PAR LA MÉMOIRE MARCHÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE FONCTION FAIT, ET CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ESN nommée par l'analyse (`raw_analysis.competitors[]`) ET observée dans
 * le corpus de parcours se dit plus SÛREMENT qu'une ESN nommée seule. Ce n'est
 * PAS une fusion : `IncumbentEsnCard` continue de rendre le constat de
 * l'analyse tel quel, cette fonction ajoute seulement un fait ANNEXE — combien
 * de parcours corroborent ce nom, s'il y en a assez pour en dire quelque chose.
 *
 * ⚠️ **Le plancher et la fourchette viennent du contrat** (`esnObservedPathsRange`,
 * GA-26) — jamais recopiés. Renversement DATÉ du 11/10/2026 (#4016 L10) : sous
 * le seuil transverse (3) la fonction ne se tait plus, elle dit « 1-2 parcours »
 * (jamais le compte exact, qui se lirait comme une mesure). Elle ne rend `null`
 * que pour « la mémoire ne dit rien » — pas « zéro corroboration » : un `0`
 * affiché affirmerait qu'on a cherché et rien trouvé.
 *
 * ⚠️ **Le rapprochement par nom est VOLONTAIREMENT conservateur.** Contrairement
 * à `marketMatchKey` côté API (qui retire les formes juridiques — « Groupe SII »
 * = « SII »), cette normalisation ne fait que replier accents/casse/espaces :
 * elle sous-corrobore (elle rate « Groupe SII » ↔ « SII ») plutôt que de
 * sur-corroborer deux entreprises différentes qui partagent un mot générique.
 * Un signal de corroboration AFFICHÉ, jamais une fusion de fiches, la surface
 * d'erreur tolérable n'est pas la même : un faux négatif est un signal en
 * moins, un faux positif est un fait FAUX affirmé au commercial.
 *
 * ⚠️ **Ceci ne peut JAMAIS produire un NO-GO par absence.** La fonction ne
 * renvoie qu'un nombre positif ou `null` — jamais un booléen « pas confirmé »,
 * jamais une chaîne « absent de la mémoire ». Une absence d'observation
 * n'est PAS un « non » : c'est simplement une carte qui ne dit rien de plus.
 */
function normalizeForCorroboration(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Comment dire le nombre de parcours qui corroborent ce nom, ou `null` :
 *  - le nom est vide ;
 *  - aucune entrée observée ne rapproche ce nom ;
 *  - l'entrée trouvée n'a aucun parcours.
 *
 * Les trois cas sont indiscernables à dessein : dans les trois, la mémoire
 * marché n'a rien à dire sur ce nom, et le seul geste correct est le SILENCE.
 */
export function corroboratingPaths(
  competitorName: string,
  observed: readonly MarketEsnObserved[] | undefined,
): EsnObservedPathsRange | null {
  const key = normalizeForCorroboration(competitorName)
  if (!key || !observed || observed.length === 0) return null

  const hit = observed.find(entry => normalizeForCorroboration(entry.esnName) === key)
  return hit ? esnObservedPathsRange(hit.persons) : null
}
