import { cn } from '@bellum/ui'

/**
 * #1846 — « harmonise tous les paddings entre toutes les pages ». La
 * gouttière de page vivait déjà à un seul endroit (`CustomerPageContent.tsx`,
 * `CONTENT_PADDING`) et sa valeur était la bonne — mais rien n'empêchait un
 * écran qui neutralise `contentClassName` (`px-0 ...`, pour reposer sa
 * gouttière section par section : barre d'outils, filtres, onglets…) de
 * RETAPER `'px-4 md:px-6'` à la main plutôt que d'importer la valeur. Mesuré
 * le 10/09/2026 : au moins 54 occurrences hors de ce fichier, dans ~35
 * fichiers — la première cause étant `AccountsPage.tsx` / `AccountContent.tsx`
 * (repose la gouttière 6 fois), `ContactContent.tsx` (5 fois, même famille
 * côté Contacts), `ActionHistoryPage.tsx` (4 fois).
 *
 * Ces trois constantes sont LA seule échelle. Un écran qui a une raison
 * légitime de reposer la gouttière (une barre d'outils collante hors du flux
 * défilant, par exemple) les IMPORTE — il ne les recopie jamais.
 *
 * ⚠️ Vit dans son propre fichier plutôt que dans `CustomerPageContent.tsx` :
 * `PageHeader.tsx` a la même raison de s'aligner sur cette échelle (son
 * entête doit tomber À PLOMB avec le contenu en dessous) et est IMPORTÉ PAR
 * `CustomerPageContent.tsx` — un export réexporté depuis ce dernier aurait
 * fermé un cycle d'imports entre les deux fichiers.
 *
 * Gardée par `apps/web/src/architecture/page-gutter.test.ts` (GA-284) : aucun
 * écran de la coque `CustomerPage` ne peut retaper `px-4 … md:px-6` en dur.
 */

// `px-4` sous 768 px : 16 px de chaque côté d'un écran de 375 px ; `md:px-6`
// au-delà. Le contenu prime sur la respiration quand il n'y a pas de place.
export const PAGE_GUTTER_X = 'px-4 md:px-6'

// Même échelle en gouttière verticale seule — pour les écrans qui neutralisent
// `py-0` et reposent le rythme vertical section par section.
export const PAGE_GUTTER_Y = 'py-4 md:py-6'

// Même échelle exprimée en MARGE — pour un enfant positionné dans une zone
// déjà neutralisée (ex. une Card qui s'aligne seule sur les bords de page,
// plutôt que de recevoir un padding de son parent).
export const PAGE_GUTTER_MX = 'mx-4 md:mx-6'

// Valeur INCHANGÉE (#1846 : l'utilisateur la cite lui-même comme la cible) —
// juste déplacée ici et exportée pour que les écrans qui la retapaient à la
// main (`SettingsPage.tsx`, une seconde coque parallèle à celle-ci)
// l'importent au lieu de la recopier.
export const CONTENT_PADDING = `${PAGE_GUTTER_X} ${PAGE_GUTTER_Y}`

// #1906.7 — la PLEINE PAGE d'un écran qui porte son propre défilement (Laura).
// Elle ne tient que parce que la coque compose l'enveloppe par
// `pageContentClassName` ci-dessous : `p-0` y vaut zéro à TOUS les paliers.
// Gardé par GA-328 (`laura-surface-finish.test.ts`).
export const FULL_BLEED_CONTENT = 'h-full p-0'

// Écart figma-sync — `w-full` seul étirait le contenu sur toute la largeur
// d'un écran 2560/3440px. §5 du design system (D81) : les listes/tableaux
// restent PLEINE LARGEUR, seul le texte suivi est borné à 70ch (`Text`) — ce
// conteneur porte les deux indifféremment, donc il ne peut pas se borner à la
// largeur de lecture. `max-w-[1920px]` est un plafond d'ultra-large, pas une
// largeur de lecture : `mx-auto` centre le surplus au-delà de 1920px, et un
// écran ≤1920px ne le rencontre jamais (rendu inchangé).
const CONTENT_BASE = 'mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col'

/**
 * L'enveloppe de contenu de la coque `CustomerPage`, gouttière comprise — le
 * SEUL endroit où la gouttière de page rencontre le `contentClassName` d'un écran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FONCTION, ET PAS `cn(base, CONTENT_PADDING, contentClassName)`
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 13/09/2026 (#1906.7) : `/chat` demandait `h-full p-0`
 * et gardait 24 px de gouttière au-delà de 768 px. `tailwind-merge` retire
 * `px-4 py-4` — même palier que `p-0` — mais GARDE `md:px-6 md:py-6`, qui sont
 * d'un autre. La branche de finition l'avait corrigé pour /chat seul, en
 * recopiant `md:p-0` ; le même mécanisme touchait huit écrans qui écrivent
 * `px-0` pour reposer leur gouttière section par section (Comptes, Veille,
 * Projets, Besoins ouverts, /actions, /search, Contacts, détail de
 * l'historique) : leur marge de bord doublait sur ordinateur.
 *
 * La règle : un axe sur lequel l'écran écrit un padding SANS palier (`p-*`,
 * `px-*`, `py-*`) ne reçoit AUCUN jeton de la gouttière de page, à aucun palier.
 * L'écran qui veut un palier l'écrit lui-même (`py-4 md:py-8`). Un axe qu'il ne
 * touche pas garde la gouttière entière.
 *
 * Gardé par GA-284 (ter) (`architecture/page-gutter.test.ts`), qui balaie tous
 * les appelants plutôt qu'une liste d'écrans.
 */
export function pageContentClassName(contentClassName?: string): string {
  const own = (contentClassName ?? '').split(/\s+/).filter(token => token.length > 0 && !token.includes(':'))
  const takesX = own.some(token => /^px?-/.test(token))
  const takesY = own.some(token => /^py?-/.test(token))
  return cn(CONTENT_BASE, takesX ? undefined : PAGE_GUTTER_X, takesY ? undefined : PAGE_GUTTER_Y, contentClassName)
}
