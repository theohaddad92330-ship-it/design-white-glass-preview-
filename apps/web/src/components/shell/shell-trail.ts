import type { TFunction } from 'i18next'
import { Building, FolderOpen, User, Users, type LucideIcon } from 'lucide-react'
import { sectionForPath } from '@/components/navigation/sections'
import { pageTitleKeys } from '@/lib/page-titles'

/**
 * Coque Théo (23/10/2026) — le TITRE et le FIL D'ARIANE d'un écran, dérivés à UN endroit.
 *
 * Deux lecteurs : la barre du haut (`ShellTopbar`, le fil) et l'en-tête de page
 * (`PageHeader`, le titre). Les dériver chacun de son côté, c'est les voir diverger
 * au premier écran ajouté (GA-26).
 */

export type PageBreadcrumb = {
  label: string
  /** Leading icon for the crumb. */
  icon?: LucideIcon
  /** Static route to link to (no params). */
  to?: string
  /** Click handler — use for param routes (e.g. `/accounts/$id`) the generic
   *  `<Link to={string}>` can't express. Takes precedence over `to`. */
  onClick?: () => void
}

// `fallbackTitle` est la marque de l'espace, passée et non lue ici : cette
// fonction est pure, et c'est ce qui permet de la tester sans monter un
// fournisseur. Elle ne sert qu'aux chemins qu'aucune clé ne couvre.
export function resolveTitle(pathname: string, t: TFunction<'nav'>, fallbackTitle: string, override?: string): string {
  if (override) return override
  if (pageTitleKeys[pathname]) return t(pageTitleKeys[pathname]!)
  if (/\/accounts\/[^/]+$/.test(pathname)) return t('pageTitles.accountBrief')
  if (/\/contacts\/[^/]+$/.test(pathname)) return t('pageTitles.contact')
  const match = Object.entries(pageTitleKeys).find(([path]) => pathname.startsWith(path + '/'))
  return match ? t(match[1]) : fallbackTitle
}

/**
 * Detail-page breadcrumbs — a detail route keeps its parent list crumb so the
 * back-link returns to the right listing.
 */
export function resolveBreadcrumbs(pathname: string, t: TFunction<'nav'>, override?: string): PageBreadcrumb[] {
  if (/\/accounts\/[^/]+$/.test(pathname)) {
    return [
      { label: t('items.accounts'), icon: Building, to: '/accounts' },
      { label: override ?? t('pageTitles.accountBrief'), icon: FolderOpen },
    ]
  }
  if (/\/contacts\/[^/]+$/.test(pathname)) {
    return [
      { label: t('items.contacts'), icon: Users, to: '/contacts' },
      { label: override ?? t('pageTitles.contact'), icon: User },
    ]
  }
  return []
}

/**
 * Le fil de la barre du haut (`.breadcrumb` de la maquette : « Actions › Automatisations »,
 * « Ma journée › Pilotage », « Ma journée » seul).
 *
 * Ordre de priorité : le fil que l'écran DÉCLARE ; celui d'une page de détail ; sinon la
 * section du modèle, suivie de l'onglet (ou du titre) quand on n'est pas sur sa racine.
 */
export function shellTrail(
  pathname: string,
  t: TFunction<'nav'>,
  fallbackTitle: string,
  declared?: { breadcrumbs?: PageBreadcrumb[]; pageTitle?: string },
): PageBreadcrumb[] {
  if (declared?.breadcrumbs && declared.breadcrumbs.length > 0) return declared.breadcrumbs
  const detail = resolveBreadcrumbs(pathname, t, declared?.pageTitle)
  if (detail.length > 0) return detail
  const match = sectionForPath(pathname)
  if (!match) return [{ label: resolveTitle(pathname, t, fallbackTitle, declared?.pageTitle) }]
  const section = match.section
  const sectionLabel = t(section.labelKey)
  const atRoot = pathname === section.to
  const tab = section.tabs.find(candidate => candidate.to !== section.to && candidate.to === pathname)
  const leaf = declared?.pageTitle ?? (tab ? t(tab.labelKey) : atRoot ? sectionLabel : resolveTitle(pathname, t, ''))
  if (!leaf || leaf === sectionLabel) return [{ label: sectionLabel }]
  return [{ label: sectionLabel, to: section.to }, { label: leaf }]
}
