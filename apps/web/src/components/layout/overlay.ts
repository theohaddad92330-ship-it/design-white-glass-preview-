/**
 * THEO-REFONTE-COMPOSANTS — LA grammaire des surcouches globales (GA-26 : elle vit ici).
 *
 * Lue dans les maquettes appliquées (`a/today-jour.html`, `b/l1-laura.html`, `c/*.html`) :
 *
 * - `dialog` : rayon 14 → `rounded-overlay`, filet `border2` → `--bellum-border-strong`, ombre de surcouche ;
 *   `.dialog-head` collant, filet bas, 20 × 24 (17 × 18 au mobile), h2 18 px semibold resserré, croix 32 px
 *   transparente ; `.dialog-body` 24 (18) ; `.dialog-footer` collant, filet haut, 14 × 24, gestes à droite.
 * - `dialog.t-side` : le tiroir de droite, pleine hauteur, `min(460px, 100vw)`, sans rayon.
 * - `.popover-v2` : 315 px, 16 de marge, h3 15 px, phrase 12 px secondaire.
 * - `.menu-label` : l'intertitre de groupe 12 px capitales discrètes.
 *
 * `packages/ui/src` est hors du lot (la coque le tient) : ces classes se COMPOSENT sur `DialogContent`,
 * `SheetContent` et `PopoverContent`, elles ne les réécrivent pas.
 */

/** Le cadre d'une modale : la tête, le corps et le pied portent leurs propres marges. */
export const overlayDialogClassName =
  'gap-0 overflow-hidden rounded-overlay border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-1)] p-0 shadow-overlay'

/** `.dialog-head` — titre à gauche, croix de la primitive à droite (d'où la marge `pr-14`). */
export const overlayHeadClassName =
  'flex shrink-0 items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-[1.125rem] py-[1.0625rem] pr-14 md:px-6 md:py-5 md:pr-14'

/** `.dialog-head h2`. */
export const overlayTitleClassName = 'text-lg font-semibold tracking-tight text-[var(--bellum-text-primary)]'

/** `.dialog-description` — sous le titre ou en tête du corps. */
export const overlayDescriptionClassName = 'text-sm leading-relaxed text-[var(--bellum-text-secondary)]'

/** `.dialog-body`. */
export const overlayBodyClassName = 'min-h-0 flex-1 overflow-y-auto p-[1.125rem] md:p-6'

/** `.dialog-footer` — gestes alignés à droite, à la ligne au mobile. */
export const overlayFootClassName =
  'flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-[var(--bellum-border)] px-[1.125rem] py-3.5 md:px-6'

/** `dialog.t-side` — le tiroir de droite, posé sur `SheetContent` (qui tient déjà la flottaison et le rayon). */
export const overlaySideClassName = 'w-[calc(100%-1.5rem)] gap-0 p-0 sm:max-w-[27.5rem]'

/** `.popover-v2` — panneau ancré (cloche, menus de choix). */
export const overlayPopoverClassName =
  'rounded-overlay border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 text-sm shadow-overlay'

/** `.menu-label` — intertitre d'un groupe de lignes. */
export const overlayGroupLabelClassName =
  'px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--bellum-text-muted)]'
