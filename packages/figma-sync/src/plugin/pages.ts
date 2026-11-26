/**
 * Les pages du fichier Figma, dans l'ordre. `---` est un séparateur (Figma
 * l'affiche comme un trait). `Nouveautés` (point 3) est le fil des derniers
 * commits touchant les surfaces maquettées, plus récent en tête — dessinée
 * depuis `generated/feed.json`, jamais retirée d'une synchronisation à
 * l'autre (append-only). `Components` est l'index, une page par famille
 * suit ; `Templates` porte les gabarits, `Rules (UX)` les notes des pages. Les
 * pages de maquettes (`App — Comptes`, `Site`, `DM — …`) se créent à la suite.
 */
export const FIGMA_PAGES = [
  'Cover',
  'Nouveautés',
  'Getting Started',
  'Foundations',
  '---',
  'Components',
  'Components — Actions',
  'Components — Formulaires',
  'Components — Données',
  'Components — Navigation',
  'Components — Retours',
  'Components — Surfaces',
  'Components — Identité',
  'Templates',
  'Rules (UX)',
] as const
