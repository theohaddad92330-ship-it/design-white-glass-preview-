import type { SidebarSection } from './items'

/** Minuscules, sans accents : « Préférences » se trouve en tapant « preferences ». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Théo D settings-prefs.N2 — filtre les rubriques de la navigation des Réglages
 * sur leur libellé AFFICHÉ (`label` résout la clé dans la langue active). Une
 * requête vide rend la liste telle quelle (même référence) : rien n'est masqué
 * sans que la personne l'ait demandé.
 */
export function filterSettingsSections(
  sections: SidebarSection[],
  query: string,
  label: (labelKey: string) => string,
): SidebarSection[] {
  const needle = fold(query.trim())
  if (needle === '') return sections
  return sections
    .map(section => ({
      ...section,
      items: section.items.filter(item =>
        [item.labelKey, ...(item.searchKeys ?? [])].some(key => fold(label(key)).includes(needle)),
      ),
    }))
    .filter(section => section.items.length > 0)
}
