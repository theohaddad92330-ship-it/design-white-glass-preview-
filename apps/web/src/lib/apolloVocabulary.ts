import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

/**
 * Traduction **à l'affichage** du vocabulaire FERMÉ renvoyé par Apollo
 * (`accounts.apollo_enrichment`, `contacts.apollo_enrichment`).
 *
 * Le bloc Apollo est stocké tel quel, en anglais, et le reste ainsi : ce module
 * ne mute JAMAIS la donnée — il se contente de choisir un libellé au rendu.
 * Un dictionnaire déterministe (locales `apollo.json`), aucune traduction
 * automatique, aucune valeur inventée : une valeur absente du dictionnaire est
 * affichée **telle qu'Apollo l'a renvoyée** (jamais vide, jamais devinée).
 *
 * Périmètre = les seuls champs à vocabulaire fermé :
 * `industry`, `latestFundingStage`, `seniority`, `departments`, `functions` et
 * les clés de `departmentalHeadCount`. Le texte libre (`shortDescription`,
 * `headline`, `title`) n'est PAS concerné — il demanderait une variante traduite
 * stockée, c'est un autre chantier.
 *
 * `departments`, `functions` et les clés de `departmentalHeadCount` partagent la
 * même table (`department`) : Apollo puise dans le même vocabulaire pour les
 * trois, et une seule table garantit qu'une valeur ne s'affiche jamais traduite
 * ici et brute là.
 */

type ApolloVocabularyField = 'industry' | 'fundingStage' | 'seniority' | 'department'

/**
 * Valeur Apollo → clé i18n stable : minuscules, `&` épelé, tout autre séparateur
 * (`_`, `-`, `/`, `,`, `.`, `:`…) réduit à une espace simple. Les `.` et `:` sont
 * écrasés à dessein : i18next les lit comme séparateurs de clé / namespace.
 */
export function normalizeApolloValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Mise en forme COSMÉTIQUE d'une valeur machine (`information_technology` →
 * `Information technology`) : underscores en espaces, initiale en majuscule.
 * La valeur reste celle d'Apollo — c'est le repli des surfaces qui l'appliquaient
 * déjà avant le dictionnaire.
 */
export function humanizeApolloValue(value: string): string {
  const cleaned = value.replace(/_/g, ' ').trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : cleaned
}

/**
 * Libellé traduit d'une valeur Apollo, ou `fallback` (par défaut la valeur brute)
 * quand le dictionnaire ne la connaît pas.
 *
 * @param t — `t` lié au namespace `apollo` (voir `useApolloLabel`).
 */
export function apolloLabel(
  t: TFunction,
  field: ApolloVocabularyField,
  value: string,
  fallback: string = value,
): string {
  const key = normalizeApolloValue(value)
  if (!key) return fallback
  return t(`${field}.${key}`, { defaultValue: fallback })
}

/** Hook version: `const label = useApolloLabel(); label('industry', enrichment.industry)`. */
export function useApolloLabel(): (field: ApolloVocabularyField, value: string, fallback?: string) => string {
  const { t } = useTranslation('apollo')
  return (field, value, fallback) => apolloLabel(t, field, value, fallback)
}
