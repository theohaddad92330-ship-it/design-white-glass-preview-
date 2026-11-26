import { normalizeEventText } from '@/features/accounts/model/watchEvents'

/**
 * #3935 (recette prod 12/10) — l'en-tête de la fiche affichait « Île-de-France » (la zone) pendant que
 * l'onglet Profil disait « Localisation : Non renseigné » (la ville lue dans le CV) : deux sources pour
 * UNE information. LE libellé du lieu d'un consultant vit ici (GA-26) — la ville du CV, puis les zones
 * déclarées qu'elle ne dit pas déjà. `null` = VRAIMENT rien : seul cas où l'écran écrit « Non renseigné ».
 */
export function talentPlaceLabel(input: { location?: string | null; zones?: readonly string[] | null }): string | null {
  const parts: string[] = []
  const keys: string[] = []
  for (const raw of [input.location, ...(input.zones ?? [])]) {
    const label = raw?.trim()
    if (!label) continue
    const key = normalizeEventText(label)
    if (!key || keys.some(known => known === key || known.includes(key) || key.includes(known))) continue
    parts.push(label)
    keys.push(key)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}
