import { SETTINGS_SECTIONS } from './items.settings'

/**
 * #4535.3 — des adresses qui n'ont PAS d'entrée de menu mais appartiennent à une entrée : `/settings/shortcuts`
 * ouvre Préférences › Raccourcis, c'est donc « Préférences » qui s'allume (et non plus aucune entrée).
 */
const ACTIVE_ENTRY_OF: Readonly<Record<string, string>> = { '/settings/shortcuts': '/settings' }

/** L'entrée `itemPath` est-elle l'active pour `pathname` ? */
export function isNavActive(itemPath: string, pathname: string): boolean {
  const owner = ACTIVE_ENTRY_OF[pathname]
  if (owner !== undefined) return itemPath === owner
  // `/settings` should only match exactly — its sub-routes have their own items.
  if (itemPath === '/settings') return pathname === '/settings'
  return pathname === itemPath || pathname.startsWith(itemPath + '/')
}

/** Le `to` de l'entrée du menu active pour `pathname`, ou `undefined`. */
export function settingsNavActiveTarget(pathname: string): string | undefined {
  return SETTINGS_SECTIONS.flatMap(section => section.items)
    .map(item => String(item.to ?? ''))
    .find(to => isNavActive(to, pathname))
}
