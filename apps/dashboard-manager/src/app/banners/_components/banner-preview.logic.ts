/**
 * La correspondance variante → couleur, à UN SEUL ENDROIT (#1667.2a, GA-26).
 *
 * Avant ce fichier, `banner-form.tsx` portait sa PROPRE liste de couleurs
 * (`VARIANTS`, avec un `color: 'var(--accent)'` recopié à la main par ligne) —
 * exactement ce que l'issue proscrivait : « pas une prévisualisation
 * approximative ». Le vrai `BannerBar` (`apps/web/src/features/banners/
 * BannerBar.tsx`) porte la MÊME correspondance sémantique avec SES tokens
 * (`--bellum-primary-500`, `--bellum-success`, `--bellum-warning`,
 * `--bellum-danger`) — absents de ce paquet, qui a les siens depuis toujours
 * (`globals.css`). Reproduire fidèlement veut donc dire : la même
 * correspondance VARIANTE → RÔLE sémantique, avec les tokens QUI EXISTENT ici.
 *
 * ⚠️ La factorisation en un composant PARTAGÉ (`packages/ui`) reste À FAIRE —
 * elle exigerait de déplacer `BannerBar` hors d'`apps/web`, hors du périmètre
 * de ce lot (voir le rapport du chantier).
 */
export const BANNER_VARIANTS = ['info', 'success', 'warning', 'critical'] as const
export type BannerVariant = (typeof BANNER_VARIANTS)[number]

export const VARIANT_COLOR: Readonly<Record<BannerVariant, string>> = {
  info: 'var(--accent)',
  success: 'var(--green)',
  warning: 'var(--amber)',
  critical: 'var(--red)',
}
