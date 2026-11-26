import { cn } from '../lib/utils'

/**
 * LA GRAMMAIRE DE LA PASTILLE — une seule, pour tout le produit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER RÉPARE
 * ─────────────────────────────────────────────────────────────────────────
 * Après la migration du 01/09, DEUX composants rendaient un second niveau en
 * pastilles, et ils ne se contredisaient pas seulement sur la taille :
 *
 *   `TabNav variant="pill"`  actif = fond `--bellum-surface-2` + texte accent
 *                            repos = bordure + texte secondaire
 *                            34 px de haut, rayon plein
 *
 *   `FilterChips`            actif = fond `--bellum-primary-500` + blanc
 *                            repos = fond `--bellum-surface-2`
 *                            32 px de haut, rayon 10 px
 *
 * **Le même gris veut donc dire « actif » dans l'un et « au repos » dans
 * l'autre.** Ce n'est pas une divergence de style, c'est une contradiction de
 * sens : sur Missions un onglet gris est celui qu'on regarde, sur la Veille
 * c'est celui qu'on ne regarde pas. Deux pixels de hauteur et un rayon
 * séparaient par ailleurs les deux barres — assez pour qu'on les voie
 * différentes, pas assez pour qu'on les lise différentes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE DE STYLE, ET PAS UN TROISIÈME COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────
 * `TabNav` et `FilterChips` répondent à deux questions différentes et gardent
 * donc leur code : la première sait défiler, porter des liens de route, amener
 * l'onglet actif dans le champ ; la seconde sait compter, se sélectionner à
 * plusieurs et refuser d'écrire « 0 » sur un compte non mesuré. Les fondre
 * ferait un composant qui fait deux métiers.
 *
 * Ce qu'elles doivent partager, c'est le LANGAGE : la même hauteur, le même
 * rayon, la même façon de dire « c'est celui-ci ». Un réglage vit à un seul
 * endroit (GA-26) — c'est ici.
 */

/** `sm` = 28 px (barre dense), `md` = 32 px (défaut du produit). */
export type ChipSize = 'sm' | 'md'

const SIZES: Record<ChipSize, string> = {
  sm: 'h-7 gap-1.5 px-2.5 text-xs',
  md: 'h-8 gap-2 px-3 text-sm',
}

/**
 * Ce qui ne change jamais : la forme, le plancher tactile, l'anneau de focus.
 *
 * ⚠️ `pointer-coarse:min-h-11` ne joue QUE sous un pointeur grossier (GA-30).
 * Au clavier et à la souris la pastille garde sa hauteur dense — deux réponses
 * au MÊME rendu, jamais une branche `isMobile ?`.
 */
const BASE =
  'inline-flex shrink-0 cursor-pointer items-center rounded-lg font-medium whitespace-nowrap ' +
  'transition-colors outline-none pointer-coarse:min-h-11 ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] focus-visible:ring-offset-1 ' +
  'focus-visible:ring-offset-[var(--bellum-bg)]'

/**
 * L'état ACTIF : un remplissage plein `primary-500` avec `--bellum-on-primary`.
 *
 * ⚠️ Dans les DEUX thèmes, et c'est mesuré. Le réflexe serait de prendre
 * l'accent du thème, mais `--bellum-text-accent` vaut `primary-300` en sombre :
 * c'est une encre, pas un fond, et du blanc dessus donne 2,85:1. `primary-500`
 * + blanc donne 6,37:1 en clair COMME en sombre.
 */
const ACTIVE = 'bg-[var(--bellum-primary-500)] text-[var(--bellum-on-primary)]'

/**
 * L'état de REPOS : un fond CREUX, pas un contour porteur.
 *
 * Sur le fond blanc, `--bellum-border` fait 1,27:1 quand WCAG 1.4.11 exige 3:1
 * pour ce qui délimite un contrôle. Durcir le trait sur les ~1 200 traits du
 * produit était pire que le mal ; le creux répond à la même question sans
 * durcir quoi que ce soit, parce que la bordure cesse d'être la SEULE chose
 * qui dit « ceci se clique ».
 */
const REST =
  // #1824 — « pq le bouton tableau semble disparaitre ». Le creux
  // `--bellum-surface-2` a été calibré pour un contrôle posé sur une CARTE ;
  // sur la page nue il donnait 1,03:1 en clair et 1,3:1 en sombre. La paire
  // `--bellum-chip-rest` est un REMPLISSAGE gris, défini par thème, 8,20:1
  // texte/fond des deux côtés (cf. tokens.css et contrast.test.ts).
  'bg-[var(--bellum-chip-rest)] text-[var(--bellum-chip-rest-text)] ' +
  'hover:bg-[var(--bellum-border-strong)] hover:text-[var(--bellum-text-primary)]'

/** Les classes d'une pastille, actif ou non. LA source du produit. */
export function chipClassName(options: { active: boolean; size?: ChipSize; className?: string }): string {
  const { active, size = 'md', className } = options
  return cn(BASE, SIZES[size], active ? ACTIVE : REST, className)
}

/**
 * Le compteur qu'une pastille porte à droite de son libellé.
 *
 * `tabular-nums` pour que les pastilles ne dansent pas d'un chargement à
 * l'autre. Un chiffre NU, jamais une bulle : la bulle translucide tombait à
 * 4,11:1 sur le remplissage actif, et l'opacifier fait BAISSER le rapport
 * puisque ça éclaircit le fond.
 */
export function chipCountClassName(active: boolean): string {
  return cn('tabular-nums text-xs', active ? 'text-[var(--bellum-on-primary)]' : 'text-[var(--bellum-text-muted)]')
}
