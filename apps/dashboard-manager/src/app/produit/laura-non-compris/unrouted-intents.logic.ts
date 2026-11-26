/**
 * #1949.23 — décision Louis 13/09 batch 12 : ce que l'écran « Laura — non
 * compris » DIT, en FR et en EN.
 *
 * Il ne calcule rien : l'agrégation, le masquage et le plancher de lecture
 * vivent côté API et côté moteur IA. Les phrases qui INTERPOLENT un nombre
 * vivent ici (un dictionnaire plat ne sait pas interpoler — même raison que
 * `queues.logic.ts`) ; les libellés fixes vivent dans `src/lib/i18n.ts`.
 */

type Lang = 'fr' | 'en'

/** Les trois catégories de `UNROUTED_INTENT_CATEGORIES` (`@bellum/contracts`). */
const LIBELLES_CATEGORIE: Readonly<Record<string, Record<Lang, string>>> = {
  hors_perimetre: { fr: 'Hors périmètre', en: 'Out of scope' },
  capacite_absente: { fr: 'Capacité absente', en: 'Missing capability' },
  intention_incomprise: { fr: 'Intention incomprise', en: 'Intent not understood' },
}

/** Les natures d'écran de `LAURA_CONTEXT_KINDS`, plus `chat` (aucun écran déclaré). */
const LIBELLES_SURFACE: Readonly<Record<string, Record<Lang, string>>> = {
  chat: { fr: 'Laura (plein écran)', en: 'Laura (full screen)' },
  screen: { fr: 'Écran de l’application', en: 'App screen' },
  account: { fr: 'Fiche compte', en: 'Account page' },
  need: { fr: 'Besoin', en: 'Need' },
  invoicing: { fr: 'Facturation', en: 'Invoicing' },
  pilotage: { fr: 'Pilotage', en: 'Pilotage' },
  briefing: { fr: 'Aujourd’hui', en: 'Today' },
}

/** Le libellé d'une catégorie. Inconnue : la valeur telle quelle, jamais un libellé inventé. */
export function libelleCategorie(category: string, lang: Lang): string {
  return LIBELLES_CATEGORIE[category]?.[lang] ?? category
}

/** Le libellé d'une surface. Inconnue : la valeur telle quelle. */
export function libelleSurface(surface: string, lang: Lang): string {
  return LIBELLES_SURFACE[surface]?.[lang] ?? surface
}

/** Le compte de traces : `null` rend un tiret, jamais « 0 » (non mesuré ≠ zéro). */
export function valeurTraces(recorded: number | null): string {
  return recorded === null ? '—' : String(recorded)
}

/** L'état vide des demandes publiées — il NOMME le plancher, jamais « aucune demande ». */
export function phraseAucunePubliee(floor: number, lang: Lang): string {
  return lang === 'en'
    ? `No request has reached the floor of ${floor} distinct occurrences yet.`
    : `Aucune demande n’a encore atteint le plancher de ${floor} occurrences distinctes.`
}

/**
 * La phrase des demandes RETENUES sous le plancher — elle nomme le compte ET le
 * plancher, pour que l'écran ne se lise jamais « rien n'a été demandé ».
 * `null` quand aucune n'est retenue.
 */
export function phraseRetenus(withheld: number, floor: number, lang: Lang): string | null {
  if (withheld <= 0) return null
  if (lang === 'en') {
    return withheld === 1
      ? `1 request not repeated enough yet (fewer than ${floor} distinct occurrences): its text is not shown.`
      : `${withheld} requests not repeated enough yet (fewer than ${floor} distinct occurrences): their text is not shown.`
  }
  return withheld === 1
    ? `1 demande pas encore assez répétée (moins de ${floor} occurrences distinctes) : son texte n’est pas affiché.`
    : `${withheld} demandes pas encore assez répétées (moins de ${floor} occurrences distinctes) : leur texte n’est pas affiché.`
}
