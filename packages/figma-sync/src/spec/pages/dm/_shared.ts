import type { Block, ColorToken, UxNote } from '../../types'

/**
 * Aides PARTAGÉES aux pages du backoffice (`apps/dashboard-manager`). Ce
 * fichier n'est PAS une page : `pages/index.ts` ne l'importe pas, il n'entre
 * pas dans `DM_PAGES`. Il porte deux choses qui reviennent sur les 22 pages
 * du lot c7b :
 *
 * 1. La correspondance entre les composants maison de `src/ui/` (KpiTile,
 *    Stat) et les VRAIS composants du catalogue (`KpiTile`, `Stat` — ajoutés
 *    après le lot c7b) : `kpiTile()`/`stat()` restent des aides qui centralisent
 *    UNE fois le calcul de `state` (mesuré/non mesuré) plutôt que de le
 *    répéter sur chacune des ~14 pages qui les appellent.
 * 2. Les deux notes UX « Responsive » exigées par Louis (addenda du
 *    25/09/2026) sur CHAQUE page : le DM cible 1280 / 1440 / 1920 / 2560 /
 *    3440 ET 390 / 360 — produit mobile depuis l'arbitrage Q7 du même jour
 *    (`viewports: ['desktop', 'mobile']`).
 */

/** `'—'` est la seule façon dont ce fichier écrit « non mesuré » : jamais 0, jamais deviné. */
function measuredState(value: string): 'measured' | 'unmeasured' {
  return value === '—' ? 'unmeasured' : 'measured'
}

const DELTA_TONE = { success: 'up', danger: 'down', default: 'flat' } as const

/** KpiTile (`src/ui/KpiTile.tsx`, catalogue `KpiTile`) : label + valeur + delta optionnel + période.
 *  `state` se déduit de la valeur : `'—'` = non mesuré (le composant réel rend `null` en tiret). */
export function kpiTile(
  label: string,
  value: string,
  opts?: { delta?: { text: string; tone: 'success' | 'danger' | 'default' }; period?: string },
): Block {
  return {
    type: 'component',
    component: 'KpiTile',
    props: {
      state: measuredState(value),
      delta: opts?.delta ? DELTA_TONE[opts.delta.tone] : 'none',
      content: { label, value, delta: opts?.delta?.text, period: opts?.period },
    },
  }
}

/** Stat (`src/ui/Stat.tsx`, catalogue `Stat`) : label + valeur, pour les grilles denses — pas de delta, pas de période. */
export function stat(label: string, value: string): Block {
  return { type: 'component', component: 'Stat', props: { state: measuredState(value), content: { label, value } } }
}

/** Une grille de KPI/Stat, colonnes égales — le DM les pose aujourd'hui en `gridTemplateColumns` inline fixe (2, 3, 4 ou 5). */
export function kpiGrid(columns: 1 | 2 | 3 | 4 | 5 | 6 | 12, children: Block[]): Block {
  return { type: 'grid', columns, columnsMobile: 1, gap: '4', children }
}

/** Card (`src/ui/Card.tsx` + `CardHeader.tsx`) → `SectionCard` du catalogue (titre + contenu). */
export function sectionCard(title: string, children: Block[], description?: string): Block {
  return { type: 'component', component: 'SectionCard', props: { content: { title, description } }, children }
}

/** SegmentBar / Sparkline / Heatmap (`src/ui/`) : rendu Figma infidèle (couleurs dynamiques, SVG calculé) → `placeholder`. */
export function chartPlaceholder(label: string, height: 'sm' | 'md' | 'lg' = 'md'): Block {
  return { type: 'placeholder', kind: 'chart', label, height }
}

/**
 * Note de decision « Responsive » — obligatoire sur CHAQUE page du DM
 * (addendum Louis 25/09/2026) : bureau et téléphone (Q7), colonnes de tableau
 * masquées et grille de KPI 4→3 sous 1280, contenu borné (jamais étiré)
 * au-delà de 1920, et ce que la page GAGNE à 2560/3440.
 */
export function responsiveDecision(gain: string): UxNote {
  return {
    kind: 'decision',
    text:
      'Responsive : bureau (1280, 1440, 1920, jusqu’à 2560 et 3440) ET téléphone (390, 360) — le DM est un produit mobile (Q7, Louis 25/09/2026) : ' +
      'coque backoffice (barre du haut, recherche ⌘K plein écran), tableaux à rôles mobiles, filtres en feuille basse. ' +
      'Sous 1280, le tableau masque ses colonnes secondaires et une grille de KPI perd une colonne (4 devient 3, 3 devient 2). ' +
      `Au-delà de 1920, le contenu reste borné (jamais étiré) et ${gain}`,
    source: 'apps/dashboard-manager/src/app/globals.css:114',
  }
}

export const GAIN_MASTER_DETAIL =
  'la page GAGNE un panneau de détail latéral (la ligne sélectionnée, à droite) plutôt qu’un tableau étiré pleine largeur'
export const GAIN_KPI_COLONNE = 'la grille de KPI GAGNE une colonne supplémentaire plutôt que d’étirer chaque tuile'
export const GAIN_ASIDE =
  'le panneau latéral (`aside`) s’ouvre à côté du contenu principal plutôt que de rester en dessous'

/**
 * Note d'écart « Responsive » — le gap RÉEL, aujourd'hui, entre ces largeurs
 * et le code : ni `DataTable` (`src/ui/DataTable.tsx`) ni les grilles de KPI
 * (un `gridTemplateColumns` inline, sans le moindre media query) ne
 * connaissent 1280, 1920, 2560 ou 3440 — seul `.wrap` (`globals.css:114`,
 * `max-width: 1600px`) réagit à la largeur, en centrant, jamais en
 * réorganisant.
 */
export function responsiveEcartTable(): UxNote {
  return {
    kind: 'ecart',
    text:
      'DataTable (`src/ui/DataTable.tsx`) rend toutes ses colonnes sans condition de largeur (aucune logique de ' +
      'priorité/masquage) : à 1280 comme à 1920, le tableau déborde dans son propre conteneur plutôt que de perdre ' +
      'ses colonnes secondaires — et rien ne change au-delà de 1920, `.wrap` ne fait que centrer un contenu à ' +
      'largeur fixe (`globals.css:114`).',
    source: 'apps/dashboard-manager/src/ui/DataTable.tsx:389',
  }
}

export function responsiveEcartKpiGrid(source: `${string}:${number}`): UxNote {
  return {
    kind: 'ecart',
    text:
      'La grille de KPI est un `gridTemplateColumns` fixe posé en style inline, sans le moindre media query : elle ' +
      'ne perd jamais une colonne sous 1280 et ne gagne rien au-delà de 1920 — seul `.wrap` (`globals.css:114`) ' +
      'borne la largeur totale, en centrant, jamais en ajoutant une colonne.',
    source,
  }
}

export const TEXT_MUTED: ColorToken = 'text/muted'
