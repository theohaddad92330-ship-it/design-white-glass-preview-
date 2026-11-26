/**
 * #4989.2 — les LIEUX d'implantation d'un compte (villes des établissements du registre et des sites de
 * l'analyse), portés par la ligne de la liste pour que le filtre « Zone » juge aussi les implantations,
 * pas seulement la ville du siège. Aucune collecte neuve : on relit `raw_analysis` (#5008).
 */
const MAX_PLACES = 40

/** Sous-requête (alias `account`) : tableau JSON des villes de `branches` et `sites_france`. */
export const IMPLANTATION_PLACES_SQL = `(
  SELECT jsonb_agg(DISTINCT trim(src.elem ->> 'city'))
  FROM (
    SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(account.raw_analysis -> 'branches') = 'array'
      THEN account.raw_analysis -> 'branches' ELSE '[]'::jsonb END) AS elem
    UNION ALL
    SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(account.raw_analysis -> 'sites_france') = 'array'
      THEN account.raw_analysis -> 'sites_france' ELSE '[]'::jsonb END)
  ) src
  WHERE trim(coalesce(src.elem ->> 'city', '')) <> ''
)`

/** Villes distinctes (casse ignorée), ou `undefined` : une source absente n'invente aucun lieu. */
export function implantationPlaces(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Map<string, string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const city = item.trim()
    if (city && !seen.has(city.toLowerCase())) seen.set(city.toLowerCase(), city)
  }
  return seen.size === 0 ? undefined : [...seen.values()].slice(0, MAX_PLACES)
}
