/**
 * Import universel (27/09/2026) — les colonnes importées sans champ d'accueil
 * (`consultants.extra`) d'une fiche du vivier. Leur contenu est INCONNU (un
 * « TJM achat », un téléphone personnel…) : elles ne sortent qu'en visibilité
 * COMPLÈTE — jamais sous un masque coordonnées ou finance qu'elles
 * contourneraient. `{}` quand rien n'a été importé en plus.
 */
export function importedExtraFor(
  extra: Readonly<Record<string, string>> | null | undefined,
  visibility: { contacts: boolean; finance: boolean },
): { extra: Record<string, string> } | Record<string, never> {
  return visibility.contacts && visibility.finance ? { extra: { ...(extra ?? {}) } } : {}
}
